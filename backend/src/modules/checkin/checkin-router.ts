import { Router } from 'express';
import { verifyJwt, loadProfile, requireRole } from '../../middleware/auth.ts';
import { CheckinService } from './checkin-service.ts';
import { successResponse } from '../../shared/response-envelope.ts';

const router = Router();
const service = new CheckinService();

router.post('/',
  verifyJwt,
  loadProfile,
  requireRole(['scanner', 'organizer']),
  async (req, res, next) => {
    try {
      const { qr_token, workshop_id } = req.body;
      const result = await service.checkin(qr_token, workshop_id, req.user!.id);
      res.json(successResponse(result));
    } catch (err) {
      next(err);
    }
  }
);

router.post('/sync',
  verifyJwt,
  loadProfile,
  requireRole(['scanner', 'organizer']),
  async (req, res, next) => {
    try {
      const { records } = req.body;
      const result = await service.syncOfflineData(records, req.user!.id);
      res.json(successResponse(result));
    } catch (err) {
      next(err);
    }
  }
);

export default router;