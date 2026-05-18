import type { Session, User } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { AuthenticatedProfile } from '../middleware/auth.js'

const supabaseMock = vi.hoisted(() => ({
  auth: {
    admin: {
      getUserById: vi.fn(),
      updateUserById: vi.fn(),
      signOut: vi.fn(),
    },
  },
  from: vi.fn(),
}))

const supabaseAuthMock = vi.hoisted(() => ({
  auth: {
    signInWithPassword: vi.fn(),
    refreshSession: vi.fn(),
  },
}))

vi.mock('../lib/supabase.js', () => ({
  supabase: supabaseMock,
  supabaseAuth: supabaseAuthMock,
}))

import { loginWithAccount, refreshSession, revokeSession, updateOwnProfile } from './identity.service.js'

const USER_ID = 'e42833a1-0e87-48e1-a67d-2f5739eb8945'
const STUDENT_EMAIL = '22127403@student.hcmus.edu.vn'
const CHANGED_EMAIL = 'custom.student@gmail.com'

interface QueryResult<T> {
  data: T | null
  error: { message: string } | null
}

function createSingleQuery<T>(result: QueryResult<T>) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  }
}

function createProfileRow(email = STUDENT_EMAIL, role: 'student' | 'organizer' | 'staff' = 'student') {
  return {
    id: USER_ID,
    email,
    role,
    mssv: '22127403',
    display_name: 'Student',
    phone: null,
    must_change_password: false,
  }
}

function createAuthUser(email = STUDENT_EMAIL): User {
  return {
    id: USER_ID,
    email,
  } as unknown as User
}

function createSession(email = STUDENT_EMAIL): Session {
  return {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    user: createAuthUser(email),
  } as unknown as Session
}

function createAuthenticatedProfile(email = STUDENT_EMAIL): AuthenticatedProfile {
  return {
    id: USER_ID,
    email,
    role: 'student',
    mssv: '22127403',
    display_name: 'Student',
    phone: null,
    must_change_password: false,
  }
}

