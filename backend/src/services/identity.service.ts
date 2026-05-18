import type { Session, User } from '@supabase/supabase-js'
import { z } from 'zod'
import { supabase, supabaseAuth } from '../lib/supabase.js'
import type { AuthenticatedProfile, UserRole } from '../middleware/auth.js'
import type { ErrorCode } from '../shared/http.js'

export interface ProfileDto {
  id: string
  email: string | null
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

interface ServiceResult<T> {
  data: T | null
  error: { code: ErrorCode; message: string; details?: unknown } | null
}

export interface LoginDto {
  session: Session
  user: User
  profile: ProfileDto
}

export type LoginType = 'student' | 'staff'

const PROFILE_COLUMNS = 'id, role, mssv, display_name, phone, must_change_password'
const EmailSchema = z.string().trim().email().max(254)

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase()
}

export function isValidEmail(value: string): boolean {
  return EmailSchema.safeParse(value).success
}

function isLikelyDuplicateEmail(message: string): boolean {
  const normalized = message.toLowerCase()
  return normalized.includes('already') || normalized.includes('duplicate') || normalized.includes('unique')
}

function profileResultError(code: ErrorCode, message: string, details?: unknown): ServiceResult<never>['error'] {
  return details === undefined ? { code, message } : { code, message, details }
}

function invalidEmailError(): ServiceResult<never>['error'] {
  return profileResultError('INVALID_EMAIL', 'Email must be valid')
}

export function toProfileDto(profile: AuthenticatedProfile): ProfileDto {
  return {
    id: profile.id,
    email: profile.email,
    role: profile.role,
    mssv: profile.mssv,
    display_name: profile.display_name,
    phone: profile.phone,
    must_change_password: profile.must_change_password,
  }
}

function mergeEmail(row: ProfileRow, email: string | null): ProfileDto {
  return {
    id: row.id,
    email,
    role: row.role,
    mssv: row.mssv,
    display_name: row.display_name,
    phone: row.phone,
    must_change_password: row.must_change_password,
  }
}

async function loadProfileDtoById(userId: string, email: string | null): Promise<ServiceResult<ProfileDto>> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('id', userId)
    .single<ProfileRow>()

  if (error || !data) {
    return {
      data: null,
      error: profileResultError('PROFILE_NOT_FOUND', error?.message ?? 'Profile not found'),
    }
  }

  return { data: mergeEmail(data, email), error: null }
}

async function resolveStudentLoginEmail(account: string): Promise<ServiceResult<string>> {
  const normalized = account.trim()

  if (normalized.includes('@')) {
    const email = normalizeEmail(normalized)
    if (!isValidEmail(email)) return { data: null, error: invalidEmailError() }
    return { data: email, error: null }
  }

  const { data: profile, error } = await supabase
    .from('profiles')
    .select('id')
    .eq('mssv', normalized)
    .single<Pick<ProfileRow, 'id'>>()

  if (error || !profile) {
    return {
      data: null,
      error: profileResultError('AUTH_LOGIN_FAILED', 'Invalid account or password'),
    }
  }

  const { data: authData, error: authError } = await supabase.auth.admin.getUserById(profile.id)
  const email = authData.user?.email ?? null

  if (authError || !email) {
    return {
      data: null,
      error: profileResultError('AUTH_LOGIN_FAILED', authError?.message ?? 'Invalid account or password'),
    }
  }

  return { data: email, error: null }
}

async function resolveStaffLoginEmail(account: string): Promise<ServiceResult<string>> {
  return { data: normalizeEmail(account), error: null }
}

