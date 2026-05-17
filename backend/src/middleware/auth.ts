import type { NextFunction, Request, Response } from 'express'
import { z } from 'zod'
import { supabase } from '../lib/supabase.js'
import { sendError } from '../shared/http.js'

export type UserRole = 'student' | 'organizer' | 'staff'

export interface AuthTokenUser {
  id: string
  email: string | null
}

export interface AuthenticatedProfile extends AuthTokenUser {
  role: UserRole
  mssv: string | null
  display_name: string
  phone: string | null
  must_change_password: boolean
}

interface ProfileRow {
  id: string
  role: UserRole
  mssv: string | null
  display_name: string
  phone: string | null
  must_change_password: boolean
}

const ProfileRowSchema = z.object({
  id: z.string().uuid(),
  role: z.enum(['student', 'organizer', 'staff']),
  mssv: z.string().min(1).nullable(),
  display_name: z.string().min(1),
  phone: z.string().nullable(),
  must_change_password: z.boolean(),
})

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthTokenUser
      user?: AuthenticatedProfile
    }
  }
}

function isExpiredTokenError(error: { message?: string; name?: string }): boolean {
  const text = `${error.name ?? ''} ${error.message ?? ''}`.toLowerCase()
  return text.includes('expired') || text.includes('jwt expired')
}

export async function verifyJwt(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    sendError(res, 401, 'UNAUTHENTICATED', 'Missing bearer token')
    return
  }

  const token = authHeader.slice(7).trim()
  if (!token) {
    sendError(res, 401, 'INVALID_TOKEN', 'Invalid bearer token')
    return
  }

  const { data, error } = await supabase.auth.getUser(token)
  if (error) {
    if (isExpiredTokenError(error)) {
      sendError(res, 401, 'TOKEN_EXPIRED', 'Token expired')
      return
    }
    sendError(res, 401, 'INVALID_TOKEN', 'Invalid token')
    return
  }

  if (!data.user) {
    sendError(res, 401, 'INVALID_TOKEN', 'Invalid token')
    return
  }

  req.authUser = {
    id: data.user.id,
    email: data.user.email ?? null,
  }
  next()
}

export async function loadProfile(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (!req.authUser) {
    sendError(res, 401, 'UNAUTHENTICATED', 'Authentication is required')
    return
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id, role, mssv, display_name, phone, must_change_password')
    .eq('id', req.authUser.id)
    .single<ProfileRow>()

  if (error || !profile) {
    sendError(res, 401, 'PROFILE_NOT_FOUND', 'Profile not found')
    return
  }

  const parsedProfile = ProfileRowSchema.safeParse(profile)
  if (!parsedProfile.success) {
    sendError(res, 401, 'PROFILE_NOT_FOUND', 'Profile is invalid', parsedProfile.error.flatten())
    return
  }

  const validProfile = parsedProfile.data

  req.user = {
    ...req.authUser,
    id: validProfile.id,
    role: validProfile.role,
    mssv: validProfile.mssv,
    display_name: validProfile.display_name,
    phone: validProfile.phone,
    must_change_password: validProfile.must_change_password,
  }
  next()
}

export function requireRole(roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      sendError(res, 401, 'UNAUTHENTICATED', 'Authentication is required')
      return
    }

    if (!roles.includes(req.user.role)) {
      sendError(res, 403, 'FORBIDDEN_ROLE', 'Role is not allowed for this action', { required: roles })
      return
    }

    next()
  }
}

export const requireAuthenticated = [verifyJwt, loadProfile] as const
