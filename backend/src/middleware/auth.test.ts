import type { NextFunction, Request, Response } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMock = vi.hoisted(() => ({
  auth: {
    getUser: vi.fn(),
  },
  from: vi.fn(),
}))

vi.mock('../lib/supabase.js', () => ({
  supabase: supabaseMock,
}))

import { loadProfile, requireRole, verifyJwt } from './auth.js'

const USER_ID = 'e42833a1-0e87-48e1-a67d-2f5739eb8945'

interface CapturedResponse extends Response {
  statusCodeValue: number
  body: unknown
}

interface QueryResult<T> {
  data: T | null
  error: { message: string } | null
}

function createResponse(): CapturedResponse {
  const response = {
    statusCodeValue: 200,
    body: undefined as unknown,
    status(code: number) {
      response.statusCodeValue = code
      return response as unknown as Response
    },
    json(body: unknown) {
      response.body = body
      return response as unknown as Response
    },
  }

  return response as unknown as CapturedResponse
}

function createProfileQuery<T>(result: QueryResult<T>) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  }
}

describe('auth middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('returns UNAUTHENTICATED when Authorization is missing', async () => {
    const req = { headers: {} } as Request
    const res = createResponse()
    const next = vi.fn() as NextFunction

    await verifyJwt(req, res, next)

    expect(res.statusCodeValue).toBe(401)
    expect(res.body).toMatchObject({ error: { code: 'UNAUTHENTICATED' } })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns INVALID_TOKEN when Supabase rejects the JWT', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'invalid JWT' },
    })

    const req = { headers: { authorization: 'Bearer bad-token' } } as Request
    const res = createResponse()
    const next = vi.fn() as NextFunction

    await verifyJwt(req, res, next)

    expect(res.statusCodeValue).toBe(401)
    expect(res.body).toMatchObject({ error: { code: 'INVALID_TOKEN' } })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns TOKEN_EXPIRED for expired JWT errors', async () => {
    supabaseMock.auth.getUser.mockResolvedValue({
      data: { user: null },
      error: { message: 'JWT expired' },
    })

    const req = { headers: { authorization: 'Bearer old-token' } } as Request
    const res = createResponse()
    const next = vi.fn() as NextFunction

    await verifyJwt(req, res, next)

    expect(res.statusCodeValue).toBe(401)
    expect(res.body).toMatchObject({ error: { code: 'TOKEN_EXPIRED' } })
  })

  it('loads profile on every request so role changes are effective immediately', async () => {
    supabaseMock.from
      .mockReturnValueOnce(createProfileQuery({
        data: {
          id: USER_ID,
          role: 'student',
          mssv: '23127001',
          display_name: 'Student',
          phone: null,
          must_change_password: false,
        },
        error: null,
      }))
      .mockReturnValueOnce(createProfileQuery({
        data: {
          id: USER_ID,
          role: 'organizer',
          mssv: null,
          display_name: 'Organizer',
          phone: null,
          must_change_password: false,
        },
        error: null,
      }))

    const firstReq = { authUser: { id: USER_ID, email: 'u@example.com' } } as Request
    const secondReq = { authUser: { id: USER_ID, email: 'u@example.com' } } as Request
    const firstNext = vi.fn() as NextFunction
    const secondNext = vi.fn() as NextFunction

    await loadProfile(firstReq, createResponse(), firstNext)
    await loadProfile(secondReq, createResponse(), secondNext)

    expect(firstReq.user?.role).toBe('student')
    expect(secondReq.user?.role).toBe('organizer')
    expect(supabaseMock.from).toHaveBeenCalledTimes(2)
  })

  it('returns PROFILE_NOT_FOUND when the JWT user has no profile', async () => {
    supabaseMock.from.mockReturnValue(createProfileQuery({ data: null, error: { message: 'not found' } }))
    const req = { authUser: { id: 'missing', email: null } } as Request
    const res = createResponse()
    const next = vi.fn() as NextFunction

    await loadProfile(req, res, next)

    expect(res.statusCodeValue).toBe(401)
    expect(res.body).toMatchObject({ error: { code: 'PROFILE_NOT_FOUND' } })
    expect(next).not.toHaveBeenCalled()
  })

  it('returns FORBIDDEN_ROLE when role is not allowed', () => {
    const req = {
      user: {
        id: USER_ID,
        email: null,
        role: 'student',
        mssv: '23127001',
        display_name: 'Student',
        phone: null,
        must_change_password: false,
      },
    } as Request
    const res = createResponse()
    const next = vi.fn() as NextFunction

    requireRole(['organizer'])(req, res, next)

    expect(res.statusCodeValue).toBe(403)
    expect(res.body).toMatchObject({ error: { code: 'FORBIDDEN_ROLE' } })
    expect(next).not.toHaveBeenCalled()
  })
})
