import express, { Router } from 'express';
import { verifyJwt, loadProfile, requireRole } from '../../middleware/auth.ts';
import { SummaryService } from './summary-service.ts';
import { successResponse, errorResponse } from '../../shared/response-envelope.ts';

const router = Router();
const service = new SummaryService();

router.post(
  '/:id/summary',
  verifyJwt,
  loadProfile,
  requireRole(['organizer']),
  express.raw({ type: 'application/pdf', limit: '5mb' }),
  async (req, res, next) => {
    try {
      const workshopId = req.params.id;
      const pdfBuffer = req.body as Buffer;

      if (!Buffer.isBuffer(pdfBuffer) || pdfBuffer.length === 0) {
        return res
          .status(400)
          .json(errorResponse('FILE_REQUIRED', 'Vui lòng gửi dữ liệu file PDF (Binary)'));
      }

      if (!pdfBuffer.slice(0, 5).equals(Buffer.from('%PDF-'))) {
        return res
          .status(400)
          .json(errorResponse('INVALID_FILE_TYPE', 'File không đúng định dạng PDF'));
      }

      service.processSummary(workshopId, pdfBuffer).catch(err => {
        console.error('[summary-router] Unhandled pipeline error:', err);
      });

      return res.status(202).json(
        successResponse({
          message: 'Đang tiến hành tóm tắt nội dung. Kết quả sẽ hiển thị sau ít phút.',
        })
      );
    } catch (err) {
      next(err);
    }
  }
);

export default router;