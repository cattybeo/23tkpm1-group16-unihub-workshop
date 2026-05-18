import type { Request, Response } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const identityMock = vi.hoisted(() => ({
  loginWithAccount: vi.fn(),
  refreshSession: vi.fn(),
  revokeSession: vi.fn(),
  toProfileDto: vi.fn(),
  updateOwnProfile: vi.fn(),
  completePasswordChange: vi.fn(),
}))

const supabaseAuthMock = vi.hoisted(() => ({
  auth: {
    refreshSession: vi.fn(),
  },
}))

vi.mock('../services/identity.service.js', () => identityMock)
vi.mock('../lib/supabase.js', () => ({
  supabase: {},
  supabaseAuth: supabaseAuthMock,
}))

import router from './auth.routes.js'

const USER_ID = 'e42833a1-0e87-48e1-a67d-2f5739eb8945'
const STUDENT_EMAIL = '22127403@student.hcmus.edu.vn'

interface CapturedResponse extends Response {
  statusCodeValue: number
  body: unknown
  cookies: Record<string, { value: string; options: unknown }>
  clearedCookies: string[]
}

function createResponse(): CapturedResponse {
  const res = {
    statusCodeValue: 200,
    body: undefined as unknown,
    cookies: {} as Record<string, { value: string; options: unknown }>,
    clearedCookies: [] as string[],
    status(code: number) { res.statusCodeValue = code; return res as unknown as Response },
    json(body: unknown) { res.body = body; return res as unknown as Response },
    cookie(name: string, value: string, options: unknown) { res.cookies[name] = { value, options }; return res as unknown as Response },
    clearCookie(name: string) { res.clearedCookies.push(name); return res as unknown as Response },
  }
  return res as unknown as CapturedResponse
}

function createRequest(body: unknown = {}, cookies: Record<string, string> = {}): Request {
  return { body, cookies, headers: {} } as unknown as Request
}

function makeLoginData() {
  return {
    session: { access_token: 'at-123', refresh_token: 'rt-abc', expires_at: 9999999999 },
    user: { id: USER_ID, email: STUDENT_EMAIL },
    profile: { id: USER_ID, email: STUDENT_EMAIL, role: 'student', mssv: '22127403', display_name: 'Student', phone: null, must_change_password: false },
  }
}

async function callRoute(method: string, path: string, req: Request, res: Response) {
  // Walk the router's stack to find the matching handler
  const stack = (router as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: (req: Request, res: Response, next: () => void) => void }> } }> }).stack
  for (const layer of stack) {
    if (layer.route?.path === path && layer.route.methods[method]) {
      for (const handler of layer.route.stack) {
        let nextCalled = false
        await handler.handle(req, res, () => { nextCalled = true })
        if (!nextCalled) return
      }
      return
    }
  }
  throw new Error(`Route ${method} ${path} not found`)
}

describe('POST /login', () => {
  beforeEach(() => vi.clearAllMocks())

  it('sets httpOnly cookie and strips refresh_token from response', async () => {
    identityMock.loginWithAccount.mockResolvedValue({ data: makeLoginData(), error: null })
    const req = createRequest({ account: '22127403', password: 'secret' })
    const res = createResponse()

    await callRoute('post', '/login', req, res)

    expect(res.statusCodeValue).toBe(200)
    const body = res.body as { data: { session: { access_token: string; refresh_token?: string } } }
    expect(body.data.session.access_token).toBe('at-123')
    expect(body.data.session).not.toHaveProperty('refresh_token')
    expect(res.cookies['sb_refresh'].value).toBe('rt-abc')
    const opts = res.cookies['sb_refresh'].options as Record<string, unknown>
    expect(opts.httpOnly).toBe(true)
    expect(opts.sameSite).toBe('lax')
    expect(opts.path).toBe('/api/v1/auth')
  })

  it('returns 401 AUTH_LOGIN_FAILED on bad credentials', async () => {
    identityMock.loginWithAccount.mockResolvedValue({ data: null, error: { code: 'AUTH_LOGIN_FAILED', message: 'Invalid account or password' } })
    const req = createRequest({ account: 'bad', password: 'wrong' })
    const res = createResponse()

    await callRoute('post', '/login', req, res)

    expect(res.statusCodeValue).toBe(401)
    expect((res.body as { error: { code: string } }).error.code).toBe('AUTH_LOGIN_FAILED')
    expect(res.cookies).not.toHaveProperty('sb_refresh')
  })

  it('returns 400 on invalid payload', async () => {
    const req = createRequest({})
    const res = createResponse()

    await callRoute('post', '/login', req, res)

    expect(res.statusCodeValue).toBe(400)
    expect((res.body as { error: { code: string } }).error.code).toBe('VALIDATION_FAILED')
  })
})

