// Unit tests for payment service.
// Covers blueprint/specs/payment.md acceptance criteria:
//   - Circuit breaker state machine (closed → open after threshold; rejects
//     subsequent calls in <10ms; transitions to half-open after resetTimeout;
//     closes again on a successful probe).
//   - Compensating action on PaymentBusinessError (cancel + seat release RPC).
//   - PAYMENT_UNAVAILABLE when the production breaker is OPEN — pending_payment
//     row stays untouched, no seat restore.

import CircuitBreaker from 'opossum'
import { afterEach, describe, expect, it, vi } from 'vitest'

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  rpc:  vi.fn(),
}))

vi.mock('../lib/supabase.js', () => ({
  supabase: supabaseMock,
}))

import {
  createPaymentBreaker,
  PAYMENT_BREAKER_OPTIONS,
  PaymentService,
} from './payment.service.js'
import {
  PaymentBusinessError,
  PaymentUnavailableError,
} from '../modules/payment/types.js'
import type { IPaymentGateway } from '../modules/payment/types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function singleQuery<T>(result: { data: T | null; error: { message: string } | null }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  }
}

const REGISTRATION_ID = '11111111-1111-1111-1111-111111111111'
const USER_ID         = '22222222-2222-2222-2222-222222222222'
const FEE_VND         = 50_000

function pendingRegRow() {
  return {
    data: {
      id:          REGISTRATION_ID,
      mssv:        'S000001',
      workshop_id: '33333333-3333-3333-3333-333333333333',
      status:      'pending_payment',
      qr_token:    null,
      expires_at:  new Date(Date.now() + 14 * 60_000).toISOString(),
      workshops:   { fee_vnd: FEE_VND },
    },
    error: null,
  }
}

function makeFailingGateway(): IPaymentGateway {
  return { charge: vi.fn().mockRejectedValue(new Error('Gateway 500')) }
}

// ---------------------------------------------------------------------------
// A — Circuit breaker state machine
// Acceptance: "Ép cổng thanh toán trả lỗi 500 liên tục 5 lần. Yêu cầu thứ 6
// nhận phản hồi 'Circuit is open' trong dưới 10ms."
// ---------------------------------------------------------------------------

describe('createPaymentBreaker — state machine', () => {
  it('uses the configured thresholds from spec', () => {
    expect(PAYMENT_BREAKER_OPTIONS.timeout).toBe(3000)
    expect(PAYMENT_BREAKER_OPTIONS.errorThresholdPercentage).toBe(50)
    expect(PAYMENT_BREAKER_OPTIONS.resetTimeout).toBe(30_000)
  })

  it('errorFilter ignores PaymentBusinessError (business errors do not trip CB)', () => {
    const businessErr = new PaymentBusinessError('Card declined')
    const systemErr   = new Error('Gateway 500')
    expect(PAYMENT_BREAKER_OPTIONS.errorFilter(businessErr)).toBe(true)
    expect(PAYMENT_BREAKER_OPTIONS.errorFilter(systemErr)).toBe(false)
  })

  it('opens after consecutive failures and rejects subsequent calls in <10ms without invoking gateway', async () => {
    const failing = vi.fn().mockRejectedValue(new Error('Gateway 500'))
    const cb = createPaymentBreaker(failing)

    // Drive at least 5 failures so the spec scenario (5x 500) is exercised.
    for (let i = 0; i < 5; i++) {
      await expect(cb.fire(FEE_VND, `ref_${i}`)).rejects.toThrow()
    }

    expect(cb.opened).toBe(true)

    // Spec acceptance: the next call must reject in <10ms and not call the gateway.
    const callsBefore = failing.mock.calls.length
    const start = Date.now()
    await expect(cb.fire(FEE_VND, 'ref_6')).rejects.toThrow()
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(10)
    expect(failing.mock.calls.length).toBe(callsBefore)

    cb.shutdown()
  })

  it('transitions OPEN → HALF-OPEN after resetTimeout, then CLOSED on a successful probe', async () => {
    let mode: 'fail' | 'ok' = 'fail'
    const flaky = vi.fn().mockImplementation(async (_amount: number, ref: string) => {
      if (mode === 'fail') throw new Error('Gateway 500')
      return { gateway_ref: `ok_${ref}` }
    })

    vi.useFakeTimers()
    try {
      const cb = createPaymentBreaker(flaky)

      for (let i = 0; i < 5; i++) {
        await expect(cb.fire(FEE_VND, `ref_${i}`)).rejects.toThrow()
      }
      expect(cb.opened).toBe(true)

      mode = 'ok'
      vi.advanceTimersByTime(PAYMENT_BREAKER_OPTIONS.resetTimeout + 1)
      expect(cb.halfOpen).toBe(true)

      const result = (await cb.fire(FEE_VND, 'probe')) as { gateway_ref: string }
      expect(result.gateway_ref).toBe('ok_probe')
      expect(cb.closed).toBe(true)

      cb.shutdown()
    } finally {
      vi.useRealTimers()
    }
  })
})

