-- Bulk outbox insert for workshop cancel / reschedule / room change.
-- Returns the inserted notification ids so the caller can dispatch them.

create or replace function public.notify_workshop_change(
  p_workshop_id uuid,
  p_title text,
  p_body text
)
returns table (notification_id uuid)
language plpgsql
set search_path = public
as $$
begin
  return query
  with affected as (
    select r.id as registration_id, p.id as user_id
      from registrations r
      join profiles p on p.mssv = r.mssv
     where r.workshop_id = p_workshop_id
       and r.status = 'confirmed'::registration_status
  )
  insert into notifications (user_id, registration_id, title, body, status)
  select user_id, registration_id, p_title, p_body, 'pending'::notification_status
    from affected
  returning id;
end;
$$;

revoke all on function public.notify_workshop_change(uuid, text, text) from public, anon, authenticated;
grant execute on function public.notify_workshop_change(uuid, text, text) to service_role;
