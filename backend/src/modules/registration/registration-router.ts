import { Router } from 'express';
import { verifyJwt, loadProfile, requireRole } from '../../middleware/auth.ts';
import { idempotency } from '../../middleware/idempotency.ts';
import { RegistrationRepository } from './registration-repository.ts';
import { RegistrationService } from './registration-service.ts';
import { successResponse } from '../../shared/response-envelope.ts';

const router = Router();
const service = new RegistrationService(new RegistrationRepository());

router.post('/',
  verifyJwt,
  loadProfile,
  requireRole(['student', 'organizer']), 
  idempotency,
  async (req, res, next) => {
    try {
      const { workshop_id } = req.body;
      const studentId = req.user!.id;
      
      const finalMssv = req.user!.role === 'organizer' ? '23127001' : req.user!.mssv;

      if (!finalMssv) {
        throw { status: 400, code: 'MSSV_REQUIRED', message: 'Không tìm thấy mã sinh viên để đăng ký' };
      }

      const registration = await service.register(studentId, finalMssv, workshop_id);
      
      res.status(201).json(successResponse(registration));
    } catch (err) {
      next(err);
    }
  }
);

export default router;