export async function loginWithAccount(
  account: string,
  password: string,
  loginType: LoginType = 'student',
): Promise<ServiceResult<LoginDto>> {
  const resolvedEmail = loginType === 'staff'
    ? await resolveStaffLoginEmail(account)
    : await resolveStudentLoginEmail(account)
  if (resolvedEmail.error || !resolvedEmail.data) {
    return { data: null, error: resolvedEmail.error }
  }

  const { data: authData, error: authError } = await supabaseAuth.auth.signInWithPassword({
    email: resolvedEmail.data,
    password,
  })

  if (authError || !authData.session || !authData.user) {
    return {
      data: null,
      error: profileResultError('AUTH_LOGIN_FAILED', 'Invalid account or password'),
    }
  }

  const profileResult = await loadProfileDtoById(authData.user.id, authData.user.email ?? null)
  if (profileResult.error || !profileResult.data) {
    return { data: null, error: profileResult.error }
  }

  if (loginType === 'staff' && profileResult.data.role === 'student') {
    return {
      data: null,
      error: profileResultError('FORBIDDEN_ROLE', 'This account does not have staff access'),
    }
  }

  return {
    data: {
      session: authData.session,
      user: authData.user,
      profile: profileResult.data,
    },
    error: null,
  }
}

export async function updateOwnProfile(
  user: AuthenticatedProfile,
  patch: { display_name?: string; phone?: string | null; email?: string },
): Promise<ServiceResult<ProfileDto>> {
  const { email, ...profilePatch } = patch
  const nextEmail = email ? normalizeEmail(email) : null

  if (nextEmail) {
    if (!isValidEmail(nextEmail)) return { data: null, error: invalidEmailError() }

    const { error: authError } = await supabase.auth.admin.updateUserById(user.id, {
      email: nextEmail,
      email_confirm: true,
    })

    if (authError) {
      return {
        data: null,
        error: profileResultError(
          isLikelyDuplicateEmail(authError.message) ? 'EMAIL_ALREADY_IN_USE' : 'PROFILE_UPDATE_FAILED',
          authError.message,
        ),
      }
    }
  }

  if (Object.keys(profilePatch).length === 0) {
    return loadProfileDtoById(user.id, nextEmail ?? user.email)
  }

  const { data, error } = await supabase
    .from('profiles')
    .update(profilePatch)
    .eq('id', user.id)
    .select(PROFILE_COLUMNS)
    .single<ProfileRow>()

  if (error || !data) {
    return {
      data: null,
      error: profileResultError('PROFILE_UPDATE_FAILED', error?.message ?? 'Profile update failed'),
    }
  }

  return { data: mergeEmail(data, nextEmail ?? user.email), error: null }
}

export interface RefreshDto {
  session: { access_token: string; refresh_token: string; expires_at: number | null }
  user: User
  profile: ProfileDto
}

export async function refreshSession(refreshToken: string): Promise<ServiceResult<RefreshDto>> {
  const { data, error } = await supabaseAuth.auth.refreshSession({ refresh_token: refreshToken })
  if (error || !data.session || !data.user) {
    return { data: null, error: profileResultError('REFRESH_TOKEN_INVALID', error?.message ?? 'Refresh token invalid or expired') }
  }
  const profileResult = await loadProfileDtoById(data.user.id, data.user.email ?? null)
  if (profileResult.error || !profileResult.data) return { data: null, error: profileResult.error }
  return {
    data: {
      session: {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        expires_at: data.session.expires_at ?? null,
      },
      user: data.user,
      profile: profileResult.data,
    },
    error: null,
  }
}

export async function revokeSession(userId: string): Promise<ServiceResult<{ ok: true }>> {
  const { error } = await supabase.auth.admin.signOut(userId)
  if (error) return { data: null, error: profileResultError('LOGOUT_FAILED', error.message) }
  return { data: { ok: true }, error: null }
}

export async function completePasswordChange(user: AuthenticatedProfile): Promise<ServiceResult<ProfileDto>> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', user.id)
    .select(PROFILE_COLUMNS)
    .single<ProfileRow>()

  if (error || !data) {
    return {
      data: null,
      error: profileResultError('PROFILE_UPDATE_FAILED', error?.message ?? 'Password change completion failed'),
    }
  }

  return { data: mergeEmail(data, user.email), error: null }
}
