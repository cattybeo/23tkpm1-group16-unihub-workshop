import { Router } from 'express'
import { z } from 'zod'
import { loadProfile, verifyJwt } from '../middleware/auth.js'
import { completePasswordChange, toProfileDto, updateOwnProfile } from '../services/identity.service.js'
import { sendError, sendSuccess } from '../shared/http.js'

const router = Router()

const UpdateProfileSchema = z.object({
  display_name: z.string().trim().min(1).max(160).optional(),
  phone: z
    .string()
    .trim()
    .max(32)
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value)),
}).strict().refine(
  (data) => data.display_name !== undefined || data.phone !== undefined,
  { message: 'At least one field required' },
)

const EmptyBodySchema = z.object({}).strict()

router.get('/me', verifyJwt, loadProfile, (req, res) => {
  sendSuccess(res, toProfileDto(req.user!))
})

router.patch('/me', verifyJwt, loadProfile, async (req, res) => {
  const parsed = UpdateProfileSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_FAILED', 'Invalid profile payload', parsed.error.flatten())
    return
  }

  const result = await updateOwnProfile(req.user!, parsed.data)
  if (result.error || !result.data) {
    sendError(res, 500, 'PROFILE_UPDATE_FAILED', result.error ?? 'Profile update failed')
    return
  }

  sendSuccess(res, result.data)
})

router.post('/change-password/complete', verifyJwt, loadProfile, async (req, res) => {
  const parsed = EmptyBodySchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_FAILED', 'Invalid change-password completion payload', parsed.error.flatten())
    return
  }

  const result = await completePasswordChange(req.user!)
  if (result.error || !result.data) {
    sendError(res, 500, 'PROFILE_UPDATE_FAILED', result.error ?? 'Password change completion failed')
    return
  }

  sendSuccess(res, result.data)
})

export default router
