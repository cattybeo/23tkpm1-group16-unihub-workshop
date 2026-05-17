import { Router } from 'express'
import { z } from 'zod'
import { loadProfile, verifyJwt } from '../middleware/auth.js'
import { idempotencyMiddleware } from '../middleware/idempotency.js'
import { PaymentUnavailableError, processPayment } from '../services/payment.service.js'
import { sendError, sendSuccess } from '../shared/http.js'

const router = Router()

const PaymentSchema = z.object({
  registration_id: z.string().uuid(),
})

// ---------------------------------------------------------------------------
// POST / — process payment for authenticated users
// ---------------------------------------------------------------------------
router.post(
  '/',
  verifyJwt,
  loadProfile,
  idempotencyMiddleware,
  async (req, res) => {
    const parsed = PaymentSchema.safeParse(req.body)
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_FAILED', 'Invalid payload', parsed.error.flatten())
      return
    }

    try {
      const result = await processPayment(parsed.data.registration_id, req.user!.id)
      sendSuccess(res, result)
    } catch (err) {
      const e = err as Error & { code?: string }

      if (e instanceof PaymentUnavailableError) {
        sendError(res, 503, 'PAYMENT_UNAVAILABLE',
          'Payment gateway temporarily unavailable. Your seat is held for 15 minutes.')
        return
      }

      switch (e.code) {
        case 'REGISTRATION_NOT_FOUND':
          sendError(res, 404, 'REGISTRATION_NOT_FOUND', e.message)
          break
        case 'PAYMENT_FAILED':
          sendError(res, 402, 'PAYMENT_FAILED', e.message)
          break
        default:
          sendError(res, 500, 'VALIDATION_FAILED', e.message)
      }
    }
  },
)

export default router