describe('identity service auth email', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('logs in with MSSV by resolving the current Supabase Auth email', async () => {
    supabaseMock.from
      .mockReturnValueOnce(createSingleQuery({ data: { id: USER_ID }, error: null }))
      .mockReturnValueOnce(createSingleQuery({ data: createProfileRow(CHANGED_EMAIL), error: null }))
    supabaseMock.auth.admin.getUserById.mockResolvedValue({
      data: { user: { email: CHANGED_EMAIL } },
      error: null,
    })
    supabaseAuthMock.auth.signInWithPassword.mockResolvedValue({
      data: { session: createSession(CHANGED_EMAIL), user: createAuthUser(CHANGED_EMAIL) },
      error: null,
    })

    const result = await loginWithAccount('22127403', 'secret')

    expect(result.error).toBeNull()
    expect(result.data?.profile.email).toBe(CHANGED_EMAIL)
    expect(supabaseMock.auth.admin.getUserById).toHaveBeenCalledWith(USER_ID)
    expect(supabaseAuthMock.auth.signInWithPassword).toHaveBeenCalledWith({
      email: CHANGED_EMAIL,
      password: 'secret',
    })
  })

  it('logs in directly with any valid email', async () => {
    supabaseMock.from.mockReturnValueOnce(createSingleQuery({ data: createProfileRow(CHANGED_EMAIL), error: null }))
    supabaseAuthMock.auth.signInWithPassword.mockResolvedValue({
      data: { session: createSession(CHANGED_EMAIL), user: createAuthUser(CHANGED_EMAIL) },
      error: null,
    })

    const result = await loginWithAccount(CHANGED_EMAIL, 'secret')

    expect(result.error).toBeNull()
    expect(supabaseMock.auth.admin.getUserById).not.toHaveBeenCalled()
    expect(supabaseAuthMock.auth.signInWithPassword).toHaveBeenCalledWith({
      email: CHANGED_EMAIL,
      password: 'secret',
    })
  })

  it('rejects invalid email login before calling Supabase Auth', async () => {
    const result = await loginWithAccount('student@gmail', 'secret')

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('INVALID_EMAIL')
    expect(supabaseAuthMock.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('allows staff login with non-student email when login type is staff', async () => {
    supabaseMock.from.mockReturnValueOnce(createSingleQuery({ data: createProfileRow('staff@unihub', 'staff'), error: null }))
    supabaseAuthMock.auth.signInWithPassword.mockResolvedValue({
      data: { session: createSession('staff@unihub'), user: createAuthUser('staff@unihub') },
      error: null,
    })

    const result = await loginWithAccount('staff@unihub', 'secret', 'staff')

    expect(result.error).toBeNull()
    expect(result.data?.profile.role).toBe('staff')
    expect(supabaseAuthMock.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'staff@unihub',
      password: 'secret',
    })
  })

  it('allows staff login with a non-email username (e.g. staff@unihub)', async () => {
    supabaseMock.from.mockReturnValueOnce(createSingleQuery({ data: createProfileRow('staff@unihub', 'staff'), error: null }))
    supabaseAuthMock.auth.signInWithPassword.mockResolvedValue({
      data: { session: createSession('staff@unihub'), user: createAuthUser('staff@unihub') },
      error: null,
    })

    const result = await loginWithAccount('staff', 'secret', 'staff')

    expect(result.error).toBeNull()
    expect(result.data?.profile.role).toBe('staff')
    expect(supabaseAuthMock.auth.signInWithPassword).toHaveBeenCalledWith({
      email: 'staff',
      password: 'secret',
    })
  })

  it('rejects staff login when role is student', async () => {
    supabaseMock.from.mockReturnValueOnce(createSingleQuery({ data: createProfileRow(STUDENT_EMAIL, 'student'), error: null }))
    supabaseAuthMock.auth.signInWithPassword.mockResolvedValue({
      data: { session: createSession(), user: createAuthUser() },
      error: null,
    })

    const result = await loginWithAccount(STUDENT_EMAIL, 'secret', 'staff')

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('FORBIDDEN_ROLE')
  })

  it('updates email through Supabase Auth Admin and returns the new email', async () => {
    supabaseMock.auth.admin.updateUserById.mockResolvedValue({ data: { user: createAuthUser(CHANGED_EMAIL) }, error: null })
    supabaseMock.from.mockReturnValueOnce(createSingleQuery({ data: createProfileRow(CHANGED_EMAIL), error: null }))

    const result = await updateOwnProfile(createAuthenticatedProfile(), { email: CHANGED_EMAIL })

    expect(result.error).toBeNull()
    expect(result.data?.email).toBe(CHANGED_EMAIL)
    expect(supabaseMock.auth.admin.updateUserById).toHaveBeenCalledWith(USER_ID, {
      email: CHANGED_EMAIL,
      email_confirm: true,
    })
  })

  it('maps duplicate Auth email failures to EMAIL_ALREADY_IN_USE', async () => {
    supabaseMock.auth.admin.updateUserById.mockResolvedValue({
      data: { user: null },
      error: { message: 'A user with this email address has already been registered' },
    })

    const result = await updateOwnProfile(createAuthenticatedProfile(), { email: CHANGED_EMAIL })

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('EMAIL_ALREADY_IN_USE')
  })

  it('rejects invalid profile email updates before calling Supabase Auth Admin', async () => {
    const result = await updateOwnProfile(createAuthenticatedProfile(), { email: 'custom.student@gmail' })

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('INVALID_EMAIL')
    expect(supabaseMock.auth.admin.updateUserById).not.toHaveBeenCalled()
  })
})

describe('refreshSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns new session, user and profile on valid refresh token', async () => {
    const newSession = {
      access_token: 'new-access-token',
      refresh_token: 'new-refresh-token',
      expires_at: 9999999999,
    }
    supabaseAuthMock.auth.refreshSession.mockResolvedValue({
      data: { session: newSession, user: createAuthUser() },
      error: null,
    })
    supabaseMock.from.mockReturnValueOnce(createSingleQuery({ data: createProfileRow(), error: null }))

    const result = await refreshSession('valid-refresh-token')

    expect(result.error).toBeNull()
    expect(result.data?.session.access_token).toBe('new-access-token')
    expect(result.data?.session.refresh_token).toBe('new-refresh-token')
    expect(result.data?.session.expires_at).toBe(9999999999)
    expect(result.data?.profile.email).toBe(STUDENT_EMAIL)
    expect(supabaseAuthMock.auth.refreshSession).toHaveBeenCalledWith({ refresh_token: 'valid-refresh-token' })
  })

  it('returns REFRESH_TOKEN_INVALID when Supabase returns an error', async () => {
    supabaseAuthMock.auth.refreshSession.mockResolvedValue({
      data: { session: null, user: null },
      error: { message: 'Invalid Refresh Token: Already Used' },
    })

    const result = await refreshSession('used-refresh-token')

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('REFRESH_TOKEN_INVALID')
  })

  it('returns REFRESH_TOKEN_INVALID when session is missing from response', async () => {
    supabaseAuthMock.auth.refreshSession.mockResolvedValue({
      data: { session: null, user: null },
      error: null,
    })

    const result = await refreshSession('bad-token')

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('REFRESH_TOKEN_INVALID')
  })

  it('returns PROFILE_NOT_FOUND when profile lookup fails after refresh', async () => {
    supabaseAuthMock.auth.refreshSession.mockResolvedValue({
      data: {
        session: { access_token: 'at', refresh_token: 'rt', expires_at: 9999 },
        user: createAuthUser(),
      },
      error: null,
    })
    supabaseMock.from.mockReturnValueOnce(createSingleQuery({ data: null, error: { message: 'not found' } }))

    const result = await refreshSession('valid-token')

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('PROFILE_NOT_FOUND')
  })
})

describe('revokeSession', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns ok:true when signOut succeeds', async () => {
    supabaseMock.auth.admin.signOut.mockResolvedValue({ error: null })

    const result = await revokeSession(USER_ID)

    expect(result.error).toBeNull()
    expect(result.data).toEqual({ ok: true })
    expect(supabaseMock.auth.admin.signOut).toHaveBeenCalledWith(USER_ID)
  })

  it('returns LOGOUT_FAILED when signOut errors', async () => {
    supabaseMock.auth.admin.signOut.mockResolvedValue({ error: { message: 'user not found' } })

    const result = await revokeSession(USER_ID)

    expect(result.data).toBeNull()
    expect(result.error?.code).toBe('LOGOUT_FAILED')
  })
})
