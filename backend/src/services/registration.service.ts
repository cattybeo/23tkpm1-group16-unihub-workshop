import QRCode from 'qrcode'
import { supabase } from '../lib/supabase.js'
import {
  eventBus,
  REGISTRATION_CONFIRMED_EVENT,
  type RegistrationConfirmedEvent,
} from '../infra/event-bus.js'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RegistrationResult {
  registration_id: string
  workshop_id:     string
  status:          'confirmed' | 'pending_payment'
  qr_token:        string
  qr_image:        string
  fee_vnd:         number
}

export interface RegistrationRow {
  id:           string
  mssv:         string
  workshop_id:  string
  status:       string
  qr_token:     string | null
  expires_at:   string | null
  confirmed_at: string | null
  created_at:   string
  updated_at:   string
  workshops?: {
    id:          string
    title:       string
    room:        string
    start_time:  string
    end_time:    string
    fee_vnd:     number
    speaker_name: string
  }
}

export interface AdminRegistrationRow extends RegistrationRow {
  students?: { full_name: string }
}

export interface GetAllRegistrationsOptions {
  workshopId?: string
  status?:     string
}

interface CreateRegistrationWithOutboxRow {
  registration_id: string
  workshop_id: string
  status: 'confirmed' | 'pending_payment'
  qr_token: string
  fee_vnd: number
  notification_id: string | null
}

// ---------------------------------------------------------------------------
// registerForWorkshop
// RPC keeps seat decrement, registration insert, and notification outbox insert
// in one Postgres transaction. The RPC uses atomic UPDATE ... WHERE seats_remaining > 0.
// ---------------------------------------------------------------------------

export async function registerForWorkshop(
  mssv: string,
  workshopId: string,
  userId: string,
): Promise<RegistrationResult> {
  const { data: registration, error } = await supabase
    .rpc('create_registration_with_outbox', {
      p_mssv: mssv,
      p_workshop_id: workshopId,
      p_user_id: userId,
    })
    .single<CreateRegistrationWithOutboxRow>()

  if (error || !registration) {
    throwRegistrationError(error)
  }

  if (registration.notification_id) {
    const event: RegistrationConfirmedEvent = { notificationId: registration.notification_id }
    eventBus.emit(REGISTRATION_CONFIRMED_EVENT, event)
  }

  const qrImage = await QRCode.toDataURL(registration.qr_token)

  return {
    registration_id: registration.registration_id,
    workshop_id:     registration.workshop_id,
    status:          registration.status,
    qr_token:        registration.qr_token,
    qr_image:        qrImage,
    fee_vnd:         registration.fee_vnd,
  }
}

function throwRegistrationError(error: { code?: string; message?: string } | null): never {
  const code = error?.code ?? ''
  const message = error?.message ?? 'Registration failed'

  if (message.includes('RESOURCE_NOT_FOUND')) {
    throw Object.assign(new Error('Workshop not found'), { code: 'RESOURCE_NOT_FOUND' })
  }

  if (message.includes('SEATS_SOLD_OUT')) {
    throw Object.assign(new Error('Workshop is sold out'), { code: 'SEATS_SOLD_OUT' })
  }

  if (
    code === '23505' ||
    code === '23P01' ||
    message.includes('registrations_unique_active')
  ) {
    throw Object.assign(new Error('Already registered for this workshop'), { code: 'ALREADY_REGISTERED' })
  }

  throw new Error(message)
}

// ---------------------------------------------------------------------------
// getMyRegistrations — student's own registrations
// ---------------------------------------------------------------------------

export async function getMyRegistrations(mssv: string): Promise<RegistrationRow[]> {
  const { data, error } = await supabase
    .from('registrations')
    .select(`
      id, mssv, workshop_id, status, qr_token,
      expires_at, confirmed_at, created_at, updated_at,
      workshops ( id, title, room, start_time, end_time, fee_vnd, speaker_name )
    `)
    .eq('mssv', mssv)
    .order('created_at', { ascending: false })
    .returns<RegistrationRow[]>()

  if (error) throw new Error(error.message)
  return data ?? []
}

// ---------------------------------------------------------------------------
// getAllRegistrations — organizer view
// ---------------------------------------------------------------------------

export async function getAllRegistrations(
  opts: GetAllRegistrationsOptions = {},
): Promise<AdminRegistrationRow[]> {
  let query = supabase
    .from('registrations')
    .select(`
      id, mssv, workshop_id, status, qr_token,
      expires_at, confirmed_at, created_at, updated_at,
      workshops ( id, title, room, start_time, end_time, fee_vnd, speaker_name ),
      students ( full_name )
    `)
    .order('created_at', { ascending: false })

  if (opts.workshopId) query = query.eq('workshop_id', opts.workshopId)
  if (opts.status)     query = query.eq('status', opts.status)

  const { data, error } = await query.returns<AdminRegistrationRow[]>()
  if (error) throw new Error(error.message)
  return data ?? []
}

// ---------------------------------------------------------------------------
// releasePendingSeats — called by setInterval every 60s
// Atomic via RPC: bulk UPDATE registrations.status='expired' + per-workshop
// seats_remaining += count in a single CTE. No SELECT-then-UPDATE in app code.
// ---------------------------------------------------------------------------

interface ExpireResult {
  workshop_id:    string
  released_count: number
}

export async function releasePendingSeats(): Promise<void> {
  const { data, error } = await supabase.rpc('expire_pending_registrations')

  if (error) {
    console.error('[cron] expire_pending_registrations error:', error.message)
    return
  }

  const rows = (data as ExpireResult[] | null) ?? []
  if (rows.length === 0) return

  const total = rows.reduce((sum, row) => sum + row.released_count, 0)
  console.log(`[cron] released ${total} seats across ${rows.length} workshops`)
}
