// Unit tests for the idempotency middleware.
// Covers blueprint/specs/payment.md acceptance criteria:
//   - Missing header → 400 IDEMPOTENCY_KEY_REQUIRED.
//   - Concurrent INSERTs with the same key — only one handler runs; the loser
//     observes the cached response (no double-charge).
//   - Conflict + empty cached response (request still in progress) → 409.

import type { NextFunction, Request } from 'express'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
}))

vi.mock('../lib/supabase.js', () => ({
  supabase: supabaseMock,
}))

import { idempotencyMiddleware } from './idempotency.js'

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

type JsonBody = Record<string, unknown>

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type FakeResponse = { _status: number; _body: JsonBody | null } & Record<string, any>

function makeRequest(opts: { key?: string; path?: string; userId?: string } = {}): Request {
  const headers: Record<string, string> = {}
  if (opts.key !== undefined) headers['idempotency-key'] = opts.key
  return {
    headers,
    path: opts.path ?? '/payments',
    user: opts.userId ? { id: opts.userId } : undefined,
  } as unknown as Request
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makeResponse(): any {
  const res = {
    _status: 200,
    _body:   null,
  } as FakeResponse
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.status = vi.fn((s: number) => { res._status = s; return res }) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.json   = vi.fn((b: JsonBody) => { res._body = b; return res }) as any
  return res
}

// Each test reconfigures these chained builders to emulate the relevant
// supabase response.
function insertResponse(error: { code?: string; message?: string } | null) {
  return { insert: vi.fn().mockResolvedValue({ error }) }
}

function selectResponseSingle<T>(result: { data: T | null; error: { message: string } | null }) {
  return {
    select: vi.fn().mockReturnThis(),
    eq:     vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue(result),
  }
}

function updateThenable() {
  // The middleware does `.update().eq().eq().then(...)` — last `.eq` must be thenable.
  const tail = {
    then: vi.fn((cb: (r: { error: null }) => void) => { cb({ error: null }); return Promise.resolve() }),
  }
  return {
    update: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({ eq: vi.fn().mockReturnValue(tail) }),
    }),
  }
}

// ---------------------------------------------------------------------------
// E — Missing header → 400
// ---------------------------------------------------------------------------

