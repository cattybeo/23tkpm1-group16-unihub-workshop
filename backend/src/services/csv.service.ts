import { createReadStream } from 'node:fs'
import { readdir } from 'node:fs/promises'
import path from 'node:path'
import { createInterface } from 'node:readline'
import Papa from 'papaparse'
import { z } from 'zod'
import { supabase } from '../lib/supabase.js'
import type { ErrorCode } from '../shared/http.js'

const DEFAULT_PASSWORD = process.env.STUDENT_DEFAULT_PASSWORD ?? '123'
const EMAIL_DOMAIN = process.env.STUDENT_EMAIL_DOMAIN ?? 'students.unihub.internal'
const BATCH_SIZE = 1_000
const NIGHTLY_FILE_RE = /^students_nightly_(\d{4}-\d{2}-\d{2})\.csv$/
const PROFILE_COLUMNS = 'id, role, mssv, display_name, phone, must_change_password'

interface RawCsvRow {
  mssv?: string | null
  full_name?: string | null
}

interface ValidStudentRow {
  mssv: string
  full_name: string
}

interface StudentKeyRow {
  mssv: string
}

interface ProfileRow {
  id: string
  role: 'student' | 'organizer' | 'staff'
  mssv: string | null
  display_name: string
  phone: string | null
  must_change_password: boolean
}

interface AuthUserLite {
  id: string
  email?: string | null
}

export interface CsvRowError {
  row?: number
  mssv: string
  reason: string
}

export interface ImportResult {
  source_file: string | null
  total: number
  valid: number
  created: number
  updated: number
  deactivated: number
  skipped: number
  errors: CsvRowError[]
}

interface ParsedCsv {
  rows: RawCsvRow[]
  fields: string[]
  parseErrors: Papa.ParseError[]
}

const CsvRowSchema = z.object({
  mssv: z.string().trim().regex(/^[A-Za-z0-9]{6,20}$/),
  full_name: z.string().trim().min(1).max(200),
})

export class CsvImportError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status = 400,
    public readonly details?: unknown,
  ) {
    super(message)
  }
}

function normalizeHeader(header: string): string {
  return header.trim().replace(/^\uFEFF/, '').toLowerCase()
}

function validateHeader(fields: string[]): void {
  if (fields.length !== 2 || fields[0] !== 'mssv' || fields[1] !== 'full_name') {
    throw new CsvImportError(
      'CSV_HEADER_INVALID',
      'CSV header must be exactly: mssv,full_name',
      400,
      { fields },
    )
  }
}

function parseCsvText(csvText: string): ParsedCsv {
  const source = csvText.replace(/^\uFEFF/, '')
  if (!source.trim()) {
    throw new CsvImportError('CSV_HEADER_INVALID', 'CSV file is empty or missing header')
  }

  const parsed = Papa.parse<RawCsvRow>(source, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: normalizeHeader,
  })

  validateHeader(parsed.meta.fields ?? [])

  return {
    rows: parsed.data,
    fields: parsed.meta.fields ?? [],
    parseErrors: parsed.errors,
  }
}

async function readHeaderLine(filePath: string): Promise<string> {
  const input = createReadStream(filePath, { encoding: 'utf8' })
  const reader = createInterface({ input, crlfDelay: Infinity })

  try {
    for await (const line of reader) {
      reader.close()
      input.destroy()
      return line
    }
  } finally {
    reader.close()
    input.destroy()
  }

  throw new CsvImportError('CSV_HEADER_INVALID', 'CSV file is empty or missing header')
}

async function parseCsvFile(filePath: string): Promise<ParsedCsv> {
  const headerLine = await readHeaderLine(filePath)
  const fields = headerLine.split(',').map(normalizeHeader)
  validateHeader(fields)

  return new Promise<ParsedCsv>((resolve, reject) => {
    const rows: RawCsvRow[] = []
    const parseErrors: Papa.ParseError[] = []
    const parser = Papa.parse(Papa.NODE_STREAM_INPUT, {
      header: true,
      skipEmptyLines: 'greedy',
      transformHeader: normalizeHeader,
    })

    parser.on('data', (row: RawCsvRow) => rows.push(row))
    parser.on('error', (error: Error) => reject(error))
    parser.on('end', () => resolve({ rows, fields, parseErrors }))

    createReadStream(filePath, { encoding: 'utf8' }).pipe(parser)
  })
}

