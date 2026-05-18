import { supabase } from '../lib/supabase.js'

type RegistrationStatus = 'pending_payment' | 'confirmed' | 'cancelled' | 'expired'
type WorkshopVisibility = 'published' | 'hidden' | 'cancelled'

interface WorkshopStatsRow {
  id: string
  title: string
  room: string
  start_time: string
  end_time: string
  capacity: number
  seats_remaining: number
  is_published: boolean
  cancelled_at: string | null
}

interface RegistrationStatsRow {
  id: string
  workshop_id: string
  status: RegistrationStatus
  created_at: string
}

interface CheckInStatsRow {
  id: string
  registration_id: string
  checked_in_at: string
}

interface CsvImportStatsRow {
  source_file: string | null
  imported_at: string
  imported_count: number
  status: 'completed' | 'failed'
  message: string | null
}

export interface AdminStatsWorkshop {
  id: string
  title: string
  room: string
  start_time: string
  end_time: string
  visibility: WorkshopVisibility
  capacity: number
  seats_remaining: number
  confirmed: number
  pending_payment: number
  cancelled: number
  expired: number
  checkins: number
  fill_rate: number | null
  attendance_rate: number | null
}

export interface AdminStatsTimelineBucket {
  hour: string
  count: number
}

export interface AdminStatsResponse {
  summary: {
    total_workshops: number
    published_workshops: number
    hidden_workshops: number
    cancelled_workshops: number
    total_capacity: number
    seats_remaining: number
    total_confirmed_registrations: number
    total_pending_payments: number
    total_checkins: number
    fill_rate: number | null
    attendance_rate: number | null
  }
  workshopStats: AdminStatsWorkshop[]
  registrationTimeline: AdminStatsTimelineBucket[]
  topWorkshops: AdminStatsWorkshop[]
  csvImport: CsvImportStatsRow | null
  generatedAt: string
}

interface StatsCacheEntry {
  data: AdminStatsResponse
  expiresAt: number
}

const CACHE_TTL_MS = 60_000
const QUERY_TIMEOUT_MS = 5_000
let cache: StatsCacheEntry | null = null

function ratio(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.round((numerator / denominator) * 1000) / 10
}

function getVisibility(workshop: WorkshopStatsRow): WorkshopVisibility {
  if (workshop.cancelled_at) return 'cancelled'
  return workshop.is_published ? 'published' : 'hidden'
}

function createStatusCounts(): Record<RegistrationStatus, number> {
  return {
    pending_payment: 0,
    confirmed: 0,
    cancelled: 0,
    expired: 0,
  }
}

function toHourBucket(value: string): string {
  const date = new Date(value)
  date.setMinutes(0, 0, 0)
  return date.toISOString()
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(Object.assign(new Error('Stats query timed out'), { code: 'STATS_UNAVAILABLE' }))
    }, ms)

    promise
      .then((value) => {
        clearTimeout(timer)
        resolve(value)
      })
      .catch((error) => {
        clearTimeout(timer)
        reject(error)
      })
  })
}

