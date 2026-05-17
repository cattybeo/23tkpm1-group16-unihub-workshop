import { supabaseAdmin } from '../../infra/supabase.ts';

export class CheckinService {
  async checkin(qrToken: string, workshopId: string, scannerUserId: string) {
    const { data: reg, error } = await supabaseAdmin
      .from('registrations')
      .select('id, workshop_id, status')
      .eq('qr_token', qrToken)
      .single();

    if (error || !reg) throw { status: 404, code: 'TICKET_NOT_FOUND', message: 'Vé không tồn tại' };
    if (reg.workshop_id !== workshopId) throw { status: 400, code: 'WRONG_WORKSHOP', message: 'Vé này không dành cho workshop hiện tại' };
    if (reg.status !== 'confirmed') throw { status: 400, code: 'INVALID_STATUS', message: 'Vé chưa được xác nhận thanh toán' };

    const { error: insError } = await supabaseAdmin
      .from('check_ins')
      .insert({
        registration_id: reg.id,
        scanner_user_id: scannerUserId,
        source: 'online'
      });

    if (insError?.code === '23505') throw { status: 409, code: 'ALREADY_CHECKED_IN', message: 'Sinh viên này đã check-in trước đó' };
    
    return { success: true, registration_id: reg.id };
  }

  async syncOfflineData(records: any[], scannerUserId: string) {
  const results = { synced: [] as string[], errors: [] as any[] };

  for (const record of records) {
    try {
      await this.checkin(record.qr_token, record.workshop_id, scannerUserId);
      results.synced.push(record.client_id);
    } catch (err: any) {
      const businessErrorCodes = ['ALREADY_CHECKED_IN', 'INVALID_STATUS', 'WRONG_WORKSHOP'];
      
      if (businessErrorCodes.includes(err.code)) {
        results.synced.push(record.client_id); 
      } else {
        results.errors.push({ client_id: record.client_id, code: err.code });
      }
    }
  }
  return results;
}
}