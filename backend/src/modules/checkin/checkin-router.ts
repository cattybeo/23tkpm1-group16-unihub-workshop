import { Router } from 'express';
import { z } from 'zod';
import { verifyJwt, loadProfile, requireRole } from '../../middleware/auth.js';
import { CheckinService } from './checkin-service.js';
import { successResponse } from '../../shared/response-envelope.js';
import { sendError } from '../../shared/http.js';

const router = Router();
const service = new CheckinService();

const checkinBodySchema = z.object({
  qr_token: z.string().min(1),
  workshop_id: z.string().uuid(),
});

const manualCheckinBodySchema = z.object({
  registration_id: z.string().uuid(),
  workshop_id: z.string().uuid(),
});

const lookupQuerySchema = z.object({
  workshop_id: z.string().uuid(),
  q: z.string().min(2),
});

const rosterQuerySchema = z.object({
  workshop_id: z.string().uuid(),
});

const offlineRecordSchema = z.object({
  client_id: z.string().min(1),
  qr_token: z.string().min(1),
  workshop_id: z.string().uuid(),
  scanned_at: z.string().datetime(),
});

const syncBodySchema = z.object({
  records: z.array(offlineRecordSchema),
});

router.post('/',
  verifyJwt,
  loadProfile,
  requireRole(['staff', 'organizer']),
  async (req, res, next) => {
    try {
      const parsed = checkinBodySchema.safeParse(req.body);
      if (!parsed.success) return sendError(res, 400, 'VALIDATION_FAILED', 'Invalid body', parsed.error.flatten());
      const result = await service.checkin(parsed.data.qr_token, parsed.data.workshop_id, req.user!.id);
      res.json(successResponse(result));
    } catch (err) {
      next(err);
    }
  }
);

router.post('/manual',
  verifyJwt,
  loadProfile,
  requireRole(['staff', 'organizer']),
  async (req, res, next) => {
    try {
      const parsed = manualCheckinBodySchema.safeParse(req.body);
      if (!parsed.success) return sendError(res, 400, 'VALIDATION_FAILED', 'Invalid body', parsed.error.flatten());
      const result = await service.checkinRegistration(parsed.data.registration_id, parsed.data.workshop_id, req.user!.id);
      res.json(successResponse(result));
    } catch (err) {
      next(err);
    }
  }
);

router.get('/registrations',
  verifyJwt,
  loadProfile,
  requireRole(['staff', 'organizer']),
  async (req, res, next) => {
    try {
      const parsed = lookupQuerySchema.safeParse(req.query);
      if (!parsed.success) return sendError(res, 400, 'VALIDATION_FAILED', 'Invalid query', parsed.error.flatten());
      const result = await service.searchRegistrations(parsed.data.workshop_id, parsed.data.q);
      res.json(successResponse(result));
    } catch (err) {
      next(err);
    }
  }
);

router.get('/registrations/cache',
  verifyJwt,
  loadProfile,
  requireRole(['staff', 'organizer']),
  async (req, res, next) => {
    try {
      const parsed = rosterQuerySchema.safeParse(req.query);
      if (!parsed.success) return sendError(res, 400, 'VALIDATION_FAILED', 'Invalid query', parsed.error.flatten());
      const result = await service.listRegistrationsForWorkshop(parsed.data.workshop_id);
      res.json(successResponse(result));
    } catch (err) {
      next(err);
    }
  }
);

router.post('/sync',
  verifyJwt,
  loadProfile,
  requireRole(['staff', 'organizer']),
  async (req, res, next) => {
    try {
      const parsed = syncBodySchema.safeParse(req.body);
      if (!parsed.success) return sendError(res, 400, 'VALIDATION_FAILED', 'Invalid body', parsed.error.flatten());
      const result = await service.syncOfflineData(parsed.data.records, req.user!.id);
      res.json(successResponse(result));
    } catch (err) {
      next(err);
    }
  }
);

export default router;
