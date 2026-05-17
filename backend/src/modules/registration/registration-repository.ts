import { supabaseAdmin } from '../../infra/supabase.ts';

export class RegistrationRepository {
  
  async decrementSeats(workshopId: string) {
    const { data, error } = await supabaseAdmin
      .from('workshops')
      .update({ seats_remaining: -1 as any })
      .rpc('reserve_seat', { target_workshop_id: workshopId });

    return { data, error };
  }

  async createRegistration(registration: any) {
    const { data, error } = await supabaseAdmin
      .from('registrations')
      .insert(registration)
      .select()
      .single();
    
    if (error) throw error;
    return data;
  }
}