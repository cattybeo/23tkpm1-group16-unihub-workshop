import { createReadStream, constants as fsConstants } from 'node:fs'
import { readdir, access } from 'node:fs/promises'
import path from 'node:path'
import { createInterface } from 'node:readline'
import Papa from 'papaparse'
import { z } from 'zod'
import { supabase } from '../lib/supabase.js'
import type { ErrorCode } from '../shared/http.js'

const DEFAULT_PASSWORD = process.env.STUDENT_DEFAULT_PASSWORD ?? '123'
const EMAIL_DOMAIN = process.env.STUDENT_EMAIL_DOMAIN ?? 'student.hcmus.edu.vn'
const BATCH_SIZE = 1_000
const NIGHTLY_FILE_RE = /^students_nightly_(\d{4}-\d{2}-\d{2})\.csv$/
const PROFILE_COLUMNS = 'id, role, mssv, display_name, phone, must_change_password'
const IMPORT_LOG_COLUMNS = [
  'id',
  'source_file',
  'imported_at',
  'imported_count',
  'status',
  'message',
].join(', ')
const LEGACY_IMPORT_LOG_COLUMNS = [
  'id',
  'source_file',
  'source_date',
  'started_at',
  'finished_at',
  'status',
  'valid_count',
  'message',
].join(', ')

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
  source_date: string | null
  status: 'completed' | 'skipped'
  started_at: string
  finished_at: string
  total: number
  valid: number
  created: number
  updated: number
  deactivated: number
  skipped: number
  errors: CsvRowError[]
  message?: string
}

type ImportLogStatus = 'completed' | 'failed'

interface CsvImportLogRow {
  id: string
  source_file: string | null
  source_date?: string | null
  started_at?: string
  finished_at?: string | null
  imported_at?: string
  imported_count?: number
  valid_count?: number
  status: ImportLogStatus
  message: string | null
}

