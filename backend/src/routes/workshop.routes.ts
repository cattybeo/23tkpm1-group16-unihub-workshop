import express, { Router } from 'express'
import { loadProfile, requireRole, verifyJwt } from '../middleware/auth.js'
import { AiSummaryService, SummaryServiceError } from '../services/ai-summary.service.js'
import {
  cancelWorkshop,
  createWorkshop,
  CreateWorkshopSchema,
  getWorkshop,
  listWorkshops,
  publishWorkshop,
  updateWorkshop,
  UpdateWorkshopSchema,
} from '../services/catalog.service.js'
import { sendError, sendSuccess } from '../shared/http.js'

const router = Router()
const aiSummaryService = new AiSummaryService()

// ---------------------------------------------------------------------------
// GET / — public list (cache 5s). Organizer vẫn chỉ thấy published list.
// ---------------------------------------------------------------------------
router.get('/', async (req, res) => {
  // Optional auth: nếu có token hợp lệ và là organizer → trả cả draft
  let isOrganizer = false
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const { supabase } = await import('../lib/supabase.js')
      const token = authHeader.slice(7).trim()
      const { data: authData } = await supabase.auth.getUser(token)
      if (authData?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', authData.user.id)
          .single<{ role: string }>()
        isOrganizer = profile?.role === 'organizer'
      }
    } catch {
      // invalid token — ignore, trả public list
    }
  }

  try {
    const workshops = await listWorkshops(isOrganizer)
    sendSuccess(res, workshops)
  } catch (err) {
    const e = err as Error
    sendError(res, 500, 'VALIDATION_FAILED', e.message)
  }
})

// ---------------------------------------------------------------------------
// GET /:id — public detail. Organizer xem được draft.
// ---------------------------------------------------------------------------
router.get('/:id', async (req, res) => {
  let isOrganizer = false
  const authHeader = req.headers.authorization
  if (authHeader?.startsWith('Bearer ')) {
    try {
      const { supabase } = await import('../lib/supabase.js')
      const token = authHeader.slice(7).trim()
      const { data: authData } = await supabase.auth.getUser(token)
      if (authData?.user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', authData.user.id)
          .single<{ role: string }>()
        isOrganizer = profile?.role === 'organizer'
      }
    } catch {
      // invalid token — ignore
    }
  }

  try {
    const workshop = await getWorkshop(req.params.id, isOrganizer)
    sendSuccess(res, workshop)
  } catch (err) {
    const e = err as Error & { code?: string }
    sendError(res, 404, 'RESOURCE_NOT_FOUND', e.message)
  }
})

// ---------------------------------------------------------------------------
// POST / — tạo workshop (organizer only, draft mặc định)
// ---------------------------------------------------------------------------
router.post(
  '/',
  verifyJwt,
  loadProfile,
  requireRole(['organizer']),
  async (req, res) => {
    const parsed = CreateWorkshopSchema.safeParse(req.body)
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_FAILED', 'Invalid workshop payload', parsed.error.flatten())
      return
    }

    try {
      const workshop = await createWorkshop(parsed.data)
      sendSuccess(res, workshop, 201)
    } catch (err) {
      const e = err as Error
      sendError(res, 500, 'VALIDATION_FAILED', e.message)
    }
  },
)

// ---------------------------------------------------------------------------
// POST /:id/summary — upload PDF và chạy AI Summary async (organizer only)
// ---------------------------------------------------------------------------
router.post(
  '/:id/summary',
  verifyJwt,
  loadProfile,
  requireRole(['organizer']),
  express.raw({ type: 'application/pdf', limit: '5mb' }),
  async (req, res) => {
    if (!req.is('application/pdf')) {
      sendError(res, 400, 'PDF_INVALID_TYPE', 'Content-Type must be application/pdf')
      return
    }

    if (!Buffer.isBuffer(req.body)) {
      sendError(res, 400, 'PDF_INVALID_TYPE', 'Vui lòng gửi dữ liệu file PDF dạng binary.')
      return
    }

    try {
      const result = await aiSummaryService.beginSummary(req.params.id, req.body)
      sendSuccess(res, result, 202)
    } catch (err) {
      if (err instanceof SummaryServiceError) {
        sendError(res, err.status, err.code, err.message, err.details)
        return
      }

      const e = err as Error
      sendError(res, 500, 'VALIDATION_FAILED', e.message)
    }
  },
)

// ---------------------------------------------------------------------------
// PATCH /:id/publish — publish draft (organizer only)
// Route đặt trước PATCH /:id để không bị capture sai
// ---------------------------------------------------------------------------
router.patch(
  '/:id/publish',
  verifyJwt,
  loadProfile,
  requireRole(['organizer']),
  async (req, res) => {
    try {
      const workshop = await publishWorkshop(req.params.id)
      sendSuccess(res, workshop)
    } catch (err) {
      const e = err as Error & { code?: string }
      sendError(res, 404, 'RESOURCE_NOT_FOUND', e.message)
    }
  },
)

// ---------------------------------------------------------------------------
// PATCH /:id — update workshop fields (organizer only)
// ---------------------------------------------------------------------------
router.patch(
  '/:id',
  verifyJwt,
  loadProfile,
  requireRole(['organizer']),
  async (req, res) => {
    const parsed = UpdateWorkshopSchema.safeParse(req.body)
    if (!parsed.success) {
      sendError(res, 400, 'VALIDATION_FAILED', 'Invalid workshop payload', parsed.error.flatten())
      return
    }

    if (Object.keys(parsed.data).length === 0) {
      sendError(res, 400, 'VALIDATION_FAILED', 'At least one field is required')
      return
    }

    try {
      const workshop = await updateWorkshop(req.params.id, parsed.data)
      sendSuccess(res, workshop)
    } catch (err) {
      const e = err as Error & { code?: string }
      if (e.code === 'SEATS_BELOW_REGISTERED') {
        sendError(res, 409, 'SEATS_BELOW_REGISTERED', e.message)
        return
      }
      sendError(res, 404, 'RESOURCE_NOT_FOUND', e.message)
    }
  },
)

// ---------------------------------------------------------------------------
// DELETE /:id — soft cancel workshop (organizer only)
// ---------------------------------------------------------------------------
router.delete(
  '/:id',
  verifyJwt,
  loadProfile,
  requireRole(['organizer']),
  async (req, res) => {
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : undefined

    try {
      const workshop = await cancelWorkshop(req.params.id, reason)
      sendSuccess(res, workshop)
    } catch (err) {
      const e = err as Error & { code?: string }
      sendError(res, 404, 'RESOURCE_NOT_FOUND', e.message)
    }
  },
)

export default router