// ---------------------------------------------------------------------------
// B — Compensating action: business error → cancel + seat release RPC
// ---------------------------------------------------------------------------

describe('PaymentService — PaymentBusinessError compensating action', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('on card-declined: throws PAYMENT_FAILED and invokes seat-release RPC', async () => {
    supabaseMock.from.mockReturnValue(singleQuery(pendingRegRow()))
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null })

    const gateway: IPaymentGateway = {
      charge: vi.fn().mockRejectedValue(new PaymentBusinessError('Card declined')),
    }
    const service = new PaymentService(gateway)

    await expect(service.processPayment(REGISTRATION_ID, USER_ID))
      .rejects.toMatchObject({ code: 'PAYMENT_FAILED', message: 'Card declined' })

    expect(supabaseMock.rpc).toHaveBeenCalledWith(
      'cancel_registration_with_seat_release',
      expect.objectContaining({
        p_registration_id: REGISTRATION_ID,
        p_amount_vnd:      FEE_VND,
        p_reason:          'Card declined',
      }),
    )
  })

  it('tolerates REGISTRATION_NOT_PENDING from compensating RPC (already released by cron)', async () => {
    supabaseMock.from.mockReturnValue(singleQuery(pendingRegRow()))
    supabaseMock.rpc.mockResolvedValue({
      data:  null,
      error: { message: 'REGISTRATION_NOT_PENDING: already released' },
    })

    const gateway: IPaymentGateway = {
      charge: vi.fn().mockRejectedValue(new PaymentBusinessError('Card declined')),
    }
    const service = new PaymentService(gateway)

    // Still surfaces PAYMENT_FAILED to client — the compensating no-op is safe.
    await expect(service.processPayment(REGISTRATION_ID, USER_ID))
      .rejects.toMatchObject({ code: 'PAYMENT_FAILED' })
  })
})

// ---------------------------------------------------------------------------
// C — Production breaker OPEN → PaymentUnavailableError, no DB writes
// ---------------------------------------------------------------------------

describe('PaymentService — PAYMENT_UNAVAILABLE when circuit is open', () => {
  afterEach(() => {
    vi.clearAllMocks()
  })

  it('translates OpenCircuitError → PaymentUnavailableError and skips seat-release RPC', async () => {
    supabaseMock.from.mockReturnValue(singleQuery(pendingRegRow()))
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null })

    // Simulate opossum's open-circuit rejection (name='OpenCircuitError') so we
    // exercise the catch branch deterministically — without depending on bucket
    // timing of the production breaker singleton.
    const openErr = Object.assign(new Error('Breaker is open'), { name: 'OpenCircuitError' })
    const gateway: IPaymentGateway = {
      charge: vi.fn().mockRejectedValue(openErr),
    }
    const service = new PaymentService(gateway)

    await expect(service.processPayment(REGISTRATION_ID, USER_ID))
      .rejects.toBeInstanceOf(PaymentUnavailableError)

    // Seat must remain held for the 15-min grace window — no compensating action.
    expect(supabaseMock.rpc).not.toHaveBeenCalled()
  })
})

// Sanity: ensure opossum is the library under test (catch package swaps).
describe('opossum library import', () => {
  it('returns a CircuitBreaker instance from the factory', () => {
    const cb = createPaymentBreaker(async () => ({ gateway_ref: 'x' }))
    expect(cb).toBeInstanceOf(CircuitBreaker)
    cb.shutdown()
  })
})

// Sanity for IPaymentGateway interface usage
describe('IPaymentGateway injection', () => {
  it('uses injected gateway charge function, not a hardcoded class', async () => {
    const chargeFn = vi.fn().mockRejectedValue(new Error('Gateway 500'))
    const gateway  = makeFailingGateway()
    ;(gateway.charge as ReturnType<typeof vi.fn>) = chargeFn

    supabaseMock.from.mockReturnValue(singleQuery(pendingRegRow()))
    supabaseMock.rpc.mockResolvedValue({ data: null, error: null })

    const service = new PaymentService(gateway)
    await expect(service.processPayment(REGISTRATION_ID, USER_ID)).rejects.toThrow()

    expect(chargeFn).toHaveBeenCalled()
  })
})
