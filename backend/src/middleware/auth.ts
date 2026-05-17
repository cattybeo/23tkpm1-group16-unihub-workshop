import { Request, Response, NextFunction } from 'express';
import { supabaseAdmin } from '../infra/supabase.ts';
import { errorResponse } from '../shared/response-envelope.ts';

export const verifyJwt = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json(errorResponse('UNAUTHENTICATED', 'Thiếu mã xác thực'));
  }

  const token = authHeader.split(' ')[1];
  const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    const code = error?.status === 401 ? 'TOKEN_EXPIRED' : 'INVALID_TOKEN';
    return res.status(401).json(errorResponse(code, 'Mã xác thực không hợp lệ hoặc hết hạn'));
  }

  req.user = { id: user.id } as any;
  next();
};

export const loadProfile = async (req: Request, res: Response, next: NextFunction) => {
  if (!req.user?.id) return next();

  const { data: profile, error } = await supabaseAdmin
    .from('profiles')
    .select('role, mssv, display_name')
    .eq('id', req.user.id)
    .single();

  if (error || !profile) {
    return res.status(401).json(errorResponse('PROFILE_NOT_FOUND', 'Không tìm thấy thông tin người dùng'));
  }

  req.user = {
    id: req.user.id,
    role: profile.role,
    mssv: profile.mssv,
    display_name: profile.display_name
  };

  next();
};

export const requireRole = (allowedRoles: ('student' | 'organizer' | 'scanner')[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json(errorResponse('FORBIDDEN_ROLE', 'Bạn không có quyền thực hiện hành động này'));
    }
    next();
  };
};