async function buildAdminStats(): Promise<AdminStatsResponse> {
  const [workshopsResult, registrationsResult, checkInsResult, csvImportResult] = await Promise.all([
    supabase
      .from('workshops')
      .select('id, title, room, start_time, end_time, capacity, seats_remaining, is_published, cancelled_at')
      .order('start_time', { ascending: true })
      .returns<WorkshopStatsRow[]>(),
    supabase
      .from('registrations')
      .select('id, workshop_id, status, created_at')
      .returns<RegistrationStatsRow[]>(),
    supabase
      .from('check_ins')
      .select('id, registration_id, checked_in_at')
      .returns<CheckInStatsRow[]>(),
    supabase
      .from('csv_import_logs')
      .select('source_file, imported_at, imported_count, status, message')
      .order('imported_at', { ascending: false })
      .limit(1)
      .returns<CsvImportStatsRow[]>(),
  ])

  if (workshopsResult.error) throw new Error(workshopsResult.error.message)
  if (registrationsResult.error) throw new Error(registrationsResult.error.message)
  if (checkInsResult.error) throw new Error(checkInsResult.error.message)
  if (csvImportResult.error) throw new Error(csvImportResult.error.message)

  const workshops = workshopsResult.data ?? []
  const registrations = registrationsResult.data ?? []
  const checkIns = checkInsResult.data ?? []

  const registrationWorkshop = new Map<string, string>()
  const registrationsByWorkshop = new Map<string, Record<RegistrationStatus, number>>()
  const timeline = new Map<string, number>()

  for (const registration of registrations) {
    registrationWorkshop.set(registration.id, registration.workshop_id)
    const counts = registrationsByWorkshop.get(registration.workshop_id) ?? createStatusCounts()
    counts[registration.status] += 1
    registrationsByWorkshop.set(registration.workshop_id, counts)

    if (registration.status === 'confirmed' || registration.status === 'pending_payment') {
      const bucket = toHourBucket(registration.created_at)
      timeline.set(bucket, (timeline.get(bucket) ?? 0) + 1)
    }
  }

  const checkInsByWorkshop = new Map<string, number>()
  for (const checkIn of checkIns) {
    const workshopId = registrationWorkshop.get(checkIn.registration_id)
    if (!workshopId) continue
    checkInsByWorkshop.set(workshopId, (checkInsByWorkshop.get(workshopId) ?? 0) + 1)
  }

  const workshopStats = workshops.map<AdminStatsWorkshop>((workshop) => {
    const counts = registrationsByWorkshop.get(workshop.id) ?? createStatusCounts()
    const checkins = checkInsByWorkshop.get(workshop.id) ?? 0
    return {
      id: workshop.id,
      title: workshop.title,
      room: workshop.room,
      start_time: workshop.start_time,
      end_time: workshop.end_time,
      visibility: getVisibility(workshop),
      capacity: workshop.capacity,
      seats_remaining: workshop.seats_remaining,
      confirmed: counts.confirmed,
      pending_payment: counts.pending_payment,
      cancelled: counts.cancelled,
      expired: counts.expired,
      checkins,
      fill_rate: ratio(counts.confirmed, workshop.capacity),
      attendance_rate: ratio(checkins, counts.confirmed),
    }
  })

  const activeWorkshops = workshopStats.filter((workshop) => workshop.visibility !== 'cancelled')
  const totalCapacity = activeWorkshops.reduce((sum, workshop) => sum + workshop.capacity, 0)
  const totalSeatsRemaining = activeWorkshops.reduce((sum, workshop) => sum + workshop.seats_remaining, 0)
  const totalConfirmed = workshopStats.reduce((sum, workshop) => sum + workshop.confirmed, 0)
  const totalPending = workshopStats.reduce((sum, workshop) => sum + workshop.pending_payment, 0)
  const totalCheckins = workshopStats.reduce((sum, workshop) => sum + workshop.checkins, 0)

  return {
    summary: {
      total_workshops: activeWorkshops.length,
      published_workshops: workshopStats.filter((workshop) => workshop.visibility === 'published').length,
      hidden_workshops: workshopStats.filter((workshop) => workshop.visibility === 'hidden').length,
      cancelled_workshops: workshopStats.filter((workshop) => workshop.visibility === 'cancelled').length,
      total_capacity: totalCapacity,
      seats_remaining: totalSeatsRemaining,
      total_confirmed_registrations: totalConfirmed,
      total_pending_payments: totalPending,
      total_checkins: totalCheckins,
      fill_rate: ratio(totalConfirmed, totalCapacity),
      attendance_rate: ratio(totalCheckins, totalConfirmed),
    },
    workshopStats,
    registrationTimeline: Array.from(timeline.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([hour, count]) => ({ hour, count })),
    topWorkshops: [...workshopStats]
      .sort((a, b) => b.confirmed - a.confirmed)
      .slice(0, 5),
    csvImport: csvImportResult.data?.[0] ?? null,
    generatedAt: new Date().toISOString(),
  }
}

export async function getAdminStats(): Promise<AdminStatsResponse> {
  if (cache && cache.expiresAt > Date.now()) return cache.data

  const data = await withTimeout(buildAdminStats(), QUERY_TIMEOUT_MS)
  cache = { data, expiresAt: Date.now() + CACHE_TTL_MS }
  return data
}
