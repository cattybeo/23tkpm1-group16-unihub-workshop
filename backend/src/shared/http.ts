import type { Response } from 'express'

export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'INVALID_TOKEN'
  | 'TOKEN_EXPIRED'
  | 'PROFILE_NOT_FOUND'
  | 'PROFILE_UPDATE_FAILED'
  | 'FORBIDDEN_ROLE'
  | 'RESOURCE_NOT_FOUND'
  | 'RATE_LIMIT_EXCEEDED'
  | 'VALIDATION_FAILED'
  | 'CSV_IMPORT_FAILED'
  | 'CSV_HEADER_INVALID'
  | 'CSV_FILE_NOT_FOUND'
  | 'SEATS_SOLD_OUT'
  | 'ALREADY_REGISTERED'
  | 'PAYMENT_UNAVAILABLE'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'REQUEST_IN_PROGRESS'
  | 'WORKSHOP_CANCELLED'
  | 'REGISTRATION_NOT_FOUND'
  | 'PAYMENT_FAILED'

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
