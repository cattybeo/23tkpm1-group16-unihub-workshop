import { supabaseAdmin } from '../../infra/supabase.js';

interface CheckinOpts {
  scannedAt?: string;
  source?: 'online' | 'offline';
}

interface OfflineRecord {
  client_id: string;
  qr_token: string;
  workshop_id: string;
  scanned_at: string;
}

type CheckinRegistrationStatus = 'confirmed' | 'pending_payment' | 'checked_in';

interface ManualLookupStudent {
  registration_id: string;
  mssv: string;
  name: string;
  status: CheckinRegistrationStatus;
  qr_token: string | null;
}

interface StudentLookupRow {
  mssv: string;
  full_name: string;
}

interface RegistrationLookupRow {
  id: string;
  mssv: string;
  status: string;
  qr_token: string | null;
}

interface RegistrationCheckinRow {
  id: string;
  workshop_id: string;
  status: string;
  workshops: { is_published: boolean; cancelled_at: string | null } | null;
}

interface CheckInLookupRow {
  registration_id: string;
}

function normalizeSearchQuery(query: string): string {
  return query.trim().replace(/\s+/g, ' ');
}

function toCheckinError(status: number, code: string, message: string) {
  return { status, code, message };
}

async function findCheckedInRegistrationIds(registrationIds: string[]): Promise<Set<string>> {
  if (registrationIds.length === 0) return new Set<string>();

  const { data, error } = await supabaseAdmin
    .from('check_ins')
    .select('registration_id')
    .in('registration_id', registrationIds)
    .returns<CheckInLookupRow[]>();

  if (error) throw toCheckinError(500, 'SERVER_ERROR', error.message);

  return new Set((data ?? []).map(row => row.registration_id));
}

async function ensureRegistrationNotCheckedIn(registrationId: string): Promise<void> {
  const checkedInIds = await findCheckedInRegistrationIds([registrationId]);
  if (checkedInIds.has(registrationId)) {
    throw toCheckinError(409, 'ALREADY_CHECKED_IN', 'Sinh viên này đã check-in trước đó');
  }
}

export class CheckinService {
  async checkin(qrToken: string, workshopId: string, staffUserId: string, opts: CheckinOpts = {}) {
    const { data: reg, error } = await supabaseAdmin
      .from('registrations')
      .select('id, workshop_id, status, workshops(is_published, cancelled_at)')
      .eq('qr_token', qrToken)
      .single<{
        id: string;
        workshop_id: string;
        status: string;
        workshops: { is_published: boolean; cancelled_at: string | null } | null;
      }>();

    if (error || !reg) throw toCheckinError(404, 'TICKET_NOT_FOUND', 'Vé không tồn tại');
    if (reg.workshop_id !== workshopId) throw toCheckinError(400, 'WRONG_WORKSHOP', 'Vé này không dành cho workshop hiện tại');
    if (reg.status !== 'confirmed') throw toCheckinError(400, 'INVALID_STATUS', 'Vé chưa được xác nhận thanh toán');
    if (!reg.workshops || !reg.workshops.is_published || reg.workshops.cancelled_at !== null) {
      throw toCheckinError(410, 'WORKSHOP_UNAVAILABLE', 'Workshop đã bị huỷ hoặc chưa publish');
    }
    await ensureRegistrationNotCheckedIn(reg.id);

    const { error: insError } = await supabaseAdmin
      .from('check_ins')
      .insert({
        registration_id: reg.id,
        staff_user_id: staffUserId,
        source: opts.source ?? 'online',
        ...(opts.scannedAt ? { checked_in_at: opts.scannedAt } : {}),
      });

    if (insError?.code === '23505') throw toCheckinError(409, 'ALREADY_CHECKED_IN', 'Sinh viên này đã check-in trước đó');
    if (insError) throw toCheckinError(500, 'SERVER_ERROR', 'Lỗi ghi dữ liệu');

    return { success: true, registration_id: reg.id };
  }

