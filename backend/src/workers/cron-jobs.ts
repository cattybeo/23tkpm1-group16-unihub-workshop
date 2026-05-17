import { CsvService } from '../modules/datasync/csv-service.ts';
import path from 'node:path';

export const initCronJobs = () => {
  const csvService = new CsvService();

  setInterval(async () => {
    console.log('[Cron] Đang kiểm tra file CSV nightly...');
    const filePath = path.resolve('../data/legacy_csv/students_nightly_latest.csv');
    
    try {
      if (fs.existsSync(filePath)) {
        await csvService.importFromPath(filePath);
      }
    } catch (err) {
      console.error('[Cron] Lỗi import tự động:', err);
    }
  }, 24 * 60 * 60 * 1000); 
};