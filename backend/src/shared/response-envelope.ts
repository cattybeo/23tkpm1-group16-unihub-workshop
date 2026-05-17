export type ApiResponse<T> = {
  data: T | null;
  error: {
    code: string;
    message: string;
    details?: any;
  } | null;
  meta?: any;
};

export const successResponse = <T>(data: T, meta?: any): ApiResponse<T> => ({
  data,
  error: null,
  meta,
});

export const errorResponse = (code: string, message: string, details?: any): ApiResponse<null> => ({
  data: null,
  error: { code, message, details },
});