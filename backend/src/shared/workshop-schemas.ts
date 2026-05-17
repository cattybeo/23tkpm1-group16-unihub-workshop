import { z } from 'zod';

export const workshopQuerySchema = z.object({
  limit: z.string().optional().transform(v => parseInt(v || '10')),
  offset: z.string().optional().transform(v => parseInt(v || '0')),
});