import { supabaseAdmin } from '../../infra/supabase.ts';

export class WorkshopRepository {
  async findPublished(limit: number, offset: number) {
    const { data, error, count } = await supabaseAdmin
      .from('workshops')
      .select('*', { count: 'exact' })
      .eq('is_published', true)
      .is('cancelled_at', null)
      .order('start_time', { ascending: true })
      .range(offset, offset + limit - 1);

    if (error) throw error;
    return { data, total: count || 0 };
  }

  async findById(id: string) {
    const { data, error } = await supabaseAdmin
      .from('workshops')
      .select('*')
      .eq('id', id)
      .single();

    if (error) return null;
    return data;
  }
}