describe('POST /refresh', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns new access_token and rotates cookie on valid refresh token', async () => {
    identityMock.refreshSession.mockResolvedValue({
      data: {
        session: { access_token: 'new-at', refresh_token: 'new-rt', expires_at: 9999 },
        user: { id: USER_ID, email: STUDENT_EMAIL },
        profile: makeLoginData().profile,
      },
      error: null,
    })
    const req = createRequest({}, { sb_refresh: 'rt-abc' })
    const res = createResponse()

    await callRoute('post', '/refresh', req, res)

    expect(res.statusCodeValue).toBe(200)
    expect((res.body as { data: { session: { access_token: string } } }).data.session.access_token).toBe('new-at')
    expect(res.cookies['sb_refresh'].value).toBe('new-rt')
  })

  it('returns 401 REFRESH_TOKEN_MISSING when no cookie', async () => {
    const req = createRequest({}, {})
    const res = createResponse()

    await callRoute('post', '/refresh', req, res)

    expect(res.statusCodeValue).toBe(401)
    expect((res.body as { error: { code: string } }).error.code).toBe('REFRESH_TOKEN_MISSING')
  })

  it('returns 401 REFRESH_TOKEN_INVALID and clears cookie on bad token', async () => {
    identityMock.refreshSession.mockResolvedValue({ data: null, error: { code: 'REFRESH_TOKEN_INVALID', message: 'Invalid Refresh Token' } })
    const req = createRequest({}, { sb_refresh: 'bad-rt' })
    const res = createResponse()

    await callRoute('post', '/refresh', req, res)

    expect(res.statusCodeValue).toBe(401)
    expect((res.body as { error: { code: string } }).error.code).toBe('REFRESH_TOKEN_INVALID')
    expect(res.clearedCookies).toContain('sb_refresh')
  })
})

describe('POST /logout', () => {
  beforeEach(() => vi.clearAllMocks())

  it('clears cookie, resolves user and calls revokeSession', async () => {
    supabaseAuthMock.auth.refreshSession.mockResolvedValue({
      data: { user: { id: USER_ID }, session: { access_token: 'at', refresh_token: 'new-rt' } },
      error: null,
    })
    identityMock.revokeSession.mockResolvedValue({ data: { ok: true }, error: null })
    const req = createRequest({}, { sb_refresh: 'rt-abc' })
    const res = createResponse()

    await callRoute('post', '/logout', req, res)

    expect(res.statusCodeValue).toBe(200)
    expect(res.clearedCookies).toContain('sb_refresh')
    expect(identityMock.revokeSession).toHaveBeenCalledWith(USER_ID)
  })

  it('returns 200 and clears cookie even when no cookie present (idempotent)', async () => {
    const req = createRequest({}, {})
    const res = createResponse()

    await callRoute('post', '/logout', req, res)

    expect(res.statusCodeValue).toBe(200)
    expect(res.clearedCookies).toContain('sb_refresh')
    expect(identityMock.revokeSession).not.toHaveBeenCalled()
  })

  it('returns 200 even when revokeSession throws (best-effort)', async () => {
    supabaseAuthMock.auth.refreshSession.mockResolvedValue({
      data: { user: { id: USER_ID }, session: {} },
      error: null,
    })
    identityMock.revokeSession.mockRejectedValue(new Error('network error'))
    const req = createRequest({}, { sb_refresh: 'rt-abc' })
    const res = createResponse()

    await callRoute('post', '/logout', req, res)

    expect(res.statusCodeValue).toBe(200)
    expect(res.clearedCookies).toContain('sb_refresh')
  })
})
