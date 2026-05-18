import type { Response } from 'express'

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'AUTH_LOGIN_FAILED'
  | 'INVALID_EMAIL'
  | 'INVALID_TOKEN'
  | 'INVALID_STUDENT_EMAIL'
  | 'TOKEN_EXPIRED'
  | 'PROFILE_NOT_FOUND'
  | 'PROFILE_UPDATE_FAILED'
  | 'EMAIL_ALREADY_IN_USE'
  | 'FORBIDDEN_ROLE'
  | 'RESOURCE_NOT_FOUND'
  | 'RATE_LIMIT_EXCEEDED'
  | 'VALIDATION_FAILED'
  | 'CSV_IMPORT_FAILED'
  | 'CSV_HEADER_INVALID'
  | 'CSV_FILE_NOT_FOUND'
  | 'STATS_UNAVAILABLE'
  | 'PDF_INVALID_TYPE'
  | 'PDF_READ_FAILED'
  | 'PDF_NO_TEXT'
  | 'SUMMARY_IN_PROGRESS'
  | 'SUMMARY_LIMIT_REACHED'
  | 'AI_UNAVAILABLE'
  | 'SEATS_SOLD_OUT'
  | 'ALREADY_REGISTERED'
  | 'PAYMENT_UNAVAILABLE'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'REQUEST_IN_PROGRESS'
  | 'WORKSHOP_CANCELLED'
  | 'REGISTRATION_NOT_FOUND'
  | 'PAYMENT_FAILED'
  | 'STUDENT_NOT_VERIFIED'
  | 'SEATS_BELOW_REGISTERED'
  | 'TICKET_NOT_FOUND'
  | 'WRONG_WORKSHOP'
  | 'ALREADY_CHECKED_IN'
  | 'INVALID_STATUS'
  | 'WORKSHOP_UNAVAILABLE'
  | 'SERVER_ERROR'
  | 'REFRESH_TOKEN_MISSING'
  | 'REFRESH_TOKEN_INVALID'
  | 'LOGOUT_FAILED'

export interface ApiError {
  code: ErrorCode
  message: string
  details?: unknown
}

export interface ApiEnvelope<T> {
  data: T | null
  error: ApiError | null
  meta?: Record<string, unknown>
}

export function sendSuccess<T>(
  res: Response,
  data: T,
  status = 200,
  meta?: Record<string, unknown>,
): void {
  const body: ApiEnvelope<T> = { data, error: null }
  if (meta) body.meta = meta
  res.status(status).json(body)
}

export function sendError(
  res: Response,
  status: number,
  code: ErrorCode,
  message: string,
  details?: unknown,
): void {
  const error: ApiError = { code, message }
  if (details !== undefined) error.details = details
  res.status(status).json({ data: null, error })
}
