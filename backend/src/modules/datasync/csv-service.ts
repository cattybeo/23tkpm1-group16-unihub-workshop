import fs from 'node:fs';
import Papa from 'papaparse';
import { supabaseAdmin } from '../../infra/supabase.ts';
import { csvStudentRowSchema } from '../../shared/student-schemas.ts';

export class CsvService {
  async importFromPath(filePath: string) {
    console.log(`[CSV] Bắt đầu xử lý file: ${filePath}`);
    
    const stats = { inserted: 0, failed: 0, errors: [] as any[] };
    const allImportedMssvs: string[] = [];
    const fileStream = fs.createReadStream(filePath);

    return new Promise((resolve, reject) => {
      Papa.parse(fileStream, {
        header: true,
        skipEmptyLines: true,
        step: async (results, parser) => {
          parser.pause();
          
          const row = results.data as any;
          try {
            const validated = csvStudentRowSchema.parse(row);
            
            const { error } = await supabaseAdmin
              .from('students')
              .upsert({
                mssv: validated.mssv,
                full_name: validated.full_name,
                is_active: true,
                last_synced_at: new Date().toISOString()
              }, { onConflict: 'mssv' });

            if (error) throw error;

            allImportedMssvs.push(validated.mssv);
            stats.inserted++;
            console.log(`[CSV] Đã nạp: ${validated.mssv}`);
          } catch (err: any) {
            stats.failed++;
            stats.errors.push({ mssv: row.mssv, error: err.message });
            console.error(`[CSV] Lỗi dòng:`, err.message);
          }

          parser.resume();
        },
        complete: async () => {
          if (allImportedMssvs.length > 0) {
            console.log(`[CSV] Đang xử lý Soft Delete cho sinh viên cũ...`);
            await supabaseAdmin
              .from('students')
              .update({ is_active: false })
              .not('mssv', 'in', `(${allImportedMssvs.join(',')})`);
          }

          console.log(`[CSV] Hoàn tất toàn bộ tiến trình.`);
          resolve(stats);
        },
        error: (err) => {
          console.error(`[CSV] Lỗi nghiêm trọng:`, err);
          reject(err);
        }
      });
    });
  }
}