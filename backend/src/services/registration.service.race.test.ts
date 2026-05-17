// Integration test for seat reservation race condition.
// Verifies blueprint/specs/seat-reservation.md acceptance criteria:
//   #1 1000 concurrent requests on a 10-seat workshop → exactly 10 reservations,
//      seats_remaining = 0, no overbook.
//   #2 Same student registering twice → second call rejected ALREADY_REGISTERED,
//      seats_remaining decremented exactly once.
//   #4 pending_payment with expires_at in the past → expire_pending_registrations
//      marks it expired and restores the seat.
//
// Skipped when SUPABASE_TEST_URL is not configured.  See backend/.env.example.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const TEST_URL = process.env.SUPABASE_TEST_URL
const TEST_KEY = process.env.SUPABASE_TEST_SERVICE_ROLE_KEY

const RUN_INTEGRATION = Boolean(TEST_URL && TEST_KEY)
const describeIntegration = RUN_INTEGRATION ? describe : describe.skip

const CAPACITY = 10
const CONCURRENT_REQUESTS = 1_000
const MSSV_PREFIX = 'RACE'

interface CreateRegistrationRow {
  registration_id: string
  workshop_id:     string
  status:          'confirmed' | 'pending_payment'
  qr_token:        string
  fee_vnd:         number
  notification_id: string | null
}

interface ExpireRow {
  workshop_id:    string
  released_count: number
}

function mssvFor(i: number): string {
  return `${MSSV_PREFIX}${String(i).padStart(6, '0')}`
}

describeIntegration('seat reservation — race condition (integration)', () => {
  let supabase: SupabaseClient
  let workshopId: string

  beforeAll(async () => {
    supabase = createClient(TEST_URL!, TEST_KEY!, { auth: { persistSession: false } })

    // Workshop with a fee to keep status='pending_payment' on success, which
    // skips the notifications insert (no profile/auth.users needed for race test).
    const { data: workshop, error: workshopError } = await supabase
      .from('workshops')
      .insert({
        title:           'RACE TEST workshop',
        speaker_name:    'Race Tester',
        room:            'TEST-ROOM',
        start_time:      new Date(Date.now() + 86_400_000).toISOString(),
        end_time:        new Date(Date.now() + 90_000_000).toISOString(),
        capacity:        CAPACITY,
        seats_remaining: CAPACITY,
        fee_vnd:         50_000,
        is_published:    true,
      })
      .select('id')
      .single<{ id: string }>()

    if (workshopError || !workshop) {
      throw new Error(`failed to seed workshop: ${workshopError?.message}`)
    }
    workshopId = workshop.id

    // Bulk-insert 1000 students. mssv must match check: ^[A-Za-z0-9]{6,20}$.
    const students = Array.from({ length: CONCURRENT_REQUESTS }, (_, i) => ({
      mssv:      mssvFor(i + 1),
      full_name: `Race Student ${i + 1}`,
    }))
    const { error: studentErr } = await supabase.from('students').insert(students)
    if (studentErr) {
      throw new Error(`failed to seed students: ${studentErr.message}`)
    }
  }, 60_000)

  afterAll(async () => {
    if (!workshopId) return
    await supabase.from('registrations').delete().eq('workshop_id', workshopId)
    await supabase
      .from('students')
      .delete()
      .gte('mssv', mssvFor(1))
      .lte('mssv', mssvFor(CONCURRENT_REQUESTS))
    await supabase.from('workshops').delete().eq('id', workshopId)
  }, 60_000)

  it('1000 concurrent reservations on a 10-seat workshop → exactly 10 succeed', async () => {
    const fakeUserId = '00000000-0000-0000-0000-000000000000'

    const calls = Array.from({ length: CONCURRENT_REQUESTS }, (_, i) =>
      supabase
        .rpc('create_registration_with_outbox', {
          p_mssv:        mssvFor(i + 1),
          p_workshop_id: workshopId,
          p_user_id:     fakeUserId,
        })
        .single<CreateRegistrationRow>(),
    )

    const results = await Promise.allSettled(calls)

    let success = 0
    let soldOut = 0
    let other = 0
    for (const r of results) {
      if (r.status === 'fulfilled' && r.value.data && !r.value.error) {
        success++
      } else if (r.status === 'fulfilled' && r.value.error) {
        if (r.value.error.message.includes('SEATS_SOLD_OUT')) soldOut++
        else other++
      } else {
        other++
      }
    }

    expect(success).toBe(CAPACITY)
    expect(soldOut).toBe(CONCURRENT_REQUESTS - CAPACITY)
    expect(other).toBe(0)

    const { data: ws } = await supabase
      .from('workshops')
      .select('seats_remaining')
      .eq('id', workshopId)
      .single<{ seats_remaining: number }>()
    expect(ws?.seats_remaining).toBe(0)

    const { count } = await supabase
      .from('registrations')
      .select('*', { count: 'exact', head: true })
      .eq('workshop_id', workshopId)
      .in('status', ['pending_payment', 'confirmed'])
    expect(count).toBe(CAPACITY)
  }, 120_000)
})

