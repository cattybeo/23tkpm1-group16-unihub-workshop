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

update workshops
   set summary_status = case
     when summary_md is not null then 'completed'
     else summary_status
   end,
       summary_attempts = case
     when summary_md is not null and summary_attempts = 0 then 1
     else summary_attempts
   end
 where summary_status = 'idle';

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

do $$
begin
  alter publication supabase_realtime add table workshops;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;

comment on column workshops.summary_status is
  'AI summary pipeline status: idle, processing, completed, failed.';
comment on column workshops.summary_attempts is
  'Số lần organizer đã yêu cầu tóm tắt AI cho workshop, tối đa 3.';
comment on column workshops.summary_error_code is
  'Mã lỗi cuối cùng của pipeline AI summary, null khi thành công hoặc chưa chạy.';
comment on column workshops.summary_error_message is
  'Thông báo lỗi cuối cùng của pipeline AI summary, null khi thành công hoặc chưa chạy.';
