import { Router } from 'express'
import type { CookieOptions } from 'express'
import { z } from 'zod'
import { loadProfile, verifyJwt } from '../middleware/auth.js'
import { completePasswordChange, loginWithAccount, refreshSession, revokeSession, toProfileDto, updateOwnProfile } from '../services/identity.service.js'
import { supabaseAuth } from '../lib/supabase.js'
import { sendError, sendSuccess } from '../shared/http.js'

const router = Router()

const REFRESH_COOKIE_NAME = 'sb_refresh'

const refreshCookieOptions = (): CookieOptions => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/v1/auth',
  maxAge: 30 * 24 * 60 * 60 * 1000,
  ...(process.env.COOKIE_DOMAIN ? { domain: process.env.COOKIE_DOMAIN } : {}),
})

const UpdateProfileSchema = z.object({
  email: z.string().trim().email().max(254).optional(),
  display_name: z.string().trim().min(1).max(160).optional(),
  phone: z
    .string()
    .trim()
    .max(32)
    .nullable()
    .optional()
    .transform((value) => (value === '' ? null : value)),
}).strict().refine(
  (data) => data.email !== undefined || data.display_name !== undefined || data.phone !== undefined,
  { message: 'At least one field required' },
)

const LoginSchema = z.object({
  account: z.string().trim().min(1).max(254),
  password: z.string().min(1).max(256),
  login_type: z.enum(['student', 'staff']).optional(),
}).strict()

const ChangePasswordSchema = z.object({
  newPassword: z.string().min(6).max(256),
}).strict()

router.post('/login', async (req, res) => {
  const parsed = LoginSchema.safeParse(req.body)
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_FAILED', 'Invalid login payload', parsed.error.flatten())
    return
  }

  const result = await loginWithAccount(parsed.data.account, parsed.data.password, parsed.data.login_type ?? 'student')
  if (result.error || !result.data) {
    const code = result.error?.code ?? 'AUTH_LOGIN_FAILED'
    const status = code === 'INVALID_EMAIL' || code === 'INVALID_STUDENT_EMAIL' || code === 'VALIDATION_FAILED'
      ? 400
      : code === 'FORBIDDEN_ROLE'
      ? 403
      : 401
    sendError(res, status, code, result.error?.message ?? 'Invalid account or password', result.error?.details)
    return
  }

  const { session, user, profile } = result.data
  res.cookie(REFRESH_COOKIE_NAME, session.refresh_token, refreshCookieOptions())
  sendSuccess(res, {
    session: { access_token: session.access_token, expires_at: session.expires_at ?? null },
    user,
    profile,
  })
})

router.post('/refresh', async (req, res) => {
  const refreshToken = (req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined)?.trim()
  if (!refreshToken) {
    sendError(res, 401, 'REFRESH_TOKEN_MISSING', 'No refresh cookie present')
    return
  }

  const result = await refreshSession(refreshToken)
  if (result.error || !result.data) {
    res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' })
    sendError(res, 401, result.error?.code ?? 'REFRESH_TOKEN_INVALID', result.error?.message ?? 'Refresh failed')
    return
  }

  const { session, user, profile } = result.data
  res.cookie(REFRESH_COOKIE_NAME, session.refresh_token, refreshCookieOptions())
  sendSuccess(res, {
    session: { access_token: session.access_token, expires_at: session.expires_at },
    user,
    profile,
  })
})

router.post('/logout', async (req, res) => {
  const refreshToken = (req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined)?.trim()
  res.clearCookie(REFRESH_COOKIE_NAME, { path: '/api/v1/auth' })
  if (refreshToken) {
    try {
      const { data } = await supabaseAuth.auth.refreshSession({ refresh_token: refreshToken })
      if (data.user?.id) await revokeSession(data.user.id)
    } catch {
      // best-effort — logout không được 500
    }
  }
  sendSuccess(res, { ok: true })
})

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
    const code = result.error?.code ?? 'PROFILE_UPDATE_FAILED'
    const status = code === 'INVALID_EMAIL' || code === 'INVALID_STUDENT_EMAIL' ? 400 : code === 'EMAIL_ALREADY_IN_USE' ? 409 : 500
    sendError(res, status, code, result.error?.message ?? 'Profile update failed', result.error?.details)
    return
  }

  sendSuccess(res, result.data)
})

router.post('/change-password/complete', verifyJwt, loadProfile, async (req, res) => {
  const parsed = ChangePasswordSchema.safeParse(req.body ?? {})
  if (!parsed.success) {
    sendError(res, 400, 'VALIDATION_FAILED', 'Invalid change-password completion payload', parsed.error.flatten())
    return
  }

  const result = await completePasswordChange(req.user!, parsed.data.newPassword)
  if (result.error || !result.data) {
    sendError(res, 500, 'PROFILE_UPDATE_FAILED', result.error?.message ?? 'Password change completion failed')
    return
  }

  sendSuccess(res, result.data)
})

export default router
