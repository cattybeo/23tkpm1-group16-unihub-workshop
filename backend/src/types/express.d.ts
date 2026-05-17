import { UserRole } from '../shared/auth-types.ts';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        role: 'student' | 'organizer' | 'scanner';
        mssv?: string;
        display_name: string;
      };
    }
  }
}