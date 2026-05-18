import { Router } from 'express'
import { z } from 'zod'
import { loadProfile, requireRole, verifyJwt, verifyJwtFlexible } from '../middleware/auth.js'
import {
  CsvImportError,
  importLatestNightlyStudents,
  importNightlyStudentsForDate,
  importStudentsFromCsv,
  listCsvImportLogs,
} from '../services/csv.service.js'
import type { RegistrationService } from '../services/registration.service.js'
import { getAdminStats } from '../services/admin-stats.service.js'
import { sendError, sendSuccess } from '../shared/http.js'

export function createAdminRoutes(registrationService: RegistrationService): Router {
const router = Router()
const ImportNightlyQuerySchema = z.object({
  token: z.string().trim().min(1).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
}).passthrough()
const ImportLogQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
}).passthrough()

// GET /api/v1/admin/stats
router.get(
  '/stats',
  verifyJwt,
  loadProfile,
  requireRole(['organizer']),
  async (_req, res) => {
    try {
      sendSuccess(res, await getAdminStats())
    } catch (err) {
      const code = err && typeof err === 'object' && 'code' in err ? String(err.code) : 'STATS_UNAVAILABLE'
      sendError(
        res,
        503,
        code === 'STATS_UNAVAILABLE' ? code : 'STATS_UNAVAILABLE',
        err instanceof Error ? err.message : 'Stats unavailable',
      )
    }
  },
)

// GET /api/v1/admin/csv-import/logs
router.get(
  '/csv-import/logs',
  verifyJwt,
  loadProfile,
  requireRole(['organizer']),
  async (req, res) => {
    try {
      const parsed = ImportLogQuerySchema.safeParse(req.query)
      if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_FAILED', 'Invalid csv import log query', parsed.error.flatten())
        return
      }

      sendSuccess(res, await listCsvImportLogs(parsed.data.limit))
    } catch (err) {
      if (err instanceof CsvImportError) {
        sendError(res, err.status, err.code, err.message, err.details)
        return
      }
      sendError(res, 500, 'CSV_IMPORT_FAILED', err instanceof Error ? err.message : 'Load import logs failed')
    }
  },
)

// GET /api/v1/admin/import-nightly?token=<jwt>[&date=YYYY-MM-DD]
// Trigger import thủ công — dùng được từ browser address bar
router.get(
  '/import-nightly',
  verifyJwtFlexible,
  loadProfile,
  requireRole(['organizer']),
  async (req, res) => {
    try {
      const parsed = ImportNightlyQuerySchema.safeParse(req.query)
      if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_FAILED', 'Invalid import-nightly query', parsed.error.flatten())
        return
      }

      const dateStr = parsed.data.date
        ?? new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' })
      const result = await importNightlyStudentsForDate(dateStr)
      sendSuccess(res, result)
    } catch (err) {
      if (err instanceof CsvImportError) {
        sendError(res, err.status, err.code, err.message, err.details)
        return
      }
      sendError(res, 500, 'CSV_IMPORT_FAILED', err instanceof Error ? err.message : 'Import failed')
    }
  },
)

// POST /api/v1/admin/csv-import
// Body: text/csv, { csv: "..." }, hoặc không body để import file nightly mới nhất.
router.post(
  '/csv-import',
  verifyJwt,
  loadProfile,
  requireRole(['organizer']),
  async (req, res) => {
    try {
      if (req.is('text/csv') || req.is('text/plain')) {
        sendSuccess(res, await importStudentsFromCsv(String(req.body ?? ''), 'request-body'))
        return
      }

      if (typeof req.body?.csv === 'string') {
        sendSuccess(res, await importStudentsFromCsv(req.body.csv, 'request-body'))
        return
      }

      if (
        req.body === undefined ||
        (typeof req.body === 'object' && req.body !== null && Object.keys(req.body as Record<string, unknown>).length === 0)
      ) {
        sendSuccess(res, await importLatestNightlyStudents())
        return
      }

      sendError(res, 400, 'VALIDATION_FAILED', 'Send CSV as text/csv, { csv: "..." }, or omit body')
    } catch (err) {
      if (err instanceof CsvImportError) {
        sendError(res, err.status, err.code, err.message, err.details)
        return
      }

      sendError(res, 500, 'CSV_IMPORT_FAILED', err instanceof Error ? err.message : 'Import failed')
    }
  },
)

// ---------------------------------------------------------------------------
// GET /api/v1/admin/registrations — xem tất cả đăng ký (organizer only)
// Query params: ?workshop_id=<uuid>&status=<confirmed|pending_payment|...>
// ---------------------------------------------------------------------------
router.get(
  '/registrations',
  verifyJwt,
  loadProfile,
  requireRole(['organizer']),
  async (req, res) => {
    const workshopId = typeof req.query.workshop_id === 'string' ? req.query.workshop_id : undefined
    const status     = typeof req.query.status === 'string' ? req.query.status : undefined

    try {
      const registrations = await registrationService.getAllRegistrations({ workshopId, status })
      sendSuccess(res, registrations)
    } catch (err) {
      sendError(res, 500, 'VALIDATION_FAILED', err instanceof Error ? err.message : 'Query failed')
    }
  },
)

  return router
}