export interface CsvImportLog {
  id: string
  source_file: string | null
  source_date: string | null
  started_at: string
  finished_at: string | null
  status: ImportLogStatus
  imported_students: number
  message: string | null
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

function extractSourceDate(sourceFile: string | null): string | null {
  if (!sourceFile) return null
  const match = path.basename(sourceFile).match(NIGHTLY_FILE_RE)
  return match?.[1] ?? null
}

function toPublicImportLog(row: CsvImportLogRow): CsvImportLog {
  const importedAt = row.imported_at ?? row.finished_at ?? row.started_at ?? new Date().toISOString()
  return {
    id: row.id,
    source_file: row.source_file,
    source_date: row.source_date ?? extractSourceDate(row.source_file),
    started_at: importedAt,
    finished_at: importedAt,
    status: row.status,
    imported_students: row.imported_count ?? row.valid_count ?? 0,
    message: row.message,
  }
}

function isImportLogSchemaError(error: { message: string } | null): boolean {
  return Boolean(error?.message.match(/column|schema cache|does not exist|csv_import_logs|imported_at|imported_count/i))
}

async function findCompletedImportLog(sourceFile: string | null): Promise<CsvImportLogRow | null> {
  if (!sourceFile) return null

  const { data, error } = await supabase
    .from('csv_import_logs')
    .select(IMPORT_LOG_COLUMNS)
    .eq('source_file', sourceFile)
    .eq('status', 'completed')
    .maybeSingle<CsvImportLogRow>()

  if (isImportLogSchemaError(error)) {
    const legacy = await supabase
      .from('csv_import_logs')
      .select(LEGACY_IMPORT_LOG_COLUMNS)
      .eq('source_file', sourceFile)
      .eq('status', 'completed')
      .maybeSingle<CsvImportLogRow>()

    if (isImportLogSchemaError(legacy.error)) return null
    if (legacy.error) throw new CsvImportError('CSV_IMPORT_FAILED', legacy.error.message, 500)
    return legacy.data
  }

  if (error) {
    throw new CsvImportError('CSV_IMPORT_FAILED', error.message, 500)
  }

  return data
}

async function insertImportLog(result: ImportResult, status: ImportLogStatus, message?: string): Promise<void> {
  const existing = status === 'completed' ? await findCompletedImportLog(result.source_file) : null
  if (existing) {
    const { error } = await supabase
      .from('csv_import_logs')
      .update({
        imported_at: result.finished_at,
        imported_count: result.valid,
        status,
        message: message ?? result.message ?? null,
      })
      .eq('id', existing.id)

    if (isImportLogSchemaError(error)) {
      const legacy = await supabase
        .from('csv_import_logs')
        .update({
          source_date: result.source_date,
          started_at: result.started_at,
          finished_at: result.finished_at,
          status,
          total_count: result.total,
          valid_count: result.valid,
          created_count: result.created,
          updated_count: result.updated,
          deactivated_count: result.deactivated,
          skipped_count: result.skipped,
          error_count: result.errors.length,
          errors: result.errors,
          message: message ?? result.message ?? null,
        })
        .eq('id', existing.id)

      if (legacy.error) console.error('[csv-import] failed to update import log:', legacy.error.message)
      return
    }

    if (error) console.error('[csv-import] failed to update import log:', error.message)
    return
  }

  const { error } = await supabase.from('csv_import_logs').insert({
    source_file: result.source_file,
    imported_at: result.finished_at,
    imported_count: result.valid,
    status,
    message: message ?? result.message ?? null,
  })

  if (isImportLogSchemaError(error)) {
    const legacy = await supabase.from('csv_import_logs').insert({
      source_file: result.source_file,
      source_date: result.source_date,
      started_at: result.started_at,
      finished_at: result.finished_at,
      status,
      total_count: result.total,
      valid_count: result.valid,
      created_count: result.created,
      updated_count: result.updated,
      deactivated_count: result.deactivated,
      skipped_count: result.skipped,
      error_count: result.errors.length,
      errors: result.errors,
      message: message ?? result.message ?? null,
    })
    if (legacy.error) {
      console.error('[csv-import] failed to insert import log:', legacy.error.message)
    }
    return
  }

  if (error) {
    console.error('[csv-import] failed to insert import log:', error.message)
  }
}

async function insertFailedImportLog(sourceFile: string | null, errorMessage: string): Promise<void> {
  const { error } = await supabase
    .from('csv_import_logs')
    .insert({
      source_file: sourceFile,
      imported_at: new Date().toISOString(),
      imported_count: 0,
      status: 'failed',
      message: errorMessage,
    })

  if (isImportLogSchemaError(error)) {
    const now = new Date().toISOString()
    const legacy = await supabase.from('csv_import_logs').insert({
      source_file: sourceFile,
      source_date: extractSourceDate(sourceFile),
      started_at: now,
      finished_at: now,
      status: 'failed',
      total_count: 0,
      valid_count: 0,
      created_count: 0,
      updated_count: 0,
      deactivated_count: 0,
      skipped_count: 0,
      error_count: 0,
      errors: [],
      message: errorMessage,
    })
    if (legacy.error) console.error('[csv-import] failed to insert failed import log:', legacy.error.message)
    return
  }

  if (error) console.error('[csv-import] failed to insert failed import log:', error.message)
}

export async function listCsvImportLogs(limit = 10): Promise<CsvImportLog[]> {
  const { data, error } = await supabase
    .from('csv_import_logs')
    .select(IMPORT_LOG_COLUMNS)
    .order('imported_at', { ascending: false })
    .limit(limit)
    .returns<CsvImportLogRow[]>()

  if (isImportLogSchemaError(error)) {
    const legacy = await supabase
      .from('csv_import_logs')
      .select(LEGACY_IMPORT_LOG_COLUMNS)
      .order('started_at', { ascending: false })
      .limit(limit)
      .returns<CsvImportLogRow[]>()

    if (isImportLogSchemaError(legacy.error)) return []
    if (legacy.error) throw new CsvImportError('CSV_IMPORT_FAILED', legacy.error.message, 500)
    return (legacy.data ?? []).map(toPublicImportLog)
  }

  if (error) {
    throw new CsvImportError('CSV_IMPORT_FAILED', error.message, 500)
  }

  return (data ?? []).map(toPublicImportLog)
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

async function loadProfilesByMssv(mssvList: string[]): Promise<Map<string, ProfileRow>> {
  const profileMap = new Map<string, ProfileRow>()

  for (const batch of chunkRows(mssvList, BATCH_SIZE)) {
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_COLUMNS)
      .in('mssv', batch)
      .returns<ProfileRow[]>()

    if (error) {
      throw new CsvImportError('CSV_IMPORT_FAILED', error.message, 500)
    }

    for (const profile of data ?? []) {
      if (profile.mssv) profileMap.set(profile.mssv, profile)
    }
  }

  return profileMap
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
  const existingProfiles = await loadProfilesByMssv(rows.map((r) => r.mssv))

  const toCreate: ValidStudentRow[] = []
  const toUpdate: Array<{ profile: ProfileRow; row: ValidStudentRow }> = []

  for (const row of rows) {
    const profile = existingProfiles.get(row.mssv)
    if (profile) toUpdate.push({ profile, row })
    else toCreate.push(row)
  }

  for (const { profile, row } of toUpdate) {
    try {
      const nameChanged = profile.display_name !== row.full_name
      const error = nameChanged ? await updateExistingAccount(profile, row) : null
      if (error) {
        result.errors.push({ mssv: row.mssv, reason: error })
        continue
      }
      result.updated += 1
    } catch (err) {
      result.errors.push({
        mssv: row.mssv,
        reason: err instanceof Error ? err.message : 'Account sync failed',
      })
    }
  }

  let authUsersByEmail: Map<string, string> | null = null
  const getAuthUsersByEmail = async () => {
    authUsersByEmail ??= await loadAuthUsersByEmail()
    return authUsersByEmail
  }

  for (const row of toCreate) {
    try {
      const error = await createStudentAccount(row, getAuthUsersByEmail)
      if (error) {
        result.errors.push({ mssv: row.mssv, reason: error })
        continue
      }
      result.created += 1
    } catch (err) {
      result.errors.push({
        mssv: row.mssv,
        reason: err instanceof Error ? err.message : 'Account sync failed',
      })
    }
  }
}

async function importParsedCsv(parsed: ParsedCsv, sourceFile: string | null): Promise<ImportResult> {
  const normalized = normalizeRows(parsed)
  const sourceDate = extractSourceDate(sourceFile)
  const importedAt = new Date().toISOString()
  const result: ImportResult = {
    source_file: sourceFile,
    source_date: sourceDate,
    status: 'completed',
    started_at: importedAt,
    finished_at: importedAt,
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

  await upsertStudents(normalized.rows, importedAt)
  await syncAccounts(normalized.rows, result)
  result.deactivated = await deactivateMissingStudents(
    new Set(normalized.rows.map((row) => row.mssv)),
    importedAt,
  )
  result.finished_at = new Date().toISOString()

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
  try {
    const result = await importParsedCsv(await parseCsvFile(filePath), filePath)
    await insertImportLog(result, 'completed')
    return result
  } catch (err) {
    await insertFailedImportLog(filePath, err instanceof Error ? err.message : 'Import failed')
    throw err
  }
}

export async function importLatestNightlyStudents(): Promise<ImportResult> {
  const filePath = await findLatestNightlyCsvFile()
  return importStudentsFromFile(filePath)
}

export async function findNightlyCsvForDate(dateStr: string): Promise<string> {
  const fileName = `students_nightly_${dateStr}.csv`
  for (const dir of candidateImportDirs()) {
    const fullPath = path.join(dir, fileName)
    try {
      await access(fullPath, fsConstants.R_OK)
      return fullPath
    } catch {
      continue
    }
  }
  throw new CsvImportError(
    'CSV_FILE_NOT_FOUND',
    `Không tìm thấy file ${fileName} trong legacy-data hoặc CSV_IMPORT_DIR`,
    404,
  )
}

export async function importNightlyStudentsForDate(dateStr: string): Promise<ImportResult> {
  return importStudentsFromFile(await findNightlyCsvForDate(dateStr))
}