describe('idempotencyMiddleware — header required', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 400 IDEMPOTENCY_KEY_REQUIRED when header is absent', async () => {
    const req  = makeRequest({ key: undefined })
    const res  = makeResponse()
    const next = vi.fn()

    await idempotencyMiddleware(req, res, next as NextFunction)

    expect(res._status).toBe(400)
    expect(res._body).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } })
    expect(next).not.toHaveBeenCalled()
    expect(supabaseMock.from).not.toHaveBeenCalled()
  })

  it('returns 400 when header is empty / whitespace', async () => {
    const req  = makeRequest({ key: '   ' })
    const res  = makeResponse()
    const next = vi.fn()

    await idempotencyMiddleware(req, res, next as NextFunction)

    expect(res._status).toBe(400)
    expect(res._body).toMatchObject({ error: { code: 'IDEMPOTENCY_KEY_REQUIRED' } })
    expect(next).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// F — Conflict + empty response → 409 REQUEST_IN_PROGRESS
// ---------------------------------------------------------------------------

describe('idempotencyMiddleware — request still in progress', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 409 REQUEST_IN_PROGRESS when key exists with empty response', async () => {
    supabaseMock.from
      .mockReturnValueOnce(insertResponse({ code: '23505' }))
      .mockReturnValueOnce(selectResponseSingle({ data: { response: {} }, error: null }))

    const req  = makeRequest({ key: 'dup-key' })
    const res  = makeResponse()
    const next = vi.fn()

    await idempotencyMiddleware(req, res, next as NextFunction)

    expect(res._status).toBe(409)
    expect(res._body).toMatchObject({ error: { code: 'REQUEST_IN_PROGRESS' } })
    expect(next).not.toHaveBeenCalled()
  })

  it('replays cached response when key exists with a non-empty response (status 200)', async () => {
    const cached = { data: { payment_id: 'pay_123', status: 'paid' }, error: null }
    supabaseMock.from
      .mockReturnValueOnce(insertResponse({ code: '23505' }))
      .mockReturnValueOnce(selectResponseSingle({ data: { response: cached }, error: null }))

    const req  = makeRequest({ key: 'dup-key' })
    const res  = makeResponse()
    const next = vi.fn()

    await idempotencyMiddleware(req, res, next as NextFunction)

    expect(res._status).toBe(200)
    expect(res._body).toEqual(cached)
    expect(next).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// D — Race: two concurrent calls with same key.
// First call wins the INSERT and runs the handler; second sees 23505 conflict
// and (after the first finishes) replays the cached body. Only one handler invocation.
// ---------------------------------------------------------------------------

describe('idempotencyMiddleware — concurrent same-key race', () => {
  beforeEach(() => vi.clearAllMocks())

  it('first call runs handler; second call returns cached body (no double-charge)', async () => {
    // The "DB" state for the single (key, endpoint) row.
    let stored: JsonBody | null = null

    supabaseMock.from.mockImplementation(() => ({
      insert: vi.fn().mockImplementation(async () => {
        // First insert succeeds; subsequent inserts conflict.
        if (stored === null) {
          stored = {} // mark in-progress
          return { error: null }
        }
        return { error: { code: '23505', message: 'duplicate' } }
      }),
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      single: vi.fn().mockImplementation(async () => ({ data: { response: stored }, error: null })),
      update: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            then: vi.fn((cb: (r: { error: null }) => void) => {
              // Update cached body in our fake DB.
              stored = capturedBody
              cb({ error: null })
              return Promise.resolve()
            }),
          }),
        }),
      }),
    }))

    let chargeCount  = 0
    let capturedBody: JsonBody = {}
    const handlerBody = { data: { payment_id: 'pay_only_once' }, error: null }

    async function runOnce(): Promise<FakeResponse> {
      const req  = makeRequest({ key: 'race-key' })
      const res  = makeResponse()
      const next = vi.fn(async () => {
        // Simulate handler doing the side-effectful "charge" then writing response.
        chargeCount++
        capturedBody = handlerBody
        res.json(handlerBody)
      })

      await idempotencyMiddleware(req, res, next as unknown as NextFunction)
      // If middleware called next(), let the handler resolve.
      if ((next as ReturnType<typeof vi.fn>).mock.calls.length > 0) {
        await (next as ReturnType<typeof vi.fn>).mock.results[0].value
      }
      return res
    }

    // Run sequentially to model "second arrives after first has stored its response".
    // (Modeling literal Promise.all concurrency requires interleaving the fake DB —
    //  the assertion that matters is: exactly one handler invocation across both calls.)
    const r1 = await runOnce()
    const r2 = await runOnce()

    expect(chargeCount).toBe(1)
    expect(r1._body).toEqual(handlerBody)
    expect(r2._body).toEqual(handlerBody)
    expect(r2._status).toBe(200)
  })

  it('second concurrent call (before first finishes) gets 409 REQUEST_IN_PROGRESS', async () => {
    // Both calls insert before either finishes → second sees conflict + empty response.
    let inserts = 0
    supabaseMock.from.mockImplementation(() => ({
      insert: vi.fn().mockImplementation(async () => {
        inserts++
        if (inserts === 1) return { error: null }
        return { error: { code: '23505', message: 'duplicate' } }
      }),
      select: vi.fn().mockReturnThis(),
      eq:     vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: { response: {} }, error: null }),
      ...updateThenable(),
    }))

    const winnerReq  = makeRequest({ key: 'race-key-2' })
    const winnerRes  = makeResponse()
    const winnerNext = vi.fn()

    const loserReq   = makeRequest({ key: 'race-key-2' })
    const loserRes   = makeResponse()
    const loserNext  = vi.fn()

    await Promise.all([
      idempotencyMiddleware(winnerReq, winnerRes, winnerNext as NextFunction),
      idempotencyMiddleware(loserReq,  loserRes,  loserNext  as NextFunction),
    ])

    expect(winnerNext).toHaveBeenCalledTimes(1)
    expect(loserNext).not.toHaveBeenCalled()
    expect(loserRes._status).toBe(409)
    expect(loserRes._body).toMatchObject({ error: { code: 'REQUEST_IN_PROGRESS' } })
  })
})
