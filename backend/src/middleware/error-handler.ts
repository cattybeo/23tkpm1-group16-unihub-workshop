import { Request, Response, NextFunction } from 'express';
import { errorResponse } from '../shared/response-envelope.ts';

export const errorHandler = (
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) => {
  console.error(`[Error] ${req.method} ${req.path}:`, err);

  const status = err.status || 500;
  const code = err.code || 'INTERNAL_SERVER_ERROR';
  const message = err.message || 'Đã có lỗi hệ thống xảy ra';

  res.status(status).json(errorResponse(code, message, err.details));
};