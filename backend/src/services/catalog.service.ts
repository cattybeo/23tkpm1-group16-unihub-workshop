import { z } from 'zod'
import { supabase } from '../lib/supabase.js'
import { eventBus, WORKSHOP_CHANGED_EVENT, type WorkshopChangedEvent } from '../infra/event-bus.js'

// ---------------------------------------------------------------------------
// Zod schemas (dùng cho cả FE shared nếu cần)
// ---------------------------------------------------------------------------

export const CreateWorkshopSchema = z.object({
  title:           z.string().min(1).max(200),
  description:     z.string().optional(),
  speaker_name:    z.string().min(1).max(100),
  speaker_bio:     z.string().optional(),
  room:            z.string().min(1).max(100),
  start_time:      z.string().datetime({ offset: true }),
  end_time:        z.string().datetime({ offset: true }),
  capacity:        z.number().int().min(1),
  fee_vnd:         z.number().int().min(0).default(0),
  cover_image_url: z.string().url().optional(),
  room_map_url:    z.string().url().optional(),
}).refine(
  d => new Date(d.end_time) > new Date(d.start_time),
  { message: 'end_time must be after start_time', path: ['end_time'] },
)

export const UpdateWorkshopSchema = z.object({
  title:           z.string().min(1).max(200).optional(),
  description:     z.string().optional(),
  speaker_name:    z.string().min(1).max(100).optional(),
  speaker_bio:     z.string().optional(),
  room:            z.string().min(1).max(100).optional(),
  start_time:      z.string().datetime({ offset: true }).optional(),
  end_time:        z.string().datetime({ offset: true }).optional(),
  capacity:        z.number().int().min(1).optional(),
  fee_vnd:         z.number().int().min(0).optional(),
  cover_image_url: z.string().url().optional(),
  room_map_url:    z.string().url().optional(),
}).refine(
  d => {
    if (d.start_time && d.end_time) return new Date(d.end_time) > new Date(d.start_time)
    return true
  },
  { message: 'end_time must be after start_time', path: ['end_time'] },
)

export type CreateWorkshopDto = z.infer<typeof CreateWorkshopSchema>
export type UpdateWorkshopDto = z.infer<typeof UpdateWorkshopSchema>

// ---------------------------------------------------------------------------
// In-memory cache cho public list (TTL 5s)
// ---------------------------------------------------------------------------

interface CacheEntry {
  data: WorkshopRow[]
  expiresAt: number
}

const CACHE_TTL_MS = 5_000
let publicListCache: CacheEntry | null = null

function invalidateCache() {
  publicListCache = null
}

// ---------------------------------------------------------------------------
// DB row type
// ---------------------------------------------------------------------------

