import { beforeEach, describe, expect, it, vi } from 'vitest'

const supabaseMock = vi.hoisted(() => ({
  from: vi.fn(),
  auth: {
    admin: {
      createUser: vi.fn(),
      updateUserById: vi.fn(),
      deleteUser: vi.fn(),
    },
  },
}))

vi.mock('../lib/supabase.js', () => ({
  supabase: supabaseMock,
}))

import { CsvImportError, importStudentsFromCsv } from './csv.service.js'

interface QueryError {
  message: string
}

interface QueryResult<T> {
  data: T | null
  error: QueryError | null
}

interface StudentMemory {
  mssv: string
  full_name: string
  is_active: boolean
  last_synced_at?: string
}

interface ProfileMemory {
  id: string
  role: 'student' | 'organizer' | 'staff'
  mssv: string | null
  display_name: string
  phone: string | null
  must_change_password: boolean
}

interface MemoryDb {
  students: Map<string, StudentMemory>
  profiles: Map<string, ProfileMemory>
}

class MemoryQuery implements PromiseLike<QueryResult<unknown>> {
  private readonly filters = new Map<string, unknown>()
  private updatePayload: Record<string, unknown> | null = null

  constructor(
    private readonly table: string,
    private readonly db: MemoryDb,
  ) {}

  select(_columns: string): this {
    return this
  }

  eq(column: string, value: unknown): this {
    this.filters.set(column, value)
    return this
  }

  async in(column: string, values: string[]): Promise<QueryResult<unknown>> {
    this.filters.set(column, values)
    return this.execute()
  }

  update(payload: Record<string, unknown>): this {
    this.updatePayload = payload
    return this
  }

  async upsert(payload: StudentMemory | StudentMemory[], _options: { onConflict: string }): Promise<QueryResult<null>> {
    const rows = Array.isArray(payload) ? payload : [payload]
    rows.forEach((row) => {
      const existing = this.db.students.get(row.mssv)
      this.db.students.set(row.mssv, { ...existing, ...row })
    })
    return { data: null, error: null }
  }

  async insert(payload: ProfileMemory): Promise<QueryResult<null>> {
    this.db.profiles.set(payload.id, payload)
    return { data: null, error: null }
  }

  async returns<T>(): Promise<QueryResult<T>> {
    const result = await this.execute()
    return result as QueryResult<T>
  }

  async maybeSingle<T>(): Promise<QueryResult<T | null>> {
    const result = await this.executeRows()
    return { data: (result[0] ?? null) as T | null, error: null }
  }

  async single<T>(): Promise<QueryResult<T>> {
    const result = await this.executeRows()
    if (!result[0]) return { data: null, error: { message: 'not found' } }
    return { data: result[0] as T, error: null }
  }

  then<TResult1 = QueryResult<unknown>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<unknown>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled ?? undefined, onrejected ?? undefined)
  }

  private async execute(): Promise<QueryResult<unknown>> {
    if (this.updatePayload) {
      const rows = await this.executeRows()
      rows.forEach((row) => Object.assign(row as Record<string, unknown>, this.updatePayload))
      return { data: null, error: null }
    }

    return { data: await this.executeRows(), error: null }
  }

  private async executeRows(): Promise<unknown[]> {
    const rows = this.table === 'students'
      ? [...this.db.students.values()]
      : [...this.db.profiles.values()]

    return rows.filter((row) => {
      const record = row as unknown as Record<string, unknown>
      for (const [column, expected] of this.filters.entries()) {
        const actual = record[column]
        if (Array.isArray(expected)) {
          if (!expected.includes(String(actual))) return false
        } else if (actual !== expected) {
          return false
        }
      }
      return true
    })
  }
}

describe('CSV student import', () => {
  let db: MemoryDb
  let authSequence: number

  beforeEach(() => {
    db = {
      students: new Map(),
      profiles: new Map(),
    }
    authSequence = 0
    vi.clearAllMocks()

    supabaseMock.from.mockImplementation((table: string) => new MemoryQuery(table, db))
    supabaseMock.auth.admin.createUser.mockImplementation(async (attributes: { email?: string }) => {
      authSequence += 1
      return {
        data: { user: { id: `auth-${authSequence}`, email: attributes.email ?? null } },
        error: null,
      }
    })
    supabaseMock.auth.admin.updateUserById.mockImplementation(async (id: string) => ({
      data: { user: { id } },
      error: null,
    }))
    supabaseMock.auth.admin.deleteUser.mockResolvedValue({ data: {}, error: null })
  })

  it('imports the sample CSV, creates student accounts, and deactivates missing students', async () => {
    db.students.set('999999', {
      mssv: '999999',
      full_name: 'Old Student',
      is_active: true,
    })

    const csv = [
      'mssv,full_name',
      '23127001,Nguyễn Văn A',
      '23127417,Đào Hoàng Đức Mạnh',
      '22127403,Nguyễn Trần Minh Thư',
      '23127362,Phạm Anh Hào',
    ].join('\n')

    const result = await importStudentsFromCsv(csv, 'students_nightly_2026-05-13.csv')

    expect(result).toMatchObject({
      total: 4,
      valid: 4,
      created: 4,
      updated: 0,
      deactivated: 1,
      skipped: 0,
    })
    expect(db.students.get('999999')?.is_active).toBe(false)
    expect(db.profiles.size).toBe(4)
    expect(supabaseMock.auth.admin.createUser).toHaveBeenCalledTimes(4)
    expect('listUsers' in supabaseMock.auth.admin).toBe(false)
  })

  it('updates an existing profile, skips invalid rows, and keeps the last duplicate MSSV', async () => {
    db.students.set('23127001', {
      mssv: '23127001',
      full_name: 'Old Name',
      is_active: true,
    })
    db.profiles.set('profile-1', {
      id: 'profile-1',
      role: 'student',
      mssv: '23127001',
      display_name: 'Old Name',
      phone: null,
      must_change_password: false,
    })

    const csv = [
      'mssv,full_name',
      '23127001,New Name',
      'bad,Invalid Student',
      '23127001,Newest Name',
    ].join('\n')

    const result = await importStudentsFromCsv(csv)

    expect(result.valid).toBe(1)
    expect(result.updated).toBe(1)
    expect(result.created).toBe(0)
    expect(result.skipped).toBe(1)
    expect(db.students.get('23127001')?.full_name).toBe('Newest Name')
    expect(db.profiles.get('profile-1')?.display_name).toBe('Newest Name')
    expect(supabaseMock.auth.admin.updateUserById).toHaveBeenCalledWith(
      'profile-1',
      expect.objectContaining({
        user_metadata: { mssv: '23127001', full_name: 'Newest Name' },
      }),
    )
  })

  it('does not deactivate anyone when the file has only a valid header', async () => {
    db.students.set('23127001', {
      mssv: '23127001',
      full_name: 'Existing Student',
      is_active: true,
    })

    const result = await importStudentsFromCsv('mssv,full_name\n')

    expect(result.total).toBe(0)
    expect(result.valid).toBe(0)
    expect(result.deactivated).toBe(0)
    expect(db.students.get('23127001')?.is_active).toBe(true)
  })

  it('rejects files with the wrong header', async () => {
    await expect(importStudentsFromCsv('id,name\n1,Alice')).rejects.toBeInstanceOf(CsvImportError)
  })
})
