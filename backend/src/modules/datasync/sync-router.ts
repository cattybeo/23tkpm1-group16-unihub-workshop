import { Router } from 'express';
import { verifyJwt, loadProfile, requireRole } from '../../middleware/auth.ts';
import { CsvService } from './csv-service.ts';
import { successResponse } from '../../shared/response-envelope.ts';
import path from 'node:path';
import fs from 'node:fs';
import { supabaseAdmin } from '../../infra/supabase.ts'; 


const router = Router();
const service = new CsvService();

router.post('/import-latest',
  verifyJwt,
  loadProfile,
  requireRole(['organizer']),
  async (req, res, next) => {
    try {
      const fileName = 'students_nightly_2026-05-13.csv'; 
      const filePath = path.join(process.cwd(), '..', 'legacy-data', fileName);

      console.log(`[Debug] Đang tìm file tại: ${filePath}`);

      if (!fs.existsSync(filePath)) {
        throw { 
          status: 404, 
          code: 'FILE_NOT_FOUND', 
          message: `Không tìm thấy file tại legacy-data/${fileName}. Vui lòng kiểm tra lại tên thư mục!` 
        };
      }

      const stats = await service.importFromPath(filePath);
      res.json(successResponse(stats));
    } catch (err) {
      next(err);
    }
  }
);

router.get('/students',
  verifyJwt,
  loadProfile,
  requireRole(['organizer']),
  async (req, res, next) => {
    try {
      const { data, error } = await supabaseAdmin
        .from('students')
        .select('*')
        .order('mssv', { ascending: true });

      if (error) throw error;
      res.json(successResponse(data));
    } catch (err) {
      next(err);
    }
  }
);

export default router;