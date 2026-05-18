import { Router } from 'express'
import { z } from 'zod'
import { loadProfile, requireRole, verifyJwt } from '../middleware/auth.js'
import { idempotencyMiddleware } from '../middleware/idempotency.js'
import type { RegistrationService } from '../services/registration.service.js'
import { sendError, sendSuccess } from '../shared/http.js'

const RegisterSchema = z.object({
  workshop_id: z.string().uuid(),
})

export function createRegistrationRoutes(service: RegistrationService): Router {
  const router = Router()

  // ---------------------------------------------------------------------------
  // POST / — đăng ký workshop (student only)
  // ---------------------------------------------------------------------------
  router.post(
    '/',
    verifyJwt,
    loadProfile,
    requireRole(['student']),
    idempotencyMiddleware,
    async (req, res) => {
      const parsed = RegisterSchema.safeParse(req.body)
      if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_FAILED', 'Invalid payload', parsed.error.flatten())
        return
      }

      const mssv = req.user!.mssv
      if (!mssv) {
        sendError(res, 401, 'PROFILE_NOT_FOUND', 'Student MSSV not linked to profile')
        return
      }

      try {
        const result = await service.registerForWorkshop(mssv, parsed.data.workshop_id, req.user!.id)
        sendSuccess(res, result, 201)
      } catch (err) {
        const e = err as Error & { code?: string }
        switch (e.code) {
          case 'STUDENT_NOT_VERIFIED':
            sendError(res, 403, 'STUDENT_NOT_VERIFIED', e.message)
            break
          case 'RESOURCE_NOT_FOUND':
            sendError(res, 404, 'RESOURCE_NOT_FOUND', e.message)
            break
          case 'SEATS_SOLD_OUT':
            sendError(res, 409, 'SEATS_SOLD_OUT', e.message)
            break
          case 'ALREADY_REGISTERED':
            sendError(res, 409, 'ALREADY_REGISTERED', e.message)
            break
          default:
            sendError(res, 500, 'VALIDATION_FAILED', e.message)
        }
      }
    },
  )

  // ---------------------------------------------------------------------------
  // GET /me — đăng ký của tôi (student only)
  // ---------------------------------------------------------------------------
  router.get(
    '/me',
    verifyJwt,
    loadProfile,
    requireRole(['student']),
    async (req, res) => {
      const mssv = req.user!.mssv
      if (!mssv) {
        sendError(res, 401, 'PROFILE_NOT_FOUND', 'Student MSSV not linked to profile')
        return
      }

      try {
        const registrations = await service.getMyRegistrations(mssv)
        sendSuccess(res, registrations)
      } catch (err) {
        const e = err as Error
        sendError(res, 500, 'VALIDATION_FAILED', e.message)
      }
    },
  )

  return router
}
