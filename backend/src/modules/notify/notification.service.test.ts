import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { INotifier, NotificationStatus } from './types.js'

interface NotificationMemory {
  id: string
  user_id: string
  registration_id: string | null
  title: string
  body: string
  status: NotificationStatus
  retry_count: number
  last_error: string | null
  read_at: string | null
  created_at: string
  updated_at: string
}

interface QueryResult<T> {
  data: T | null
  error: { message: string } | null
}

interface Filter {
  column: keyof NotificationMemory
  op: 'eq' | 'lt' | 'in'
  value: unknown
}

const db = vi.hoisted(() => ({
  notifications: new Map<string, NotificationMemory>(),
}))

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  auth: {
    admin: {
      getUserById: vi.fn(),
    },
  },
}))

vi.mock('../../lib/supabase.js', () => ({
  supabase: supabaseMock,
}))

import { NotificationService } from './notification.service.js'

class NotificationQuery implements PromiseLike<QueryResult<unknown>> {
  private readonly filters: Filter[] = []
  private updatePayload: Partial<NotificationMemory> | null = null
  private selected = false
  private limitCount: number | null = null

  constructor(private readonly table: string) {}

  select(_columns: string): this {
    this.selected = true
    return this
  }

  update(payload: Partial<NotificationMemory>): this {
    this.updatePayload = payload
    return this
  }

  eq(column: keyof NotificationMemory, value: unknown): this {
    this.filters.push({ column, op: 'eq', value })
    return this
  }

  lt(column: keyof NotificationMemory, value: unknown): this {
    this.filters.push({ column, op: 'lt', value })
    return this
  }

  in(column: keyof NotificationMemory, value: unknown[]): this {
    this.filters.push({ column, op: 'in', value })
    return this
  }

  order(_column: keyof NotificationMemory, _options: { ascending: boolean }): this {
    return this
  }

  limit(count: number): this {
    this.limitCount = count
    return this
  }

  single<T>(): Promise<QueryResult<T>> {
    return this.execute().then(r => ({ data: (r.data as T[] | null)?.[0] ?? null, error: r.error })) as Promise<QueryResult<T>>
  }

  returns<T>(): Promise<QueryResult<T>> {
    return this.execute() as Promise<QueryResult<T>>
  }

  then<TResult1 = QueryResult<unknown>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected)
  }

  private async execute(): Promise<QueryResult<unknown>> {
    if (this.table !== 'notifications') {
      return { data: null, error: { message: `Unexpected table: ${this.table}` } }
    }

    const rows = Array.from(db.notifications.values()).filter(row => this.matches(row))

    if (this.updatePayload) {
      rows.forEach(row => {
        Object.assign(row, this.updatePayload, { updated_at: new Date().toISOString() })
      })
    }

    const limited = this.limitCount === null ? rows : rows.slice(0, this.limitCount)
    return { data: this.selected ? limited.map(row => ({ ...row })) : null, error: null }
  }

  private matches(row: NotificationMemory): boolean {
    return this.filters.every(filter => {
      const actual = row[filter.column]
      if (filter.op === 'eq') return actual === filter.value
      if (filter.op === 'in') return Array.isArray(filter.value) && filter.value.includes(actual)
      if (filter.op === 'lt') {
        if (typeof actual === 'number' && typeof filter.value === 'number') {
          return actual < filter.value
        }
        if (typeof actual === 'string' && typeof filter.value === 'string') {
          return actual < filter.value
        }
        return false
      }
      return false
    })
  }
}

function createNotifier(channel: string, shouldFail = false): INotifier {
  return {
    channel,
    send: vi.fn(async () => {
      if (shouldFail) throw new Error(`${channel} failed`)
    }),
  }
}

function seedNotification(overrides: Partial<NotificationMemory> = {}): NotificationMemory {
  const row: NotificationMemory = {
    id: overrides.id ?? randomUUID(),
    user_id: overrides.user_id ?? 'user-1',
    registration_id: overrides.registration_id ?? 'registration-1',
    title: overrides.title ?? 'Đăng ký workshop thành công',
    body: overrides.body ?? 'Mã QR đã sẵn sàng trong Vé của tôi.',
    status: overrides.status ?? 'pending',
    retry_count: overrides.retry_count ?? 0,
    last_error: overrides.last_error ?? null,
    read_at: overrides.read_at ?? null,
    created_at: overrides.created_at ?? new Date().toISOString(),
    updated_at: overrides.updated_at ?? new Date(Date.now() - 5 * 60_000).toISOString(),
  }
  db.notifications.set(row.id, row)
  return row
}

describe('NotificationService', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    db.notifications.clear()
    supabaseMock.from.mockImplementation((table: string) => new NotificationQuery(table))
    supabaseMock.auth.admin.getUserById.mockResolvedValue({
      data: { user: { email: 'student@example.edu' } },
      error: null,
    })
    vi.spyOn(console, 'error').mockImplementation(() => undefined)
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('marks notification sent when email fails but in-app succeeds', async () => {
    const row = seedNotification({ id: 'notification-1' })
    const service = new NotificationService([
      createNotifier('in_app'),
      createNotifier('email', true),
    ])

    await service.dispatch(row.id)

    expect(db.notifications.get(row.id)?.status).toBe('sent')
    expect(db.notifications.get(row.id)?.retry_count).toBe(0)
    expect(db.notifications.get(row.id)?.last_error).toBeNull()
  })

  it('marks notification failed and increments retry count when in-app fails', async () => {
    const row = seedNotification({ id: 'notification-2' })
    const service = new NotificationService([
      createNotifier('in_app', true),
      createNotifier('email'),
    ])

    await service.dispatch(row.id)

    expect(db.notifications.get(row.id)?.status).toBe('failed')
    expect(db.notifications.get(row.id)?.retry_count).toBe(1)
    expect(db.notifications.get(row.id)?.last_error).toBe('in_app failed')
  })

  it('retries old pending and stuck notifications only', async () => {
    const oldPending = seedNotification({ id: 'old-pending', status: 'pending' })
    const stuck = seedNotification({ id: 'stuck', status: 'in_progress' })
    const fresh = seedNotification({
      id: 'fresh',
      status: 'pending',
      updated_at: new Date().toISOString(),
    })
    const service = new NotificationService([
      createNotifier('in_app'),
      createNotifier('email'),
    ])

    await service.retryPending()

    expect(db.notifications.get(oldPending.id)?.status).toBe('sent')
    expect(db.notifications.get(stuck.id)?.status).toBe('sent')
    expect(db.notifications.get(fresh.id)?.status).toBe('pending')
  })

  it('lists notifications for the current user only', async () => {
    seedNotification({ id: 'own', user_id: 'user-1' })
    seedNotification({ id: 'other', user_id: 'user-2' })
    const service = new NotificationService([createNotifier('in_app')])

    const notifications = await service.listForUser('user-1')

    expect(notifications).toHaveLength(1)
    expect(notifications[0]?.id).toBe('own')
  })
})