  async checkinRegistration(registrationId: string, workshopId: string, staffUserId: string) {
    const { data: reg, error } = await supabaseAdmin
      .from('registrations')
      .select('id, workshop_id, status, workshops(is_published, cancelled_at)')
      .eq('id', registrationId)
      .single<RegistrationCheckinRow>();

    if (error || !reg) throw toCheckinError(404, 'TICKET_NOT_FOUND', 'Vé không tồn tại');
    if (reg.workshop_id !== workshopId) throw toCheckinError(400, 'WRONG_WORKSHOP', 'Vé này không dành cho workshop hiện tại');
    if (reg.status !== 'confirmed') throw toCheckinError(400, 'INVALID_STATUS', 'Vé chưa được xác nhận thanh toán');
    if (!reg.workshops || !reg.workshops.is_published || reg.workshops.cancelled_at !== null) {
      throw toCheckinError(410, 'WORKSHOP_UNAVAILABLE', 'Workshop đã bị huỷ hoặc chưa publish');
    }
    await ensureRegistrationNotCheckedIn(reg.id);

    const { error: insError } = await supabaseAdmin
      .from('check_ins')
      .insert({
        registration_id: reg.id,
        staff_user_id: staffUserId,
        source: 'online',
      });

    if (insError?.code === '23505') throw toCheckinError(409, 'ALREADY_CHECKED_IN', 'Sinh viên này đã check-in trước đó');
    if (insError) throw toCheckinError(500, 'SERVER_ERROR', 'Lỗi ghi dữ liệu');

    return { success: true, registration_id: reg.id };
  }

  async searchRegistrations(workshopId: string, query: string): Promise<ManualLookupStudent[]> {
    const normalizedQuery = normalizeSearchQuery(query);
    if (normalizedQuery.length < 2) return [];

    const searchPattern = `%${normalizedQuery}%`;
    const [mssvResult, nameResult] = await Promise.all([
      supabaseAdmin
        .from('students')
        .select('mssv, full_name')
        .eq('is_active', true)
        .ilike('mssv', searchPattern)
        .limit(20)
        .returns<StudentLookupRow[]>(),
      supabaseAdmin
        .from('students')
        .select('mssv, full_name')
        .eq('is_active', true)
        .ilike('full_name', searchPattern)
        .limit(20)
        .returns<StudentLookupRow[]>(),
    ]);

    if (mssvResult.error) throw toCheckinError(500, 'SERVER_ERROR', mssvResult.error.message);
    if (nameResult.error) throw toCheckinError(500, 'SERVER_ERROR', nameResult.error.message);

    const studentsByMssv = new Map<string, StudentLookupRow>();
    for (const student of [...(mssvResult.data ?? []), ...(nameResult.data ?? [])]) {
      studentsByMssv.set(student.mssv, student);
    }

    const candidateMssvs = [...studentsByMssv.keys()].slice(0, 30);
    if (candidateMssvs.length === 0) return [];

    const { data: registrations, error } = await supabaseAdmin
      .from('registrations')
      .select('id, mssv, status, qr_token')
      .eq('workshop_id', workshopId)
      .in('mssv', candidateMssvs)
      .in('status', ['pending_payment', 'confirmed'])
      .returns<RegistrationLookupRow[]>();

    if (error) throw toCheckinError(500, 'SERVER_ERROR', error.message);

    const checkedInIds = await findCheckedInRegistrationIds((registrations ?? []).map(registration => registration.id));

    return (registrations ?? [])
      .map((registration): ManualLookupStudent => {
        const student = studentsByMssv.get(registration.mssv);
        const hasCheckedIn = checkedInIds.has(registration.id);
        return {
          registration_id: registration.id,
          mssv: registration.mssv,
          name: student?.full_name ?? registration.mssv,
          status: hasCheckedIn ? 'checked_in' : registration.status === 'confirmed' ? 'confirmed' : 'pending_payment',
          qr_token: registration.qr_token,
        };
      })
      .sort((a, b) => {
        const aExact = a.mssv.toLowerCase() === normalizedQuery.toLowerCase() ? 0 : 1;
        const bExact = b.mssv.toLowerCase() === normalizedQuery.toLowerCase() ? 0 : 1;
        return aExact - bExact || a.mssv.localeCompare(b.mssv);
      })
      .slice(0, 20);
  }

