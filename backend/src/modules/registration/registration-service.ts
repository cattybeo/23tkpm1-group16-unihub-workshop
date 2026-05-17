import { RegistrationRepository } from './registration-repository.ts';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../../infra/supabase.ts';

export class RegistrationService {
  constructor(private repo: RegistrationRepository) {}

  async register(studentId: string, mssv: string, workshop_id: string) {
    const { data: existing } = await supabaseAdmin
      .from('registrations')
      .select('qr_token, status, id')
      .eq('mssv', mssv)
      .eq('workshop_id', workshop_id)
      .in('status', ['pending_payment', 'confirmed'])
      .single();

    if (existing) {
      console.log(`[Registration] Sinh viên ${mssv} đã có vé, trả về token cũ.`);
      return existing;
    }

    const { data: ws, error: wsError } = await supabaseAdmin
      .from('workshops').select('id, seats_remaining, fee_vnd').eq('id', workshop_id).single();

    if (wsError || !ws) throw { status: 404, code: 'RESOURCE_NOT_FOUND', message: 'Không tìm thấy workshop' };
    if (ws.seats_remaining <= 0) throw { status: 409, code: 'SEATS_SOLD_OUT', message: 'Hết chỗ' };

    const { error: updateError } = await supabaseAdmin
      .from('workshops').update({ seats_remaining: ws.seats_remaining - 1 })
      .eq('id', workshop_id).gt('seats_remaining', 0);

    if (updateError) throw { status: 500, message: 'Lỗi giữ chỗ' };

    const qrToken = randomUUID();
    try {
      const status = ws.fee_vnd > 0 ? 'pending_payment' : 'confirmed';
      return await this.repo.createRegistration({
        mssv, workshop_id, status, qr_token: qrToken,
        expires_at: status === 'pending_payment' ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null
      });
    } catch (err: any) {
      await supabaseAdmin.from('workshops').update({ seats_remaining: ws.seats_remaining }).eq('id', workshop_id);
      throw err;
    }
  }
}