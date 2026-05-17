import { z } from 'zod';

export const csvStudentRowSchema = z.object({
  mssv: z.string().regex(/^[A-Za-z0-9]{6,20}$/, 'MSSV sai định dạng'),
  full_name: z.string().min(1, 'Họ tên không được để trống'),
});

export type CsvStudentRow = z.infer<typeof csvStudentRowSchema>;