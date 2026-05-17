import { Router } from 'express';
import { verifyJwt, loadProfile, requireRole } from '../../middleware/auth.ts';
import { idempotency } from '../../middleware/idempotency.ts';
import { PaymentService } from './payment-service.ts';
import { successResponse } from '../../shared/response-envelope.ts';

const router = Router();
const service = new PaymentService();

router.post('/',
  verifyJwt,
  loadProfile,
  requireRole(['student', 'organizer']),
  idempotency,
  async (req, res, next) => {
    try {
      const { registration_id, amount, card_number } = req.body;
      
      const result = await service.processPayment(registration_id, amount, card_number);
      
      res.json(successResponse(result));
    } catch (err) {
      next(err);
    }
  }
);

export default router;