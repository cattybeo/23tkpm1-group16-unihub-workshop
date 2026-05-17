import CircuitBreaker from 'opossum'
import QRCode from 'qrcode'
import { supabase } from '../lib/supabase.js'
import {
  eventBus,
  REGISTRATION_CONFIRMED_EVENT,
  type RegistrationConfirmedEvent,
} from '../infra/event-bus.js'

// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------

export class PaymentUnavailableError extends Error {
  constructor() { super('Payment gateway unavailable'); this.name = 'PaymentUnavailableError' }
}

export class PaymentBusinessError extends Error {
  constructor(msg: string) { super(msg); this.name = 'PaymentBusinessError' }
}

// ---------------------------------------------------------------------------
// Mock payment gateway
// ---------------------------------------------------------------------------

class MockPaymentGateway {
  async charge(_amount: number, ref: string): Promise<{ gateway_ref: string }> {
    // Simulate latency 50–400ms
    await new Promise(r => setTimeout(r, 50 + Math.random() * 350))

    // 5% chance of gateway error (trips circuit breaker)
    if (Math.random() < 0.05) throw new Error('Gateway internal error 500')

    // 2% business failure (card declined — does NOT trip CB)
    if (Math.random() < 0.02) {
      const err = new PaymentBusinessError('Card declined')
      throw err
    }

    return { gateway_ref: `mock_${ref}_${Date.now()}` }
  }
}

// ---------------------------------------------------------------------------
// Circuit breaker (opossum) wrapping mock gateway
// ---------------------------------------------------------------------------

const gateway = new MockPaymentGateway()

const breaker = new CircuitBreaker(
  (amount: number, ref: string) => gateway.charge(amount, ref),
  {
    timeout:                  3000,
    errorThresholdPercentage: 50,
    resetTimeout:             30_000,
    // Business errors (PaymentBusinessError) should NOT trip the CB
    errorFilter: (err: Error) => err.name === 'PaymentBusinessError',
  },
)

breaker.on('open',      () => console.warn('[circuit-breaker] OPEN — payment gateway degraded'))
breaker.on('halfOpen',  () => console.info('[circuit-breaker] HALF-OPEN — testing gateway'))
breaker.on('close',     () => console.info('[circuit-breaker] CLOSED — gateway recovered'))

// ---------------------------------------------------------------------------
// DB types
// ---------------------------------------------------------------------------

interface RegistrationWithWorkshop {
  id:          string
  mssv:        string
  workshop_id: string
  status:      string
  qr_token:    string | null
  expires_at:  string | null
  workshops: {
    fee_vnd: number
  }
}

// ---------------------------------------------------------------------------
// processPayment
// ---------------------------------------------------------------------------

export interface PaymentResult {
  payment_id:  string
  status:      'paid' | 'failed'
  gateway_ref: string | null
  qr_token:    string
  qr_image:    string
}

interface ConfirmPaymentWithOutboxRow {
  payment_id: string
  registration_id: string
  qr_token: string
  notification_id: string
}

export async function processPayment(registrationId: string, userId: string): Promise<PaymentResult> {
  // Fetch registration + workshop fee
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

  const feeVnd   = reg.workshops.fee_vnd

  // Attempt charge via circuit breaker
  let gatewayRef: string | null = null

  try {
    const result = await breaker.fire(feeVnd, registrationId) as { gateway_ref: string }
    gatewayRef = result.gateway_ref

    const { data: payment, error: payError } = await supabase
      .rpc('confirm_registration_payment_with_outbox', {
        p_registration_id: registrationId,
        p_user_id: userId,
        p_amount_vnd: feeVnd,
        p_gateway_ref: gatewayRef,
      })
      .single<ConfirmPaymentWithOutboxRow>()

    if (payError || !payment) {
      throwPaymentConfirmationError(payError)
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

    // Circuit breaker open or timeout → 503, keep pending_payment
    if (e.name === 'OpenCircuitError' || e.name === 'PaymentUnavailableError') {
      throw new PaymentUnavailableError()
    }

    // Business error (card declined) → cancel registration + release seat
    // Atomic: payments insert + registration cancel + seat +1 in one PG transaction.
    if (e.name === 'PaymentBusinessError') {
      const { error: rpcError } = await supabase.rpc('cancel_registration_with_seat_release', {
        p_registration_id: registrationId,
        p_amount_vnd:      feeVnd,
        p_reason:          e.message,
      })

      if (rpcError && !rpcError.message.includes('REGISTRATION_NOT_PENDING')) {
        // REGISTRATION_NOT_PENDING = đã được cron release hoặc flow khác — no-op safe.
        // Lỗi khác phải log để không nuốt im lặng.
        console.error('[payment] cancel_registration_with_seat_release failed:', rpcError.message)
      }

      throw Object.assign(new Error(e.message), { code: 'PAYMENT_FAILED' })
    }

    throw e
  }
}

function throwPaymentConfirmationError(error: { message?: string } | null): never {
  const message = error?.message ?? 'Payment confirmation failed'

  if (message.includes('REGISTRATION_NOT_FOUND')) {
    throw Object.assign(new Error('Registration not found'), { code: 'REGISTRATION_NOT_FOUND' })
  }

  throw new Error(message)
}
