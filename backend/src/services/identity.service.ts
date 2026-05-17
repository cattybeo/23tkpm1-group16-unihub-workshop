import { supabase } from '../lib/supabase.js'
import type { AuthenticatedProfile, UserRole } from '../middleware/auth.js'

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
  error: string | null
}

const PROFILE_COLUMNS = 'id, role, mssv, display_name, phone, must_change_password'

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

export async function updateOwnProfile(
  user: AuthenticatedProfile,
  patch: { display_name?: string; phone?: string | null },
): Promise<ServiceResult<ProfileDto>> {
  const { data, error } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', user.id)
    .select(PROFILE_COLUMNS)
    .single<ProfileRow>()

  if (error || !data) {
    return { data: null, error: error?.message ?? 'Profile update failed' }
  }

  return { data: mergeEmail(data, user.email), error: null }
}

export async function completePasswordChange(user: AuthenticatedProfile): Promise<ServiceResult<ProfileDto>> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ must_change_password: false })
    .eq('id', user.id)
    .select(PROFILE_COLUMNS)
    .single<ProfileRow>()

  if (error || !data) {
    return { data: null, error: error?.message ?? 'Password change completion failed' }
  }

  return { data: mergeEmail(data, user.email), error: null }
}