function normalizeRows(parsed: ParsedCsv): { rows: ValidStudentRow[]; errors: CsvRowError[] } {
  const errors: CsvRowError[] = parsed.parseErrors.map((error) => ({
    row: typeof error.row === 'number' ? error.row + 2 : undefined,
    mssv: '(unknown)',
    reason: error.message,
  }))
  const byMssv = new Map<string, ValidStudentRow>()

  parsed.rows.forEach((row, index) => {
    const normalized = CsvRowSchema.safeParse({
      mssv: row.mssv ?? '',
      full_name: row.full_name ?? '',
    })

    if (!normalized.success) {
      errors.push({
        row: index + 2,
        mssv: row.mssv?.trim() || '(empty)',
        reason: normalized.error.issues.map((issue) => issue.message).join('; '),
      })
      return
    }

    byMssv.set(normalized.data.mssv, normalized.data)
  })

  return { rows: [...byMssv.values()], errors }
}

function chunkRows<T>(rows: T[], size: number): T[][] {
  const chunks: T[][] = []
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size))
  }
  return chunks
}

async function fetchExistingStudents(): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('students')
    .select('mssv')
    .returns<StudentKeyRow[]>()

  if (error) {
    throw new CsvImportError('CSV_IMPORT_FAILED', error.message, 500)
  }

  return new Set((data ?? []).map((student) => student.mssv))
}

async function upsertStudents(rows: ValidStudentRow[], importedAt: string): Promise<void> {
  for (const batch of chunkRows(rows, BATCH_SIZE)) {
    const payload = batch.map((row) => ({
      mssv: row.mssv,
      full_name: row.full_name,
      is_active: true,
      last_synced_at: importedAt,
    }))
    const { error } = await supabase.from('students').upsert(payload, { onConflict: 'mssv' })
    if (error) {
      throw new CsvImportError('CSV_IMPORT_FAILED', error.message, 500)
    }
  }
}

async function deactivateMissingStudents(importedMssv: Set<string>, importedAt: string): Promise<number> {
  if (importedMssv.size === 0) return 0

  const { data, error } = await supabase
    .from('students')
    .select('mssv')
    .eq('is_active', true)
    .returns<StudentKeyRow[]>()

  if (error) {
    throw new CsvImportError('CSV_IMPORT_FAILED', error.message, 500)
  }

  const toDeactivate = (data ?? [])
    .map((student) => student.mssv)
    .filter((mssv) => !importedMssv.has(mssv))

  for (const batch of chunkRows(toDeactivate, BATCH_SIZE)) {
    const { error: updateError } = await supabase
      .from('students')
      .update({ is_active: false, last_synced_at: importedAt })
      .in('mssv', batch)

    if (updateError) {
      throw new CsvImportError('CSV_IMPORT_FAILED', updateError.message, 500)
    }
  }

  return toDeactivate.length
}

async function findProfileByMssv(mssv: string): Promise<ProfileRow | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_COLUMNS)
    .eq('mssv', mssv)
    .maybeSingle<ProfileRow>()

  if (error) {
    throw new CsvImportError('CSV_IMPORT_FAILED', error.message, 500)
  }

  return data
}

async function updateExistingAccount(profile: ProfileRow, row: ValidStudentRow): Promise<string | null> {
  const email = `${row.mssv}@${EMAIL_DOMAIN}`
  const { error: authError } = await supabase.auth.admin.updateUserById(profile.id, {
    email,
    email_confirm: true,
    user_metadata: {
      mssv: row.mssv,
      full_name: row.full_name,
    },
  })

  if (authError) return authError.message

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ display_name: row.full_name })
    .eq('id', profile.id)

  return profileError?.message ?? null
}

async function loadAuthUsersByEmail(): Promise<Map<string, string>> {
  const usersByEmail = new Map<string, string>()
  let page = 1
  let hasMore = true

  while (hasMore) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1_000 })
    if (error) {
      throw new CsvImportError('CSV_IMPORT_FAILED', error.message, 500)
    }

    const users = data.users as AuthUserLite[]
    users.forEach((user) => {
      if (user.email) usersByEmail.set(user.email.toLowerCase(), user.id)
    })

    hasMore = typeof data.lastPage === 'number' && page < data.lastPage
    page += 1
  }

  return usersByEmail
}

async function createProfileForExistingAuthUser(authUserId: string, row: ValidStudentRow): Promise<string | null> {
  const { error } = await supabase.from('profiles').insert({
    id: authUserId,
    mssv: row.mssv,
    display_name: row.full_name,
    role: 'student',
    must_change_password: true,
  })

  return error ? `Profile creation failed: ${error.message}` : null
}