describeIntegration('seat reservation — duplicate registration (integration)', () => {
  let supabase: SupabaseClient
  let workshopId: string
  const mssv = `${MSSV_PREFIX}DUPL01`

  beforeAll(async () => {
    supabase = createClient(TEST_URL!, TEST_KEY!, { auth: { persistSession: false } })

    const { data: workshop } = await supabase
      .from('workshops')
      .insert({
        title:           'DUP TEST workshop',
        speaker_name:    'Dup Tester',
        room:            'TEST-ROOM',
        start_time:      new Date(Date.now() + 86_400_000).toISOString(),
        end_time:        new Date(Date.now() + 90_000_000).toISOString(),
        capacity:        5,
        seats_remaining: 5,
        fee_vnd:         50_000,
        is_published:    true,
      })
      .select('id')
      .single<{ id: string }>()
    workshopId = workshop!.id

    await supabase.from('students').insert({ mssv, full_name: 'Dup Student' })
  }, 30_000)

  afterAll(async () => {
    if (!workshopId) return
    await supabase.from('registrations').delete().eq('workshop_id', workshopId)
    await supabase.from('students').delete().eq('mssv', mssv)
    await supabase.from('workshops').delete().eq('id', workshopId)
  }, 30_000)

  it('same student registering twice — second call rejected, seats decremented once', async () => {
    const fakeUserId = '00000000-0000-0000-0000-000000000000'

    const first = await supabase
      .rpc('create_registration_with_outbox', {
        p_mssv: mssv, p_workshop_id: workshopId, p_user_id: fakeUserId,
      })
      .single<CreateRegistrationRow>()
    expect(first.error).toBeNull()
    expect(first.data).not.toBeNull()

    const second = await supabase
      .rpc('create_registration_with_outbox', {
        p_mssv: mssv, p_workshop_id: workshopId, p_user_id: fakeUserId,
      })
      .single<CreateRegistrationRow>()
    expect(second.error).not.toBeNull()
    // Exclusion constraint violation surfaces as code 23P01.
    expect(
      second.error?.code === '23P01' ||
      second.error?.message.includes('registrations_unique_active') ||
      second.error?.message.includes('ALREADY_REGISTERED'),
    ).toBe(true)

    const { data: ws } = await supabase
      .from('workshops')
      .select('seats_remaining, capacity')
      .eq('id', workshopId)
      .single<{ seats_remaining: number; capacity: number }>()
    expect(ws?.seats_remaining).toBe((ws?.capacity ?? 0) - 1)
  }, 30_000)
})

describeIntegration('seat reservation — expire pending registrations (integration)', () => {
  let supabase: SupabaseClient
  let workshopId: string
  const mssv = `${MSSV_PREFIX}EXP001`

  beforeAll(async () => {
    supabase = createClient(TEST_URL!, TEST_KEY!, { auth: { persistSession: false } })

    const { data: workshop } = await supabase
      .from('workshops')
      .insert({
        title:           'EXP TEST workshop',
        speaker_name:    'Exp Tester',
        room:            'TEST-ROOM',
        start_time:      new Date(Date.now() + 86_400_000).toISOString(),
        end_time:        new Date(Date.now() + 90_000_000).toISOString(),
        capacity:        3,
        // Simulate state right after registration (1 seat held).
        seats_remaining: 2,
        fee_vnd:         50_000,
        is_published:    true,
      })
      .select('id')
      .single<{ id: string }>()
    workshopId = workshop!.id

    await supabase.from('students').insert({ mssv, full_name: 'Exp Student' })

    // Manually insert a pending_payment registration that already expired.
    await supabase.from('registrations').insert({
      mssv,
      workshop_id: workshopId,
      status:      'pending_payment',
      qr_token:    'EXPIRED_TOKEN',
      expires_at:  new Date(Date.now() - 20 * 60_000).toISOString(),
    })
  }, 30_000)

  afterAll(async () => {
    if (!workshopId) return
    await supabase.from('registrations').delete().eq('workshop_id', workshopId)
    await supabase.from('students').delete().eq('mssv', mssv)
    await supabase.from('workshops').delete().eq('id', workshopId)
  }, 30_000)

  it('expire_pending_registrations: expired row flipped, seat restored atomically', async () => {
    const { data, error } = await supabase.rpc('expire_pending_registrations')

    expect(error).toBeNull()
    const rows = (data as ExpireRow[] | null) ?? []
    const releasedForWorkshop = rows.find(r => r.workshop_id === workshopId)
    expect(releasedForWorkshop?.released_count).toBe(1)

    const { data: ws } = await supabase
      .from('workshops')
      .select('seats_remaining, capacity')
      .eq('id', workshopId)
      .single<{ seats_remaining: number; capacity: number }>()
    expect(ws?.seats_remaining).toBe(3)

    const { data: reg } = await supabase
      .from('registrations')
      .select('status')
      .eq('workshop_id', workshopId)
      .eq('mssv', mssv)
      .single<{ status: string }>()
    expect(reg?.status).toBe('expired')
  }, 30_000)
})
