import CircuitBreaker from 'opossum'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase.js'
import {
  eventBus,
  REGISTRATION_CONFIRMED_EVENT,
  type RegistrationConfirmedEvent,
} from '../infra/event-bus.js'
import type { IPaymentGateway, PaymentResult } from '../modules/payment/types.js'
import { PaymentUnavailableError } from '../modules/payment/types.js'

// Re-export types so routes only need one import path
export { PaymentBusinessError, PaymentUnavailableError } from '../modules/payment/types.js'
export type { PaymentResult } from '../modules/payment/types.js'

// ---------------------------------------------------------------------------
// Circuit breaker configuration (exported for tests)
// ---------------------------------------------------------------------------

export const PAYMENT_BREAKER_OPTIONS = {
  timeout:                  3000,
  errorThresholdPercentage: 50,
  resetTimeout:             30_000,
  // Business errors (card declined etc.) must NOT trip the CB
  errorFilter: (err: Error) => err.name === 'PaymentBusinessError',
} as const

export function createPaymentBreaker(
  chargeFn: (amount: number, ref: string) => Promise<{ gateway_ref: string }>,
): CircuitBreaker {
  return new CircuitBreaker(chargeFn, PAYMENT_BREAKER_OPTIONS)
}

// ---------------------------------------------------------------------------
// DB types (private to this module)
// ---------------------------------------------------------------------------

interface RegistrationWithWorkshop {
  id:          string
  mssv:        string
  workshop_id: string
  status:      string
  qr_token:    string | null
  expires_at:  string | null
  workshops: { fee_vnd: number }
}

interface ConfirmPaymentWithOutboxRow {
  payment_id:      string
  registration_id: string
  qr_token:        string
  notification_id: string
}

// ---------------------------------------------------------------------------
// PaymentService — depends on IPaymentGateway (port), not concrete infra
// ---------------------------------------------------------------------------

export class PaymentService {
  private readonly breaker: CircuitBreaker

  constructor(gateway: IPaymentGateway) {
    this.breaker = createPaymentBreaker((amount, ref) => gateway.charge(amount, ref))
    this.breaker.on('open',     () => console.warn('[circuit-breaker] OPEN — payment gateway degraded'))
    this.breaker.on('halfOpen', () => console.info('[circuit-breaker] HALF-OPEN — testing gateway'))
    this.breaker.on('close',    () => console.info('[circuit-breaker] CLOSED — gateway recovered'))
  }

  async processPayment(registrationId: string, userId: string): Promise<PaymentResult> {
    const { data: reg, error: fetchError } = await supabase
      .from('registrations')
      .select('id, mssv, workshop_id, status, qr_token, expires_at, workshops ( fee_vnd )')
      .eq('id', registrationId)
      .single<RegistrationWithWorkshop>()

    if (fetchError || !reg) {
      throw Object.assign(new Error('Registration not found'), { code: 'REGISTRATION_NOT_FOUND' })
    }

    if (reg.status !== 'pending_payment') {
      throw Object.assign(
        new Error(`Registration is already ${reg.status}`),
        { code: 'REGISTRATION_NOT_FOUND' },
      )
    }

    if (reg.expires_at && new Date(reg.expires_at) < new Date()) {
      throw Object.assign(new Error('Registration has expired'), { code: 'REGISTRATION_NOT_FOUND' })
    }

    const feeVnd = reg.workshops.fee_vnd
    let gatewayRef: string | null = null

    try {
      const result = await this.breaker.fire(feeVnd, registrationId) as { gateway_ref: string }
      gatewayRef = result.gateway_ref

      const { data: payment, error: payError } = await supabase
        .rpc('confirm_registration_payment_with_outbox', {
          p_registration_id: registrationId,
          p_user_id:         userId,
          p_amount_vnd:      feeVnd,
          p_gateway_ref:     gatewayRef,
        })
        .single<ConfirmPaymentWithOutboxRow>()

      if (payError || !payment) {
        this.throwPaymentConfirmationError(payError)
      }

      const event: RegistrationConfirmedEvent = { notificationId: payment.notification_id }
      eventBus.emit(REGISTRATION_CONFIRMED_EVENT, event)

      const qrImage = await QRCode.toDataURL(payment.qr_token)

      return {
        payment_id:  payment.payment_id,
        status:      'paid',
        gateway_ref: gatewayRef,
        qr_token:    payment.qr_token,
        qr_image:    qrImage,
      }
    } catch (err) {
      const e = err as Error

      if (e.name === 'OpenCircuitError' || e.name === 'PaymentUnavailableError') {
        throw new PaymentUnavailableError()
      }

      if (e.name === 'PaymentBusinessError') {
        const { error: rpcError } = await supabase.rpc('cancel_registration_with_seat_release', {
          p_registration_id: registrationId,
          p_amount_vnd:      feeVnd,
          p_reason:          e.message,
        })

        if (rpcError && !rpcError.message.includes('REGISTRATION_NOT_PENDING')) {
          console.error('[payment] cancel_registration_with_seat_release failed:', rpcError.message)
        }

        throw Object.assign(new Error(e.message), { code: 'PAYMENT_FAILED' })
      }

      throw e
    }
  }

  private throwPaymentConfirmationError(error: { message?: string } | null): never {
    const message = error?.message ?? 'Payment confirmation failed'

    if (message.includes('REGISTRATION_NOT_FOUND')) {
      throw Object.assign(new Error('Registration not found'), { code: 'REGISTRATION_NOT_FOUND' })
    }

    throw new Error(message)
  }
}