async function createStudentAccount(
  row: ValidStudentRow,
  getAuthUsersByEmail: () => Promise<Map<string, string>>,
): Promise<string | null> {
  const email = `${row.mssv}@${EMAIL_DOMAIN}`
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password: DEFAULT_PASSWORD,
    email_confirm: true,
    user_metadata: {
      mssv: row.mssv,
      full_name: row.full_name,
    },
  })

  if (authError || !authData.user) {
    const existingAuthUsers = await getAuthUsersByEmail()
    const existingUserId = existingAuthUsers.get(email.toLowerCase())
    if (existingUserId) {
      return createProfileForExistingAuthUser(existingUserId, row)
    }

    return authError?.message ?? 'Auth user creation failed'
  }

  const { error: profileError } = await supabase.from('profiles').insert({
    id: authData.user.id,
    mssv: row.mssv,
    display_name: row.full_name,
    role: 'student',
    must_change_password: true,
  })

  if (profileError) {
    await supabase.auth.admin.deleteUser(authData.user.id)
    return `Profile creation failed: ${profileError.message}`
  }

  return null
}

async function syncAccounts(rows: ValidStudentRow[], result: ImportResult): Promise<void> {
  let authUsersByEmail: Map<string, string> | null = null
  const getAuthUsersByEmail = async () => {
    authUsersByEmail ??= await loadAuthUsersByEmail()
    return authUsersByEmail
  }

  for (const row of rows) {
    try {
      const profile = await findProfileByMssv(row.mssv)
      const error = profile
        ? await updateExistingAccount(profile, row)
        : await createStudentAccount(row, getAuthUsersByEmail)

      if (error) {
        result.errors.push({ mssv: row.mssv, reason: error })
        continue
      }

      if (profile) result.updated += 1
      else result.created += 1
    } catch (error) {
      result.errors.push({
        mssv: row.mssv,
        reason: error instanceof Error ? error.message : 'Account sync failed',
      })
    }
  }
}

async function importParsedCsv(parsed: ParsedCsv, sourceFile: string | null): Promise<ImportResult> {
  const normalized = normalizeRows(parsed)
  const importedAt = new Date().toISOString()
  const result: ImportResult = {
    source_file: sourceFile,
    total: parsed.rows.length,
    valid: normalized.rows.length,
    created: 0,
    updated: 0,
    deactivated: 0,
    skipped: normalized.errors.length,
    errors: [...normalized.errors],
  }

  if (normalized.rows.length === 0) {
    return result
  }

  await fetchExistingStudents()
  await upsertStudents(normalized.rows, importedAt)
  await syncAccounts(normalized.rows, result)
  result.deactivated = await deactivateMissingStudents(
    new Set(normalized.rows.map((row) => row.mssv)),
    importedAt,
  )

  return result
}

function candidateImportDirs(): string[] {
  const dirs = [
    process.env.CSV_IMPORT_DIR ? path.resolve(process.cwd(), process.env.CSV_IMPORT_DIR) : null,
    path.resolve(process.cwd(), 'legacy-data'),
    path.resolve(process.cwd(), '../legacy-data'),
  ].filter((dir): dir is string => dir !== null)

  return [...new Set(dirs)]
}

export async function findLatestNightlyCsvFile(): Promise<string> {
  for (const dir of candidateImportDirs()) {
    try {
      const files = await readdir(dir)
      const latest = files
        .filter((file) => NIGHTLY_FILE_RE.test(file))
        .sort((left, right) => right.localeCompare(left))
        [0]

      if (latest) return path.join(dir, latest)
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        continue
      }
      throw error
    }
  }

  throw new CsvImportError(
    'CSV_FILE_NOT_FOUND',
    'No students_nightly_YYYY-MM-DD.csv file found in CSV_IMPORT_DIR or legacy-data',
    404,
  )
}

export async function importStudentsFromCsv(csvText: string, sourceFile: string | null = null): Promise<ImportResult> {
  return importParsedCsv(parseCsvText(csvText), sourceFile)
}

export async function importStudentsFromFile(filePath: string): Promise<ImportResult> {
  return importParsedCsv(await parseCsvFile(filePath), filePath)
}

export async function importLatestNightlyStudents(): Promise<ImportResult> {
  const filePath = await findLatestNightlyCsvFile()
  return importStudentsFromFile(filePath)
}
