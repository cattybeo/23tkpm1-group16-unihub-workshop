import { beforeEach, describe, expect, it, vi } from 'vitest';

const supabaseAdminMock = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock('../../infra/supabase.js', () => ({
  supabaseAdmin: supabaseAdminMock,
}));

import { CheckinService } from './checkin-service.js';

function createStudentsQuery(data: Array<{ mssv: string; full_name: string }>) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    ilike: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    returns: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

function createRegistrationsQuery(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    returns: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

function createCheckInsQuery(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    returns: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

function createSingleRegistrationQuery(data: unknown) {
  return {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data, error: null }),
  };
}

describe('CheckinService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('marks manual lookup result as checked_in when check_ins exists', async () => {
    supabaseAdminMock.from.mockImplementation((table: string) => {
      if (table === 'students') {
        return createStudentsQuery([{ mssv: '22120001', full_name: 'Nguyen Van A' }]);
      }
      if (table === 'registrations') {
        return createRegistrationsQuery([
          {
            id: 'registration-1',
            mssv: '22120001',
            status: 'confirmed',
            qr_token: 'qr-1',
          },
        ]);
      }
      if (table === 'check_ins') {
        return createCheckInsQuery([{ registration_id: 'registration-1' }]);
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const service = new CheckinService();
    const results = await service.searchRegistrations('workshop-1', '22120001');

    expect(results).toEqual([
      {
        registration_id: 'registration-1',
        mssv: '22120001',
        name: 'Nguyen Van A',
        status: 'checked_in',
        qr_token: 'qr-1',
      },
    ]);
  });

  it('rejects manual check-in when registration is already checked in', async () => {
    supabaseAdminMock.from.mockImplementation((table: string) => {
      if (table === 'registrations') {
        return createSingleRegistrationQuery({
          id: 'registration-1',
          workshop_id: 'workshop-1',
          status: 'confirmed',
          workshops: { is_published: true, cancelled_at: null },
        });
      }
      if (table === 'check_ins') {
        return createCheckInsQuery([{ registration_id: 'registration-1' }]);
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const service = new CheckinService();

    await expect(service.checkinRegistration('registration-1', 'workshop-1', 'staff-1')).rejects.toMatchObject({
      status: 409,
      code: 'ALREADY_CHECKED_IN',
    });
  });

  it('lists workshop roster for offline cache with check-in status', async () => {
    supabaseAdminMock.from.mockImplementation((table: string) => {
      if (table === 'registrations') {
        return createRegistrationsQuery([
          {
            id: 'registration-1',
            mssv: '22120001',
            status: 'confirmed',
            qr_token: 'qr-1',
          },
          {
            id: 'registration-2',
            mssv: '22120002',
            status: 'pending_payment',
            qr_token: 'qr-2',
          },
        ]);
      }
      if (table === 'students') {
        return createStudentsQuery([
          { mssv: '22120001', full_name: 'Nguyen Van A' },
          { mssv: '22120002', full_name: 'Tran Thi B' },
        ]);
      }
      if (table === 'check_ins') {
        return createCheckInsQuery([{ registration_id: 'registration-1' }]);
      }
      throw new Error(`Unexpected table ${table}`);
    });

    const service = new CheckinService();
    const results = await service.listRegistrationsForWorkshop('workshop-1');

    expect(results).toEqual([
      {
        registration_id: 'registration-1',
        mssv: '22120001',
        name: 'Nguyen Van A',
        status: 'checked_in',
        qr_token: 'qr-1',
      },
      {
        registration_id: 'registration-2',
        mssv: '22120002',
        name: 'Tran Thi B',
        status: 'pending_payment',
        qr_token: 'qr-2',
      },
    ]);
  });
});
