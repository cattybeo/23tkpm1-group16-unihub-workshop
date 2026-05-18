-- Recreate AI Summary claim RPC and force PostgREST to reload schema cache.
-- This migration is intentionally idempotent because Supabase RPC calls go
-- through PostgREST, which can keep an old schema cache after SQL changes.

alter table workshops
  add column if not exists summary_status text not null default 'idle',
  add column if not exists summary_attempts integer not null default 0,
  add column if not exists summary_error_code text,
  add column if not exists summary_error_message text;

alter table workshops
  drop constraint if exists workshops_summary_status_check,
  add constraint workshops_summary_status_check
    check (summary_status in ('idle', 'processing', 'completed', 'failed'));

alter table workshops
  drop constraint if exists workshops_summary_attempts_check,
  add constraint workshops_summary_attempts_check
    check (summary_attempts >= 0 and summary_attempts <= 3);

create or replace function public.claim_workshop_summary_attempt(p_workshop_id uuid)
returns table (
  workshop_id uuid,
  attempts_used integer,
  status text
)
language plpgsql
set search_path = public
as $$
begin
  return query
  update workshops
     set summary_status = 'processing',
         summary_attempts = summary_attempts + 1,
         summary_error_code = null,
         summary_error_message = null
   where id = p_workshop_id
     and cancelled_at is null
     and summary_status <> 'processing'
     and summary_attempts < 3
   returning id, summary_attempts, summary_status;
end;
$$;

revoke all on function public.claim_workshop_summary_attempt(uuid) from public, anon, authenticated;
grant execute on function public.claim_workshop_summary_attempt(uuid) to service_role;

notify pgrst, 'reload schema';