export interface WorkshopRow {
  id:                   string
  title:                string
  description:          string | null
  speaker_name:         string
  speaker_bio:          string | null
  room:                 string
  cover_image_url:      string | null
  room_map_url:         string | null
  start_time:           string
  end_time:             string
  capacity:             number
  seats_remaining:      number
  fee_vnd:              number
  pdf_url:              string | null
  summary_md:           string | null
  summary_generated_at: string | null
  summary_status:       'idle' | 'processing' | 'completed' | 'failed' | null
  summary_attempts:     number | null
  summary_error_code:   string | null
  summary_error_message: string | null
  is_published:         boolean
  cancelled_at:         string | null
  created_at:           string
  updated_at:           string
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function listWorkshops(isOrganizer: boolean): Promise<WorkshopRow[]> {
  if (!isOrganizer && publicListCache && publicListCache.expiresAt > Date.now()) {
    return publicListCache.data
  }

  let query = supabase.from('workshops').select('*').order('start_time', { ascending: true })

  if (!isOrganizer) {
    query = query.eq('is_published', true).is('cancelled_at', null)
  }

  const { data, error } = await query.returns<WorkshopRow[]>()

  if (error) throw new Error(error.message)

  if (!isOrganizer) {
    publicListCache = { data: data ?? [], expiresAt: Date.now() + CACHE_TTL_MS }
  }

  return data ?? []
}

export async function getWorkshop(id: string, isOrganizer: boolean): Promise<WorkshopRow> {
  const { data, error } = await supabase
    .from('workshops')
    .select('*')
    .eq('id', id)
    .single<WorkshopRow>()

  if (error || !data) {
    throw Object.assign(new Error('Workshop not found'), { code: 'RESOURCE_NOT_FOUND' })
  }

  if (!isOrganizer && (!data.is_published || data.cancelled_at !== null)) {
    // 404 để không leak sự tồn tại
    throw Object.assign(new Error('Workshop not found'), { code: 'RESOURCE_NOT_FOUND' })
  }

  return data
}

export async function createWorkshop(dto: CreateWorkshopDto): Promise<WorkshopRow> {
  const { data, error } = await supabase
    .from('workshops')
    .insert({
      ...dto,
      is_published:    false,
      seats_remaining: dto.capacity,
    })
    .select()
    .single<WorkshopRow>()

  if (error || !data) throw new Error(error?.message ?? 'Insert failed')

  invalidateCache()
  return data
}

export async function updateWorkshop(id: string, dto: UpdateWorkshopDto): Promise<WorkshopRow> {
  const { data: before, error: beforeError } = await supabase
    .from('workshops')
    .select('*')
    .eq('id', id)
    .is('cancelled_at', null)
    .single<WorkshopRow>()

  if (beforeError || !before) {
    throw Object.assign(new Error('Workshop not found or cancelled'), { code: 'RESOURCE_NOT_FOUND' })
  }

  const updatePayload: Record<string, unknown> = { ...dto }

  if (dto.capacity !== undefined && dto.capacity !== before.capacity) {
    const registeredCount = before.capacity - before.seats_remaining
    if (dto.capacity < registeredCount) {
      throw Object.assign(
        new Error(`Capacity ${dto.capacity} is below ${registeredCount} active registrations`),
        { code: 'SEATS_BELOW_REGISTERED' },
      )
    }
    updatePayload.seats_remaining = dto.capacity - registeredCount
  }

  const { data, error } = await supabase
    .from('workshops')
    .update(updatePayload)
    .eq('id', id)
    .is('cancelled_at', null)
    .select()
    .single<WorkshopRow>()

  if (error || !data) {
    throw Object.assign(new Error('Workshop not found or cancelled'), { code: 'RESOURCE_NOT_FOUND' })
  }

  invalidateCache()

  const roomChanged = data.room !== before.room
  const startChanged = data.start_time !== before.start_time
  const endChanged = data.end_time !== before.end_time

  if (roomChanged || startChanged || endChanged) {
    const parts: string[] = []
    if (roomChanged) parts.push(`phòng mới: ${data.room}`)
    if (startChanged || endChanged) {
      const start = new Date(data.start_time).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
      const end = new Date(data.end_time).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
      parts.push(`thời gian mới: ${start} – ${end}`)
    }
    eventBus.emit(WORKSHOP_CHANGED_EVENT, {
      workshopId: data.id,
      notificationTitle: `Cập nhật workshop "${data.title}"`,
      notificationBody: `Workshop "${data.title}" có thay đổi — ${parts.join('; ')}.`,
    } satisfies WorkshopChangedEvent)
  }

  return data
}

export async function publishWorkshop(id: string): Promise<WorkshopRow> {
  const { data, error } = await supabase
    .from('workshops')
    .update({ is_published: true })
    .eq('id', id)
    .is('cancelled_at', null)
    .select()
    .single<WorkshopRow>()

  if (error || !data) {
    throw Object.assign(new Error('Workshop not found or cancelled'), { code: 'RESOURCE_NOT_FOUND' })
  }

  invalidateCache()
  return data
}

export async function cancelWorkshop(id: string, reason?: string): Promise<WorkshopRow> {
  const updatePayload: Record<string, unknown> = { cancelled_at: new Date().toISOString() }
  if (reason) updatePayload['cancelled_reason'] = reason

  const { data, error } = await supabase
    .from('workshops')
    .update(updatePayload)
    .eq('id', id)
    .is('cancelled_at', null)
    .select()
    .single<WorkshopRow>()

  if (error || !data) {
    throw Object.assign(new Error('Workshop not found or already cancelled'), { code: 'RESOURCE_NOT_FOUND' })
  }

  invalidateCache()

  eventBus.emit(WORKSHOP_CHANGED_EVENT, {
    workshopId: data.id,
    notificationTitle: `Workshop "${data.title}" đã bị huỷ`,
    notificationBody: reason
      ? `Workshop "${data.title}" đã bị huỷ. Lý do: ${reason}.`
      : `Workshop "${data.title}" đã bị huỷ. Vui lòng kiểm tra app để biết chi tiết.`,
  } satisfies WorkshopChangedEvent)

  return data
}