  async listRegistrationsForWorkshop(workshopId: string): Promise<ManualLookupStudent[]> {
    const { data: registrations, error } = await supabaseAdmin
      .from('registrations')
      .select('id, mssv, status, qr_token')
      .eq('workshop_id', workshopId)
      .in('status', ['pending_payment', 'confirmed'])
      .returns<RegistrationLookupRow[]>();

    if (error) throw toCheckinError(500, 'SERVER_ERROR', error.message);

    const registrationRows = registrations ?? [];
    if (registrationRows.length === 0) return [];

    const mssvs = [...new Set(registrationRows.map(registration => registration.mssv))];
    const { data: students, error: studentsError } = await supabaseAdmin
      .from('students')
      .select('mssv, full_name')
      .in('mssv', mssvs)
      .returns<StudentLookupRow[]>();

    if (studentsError) throw toCheckinError(500, 'SERVER_ERROR', studentsError.message);

    const studentsByMssv = new Map((students ?? []).map(student => [student.mssv, student]));
    const checkedInIds = await findCheckedInRegistrationIds(registrationRows.map(registration => registration.id));

    return registrationRows
      .map((registration): ManualLookupStudent => {
        const student = studentsByMssv.get(registration.mssv);
        const hasCheckedIn = checkedInIds.has(registration.id);
        return {
          registration_id: registration.id,
          mssv: registration.mssv,
          name: student?.full_name ?? registration.mssv,
          status: hasCheckedIn ? 'checked_in' : registration.status === 'confirmed' ? 'confirmed' : 'pending_payment',
          qr_token: registration.qr_token,
        };
      })
      .sort((a, b) => a.mssv.localeCompare(b.mssv));
  }

  async syncOfflineData(records: OfflineRecord[], staffUserId: string) {
    const results = {
      synced: [] as string[],
      errors: [] as { client_id: string; code: string; message: string }[],
    };

    if (records.length === 0) return results;

    const tokens = records.map(r => r.qr_token);
    const { data: regs, error: lookupError } = await supabaseAdmin
      .from('registrations')
      .select('id, workshop_id, status, qr_token, workshops(is_published, cancelled_at)')
      .in('qr_token', tokens);

    if (lookupError) throw { status: 500, code: 'SERVER_ERROR', message: lookupError.message };

    type RegLookup = {
      id: string;
      workshop_id: string;
      status: string;
      qr_token: string;
      workshops: { is_published: boolean; cancelled_at: string | null } | null;
    };
    const regByToken = new Map<string, RegLookup>(
      (regs ?? []).map(r => {
        const reg = r as unknown as RegLookup;
        return [reg.qr_token, reg];
      }),
    );

    const payloadByRegistrationId = new Map<string, {
      registration_id: string;
      staff_user_id: string;
      source: 'offline';
      checked_in_at: string;
    }>();
    const queuedClientIdsByRegistrationId = new Map<string, string[]>();

    for (const record of records) {
      const reg = regByToken.get(record.qr_token);
      if (!reg) {
        results.errors.push({ client_id: record.client_id, code: 'TICKET_NOT_FOUND', message: 'Vé không tồn tại' });
        continue;
      }
      if (reg.workshop_id !== record.workshop_id) {
        results.errors.push({ client_id: record.client_id, code: 'WRONG_WORKSHOP', message: 'Vé này không dành cho workshop hiện tại' });
        continue;
      }
      if (reg.status !== 'confirmed') {
        results.errors.push({ client_id: record.client_id, code: 'INVALID_STATUS', message: 'Vé chưa được xác nhận thanh toán' });
        continue;
      }
      if (!reg.workshops || !reg.workshops.is_published || reg.workshops.cancelled_at !== null) {
        results.errors.push({ client_id: record.client_id, code: 'WORKSHOP_UNAVAILABLE', message: 'Workshop đã bị huỷ hoặc chưa publish' });
        continue;
      }
      if (!payloadByRegistrationId.has(reg.id)) {
        payloadByRegistrationId.set(reg.id, {
          registration_id: reg.id,
          staff_user_id: staffUserId,
          source: 'offline',
          checked_in_at: record.scanned_at,
        });
      }
      const existingClientIds = queuedClientIdsByRegistrationId.get(reg.id) ?? [];
      existingClientIds.push(record.client_id);
      queuedClientIdsByRegistrationId.set(reg.id, existingClientIds);
    }

    const alreadyCheckedInIds = await findCheckedInRegistrationIds([...payloadByRegistrationId.keys()]);
    for (const registrationId of alreadyCheckedInIds) {
      payloadByRegistrationId.delete(registrationId);
      results.synced.push(...(queuedClientIdsByRegistrationId.get(registrationId) ?? []));
    }

    const payload = [...payloadByRegistrationId.values()];
    if (payload.length > 0) {
      const { error: upsertError } = await supabaseAdmin
        .from('check_ins')
        .upsert(payload, { onConflict: 'registration_id', ignoreDuplicates: true });

      if (upsertError) throw { status: 500, code: 'SERVER_ERROR', message: upsertError.message };

      for (const registrationId of payloadByRegistrationId.keys()) {
        results.synced.push(...(queuedClientIdsByRegistrationId.get(registrationId) ?? []));
      }
    }

    return results;
  }
}
