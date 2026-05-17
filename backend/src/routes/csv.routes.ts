import { Router } from 'express'
import { loadProfile, requireRole, verifyJwt } from '../middleware/auth.js'
import { CsvImportError, importLatestNightlyStudents, importStudentsFromCsv } from '../services/csv.service.js'
import { getAllRegistrations } from '../services/registration.service.js'
import { sendError, sendSuccess } from '../shared/http.js'

const router = Router()

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
      const registrations = await getAllRegistrations({ workshopId, status })
      sendSuccess(res, registrations)
    } catch (err) {
      sendError(res, 500, 'VALIDATION_FAILED', err instanceof Error ? err.message : 'Query failed')
    }
  },
)

export default router
