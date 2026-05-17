-- Seat release RPCs — atomic compensating actions for the seat reservation flow.
-- Spec: blueprint/specs/seat-reservation.md (CLAUDE.md hard rule #3 — không SELECT rồi UPDATE).
--
-- 1. cancel_registration_with_seat_release: payment business-fail path
--    (card declined, mismatched amount, etc.). Inserts payment row, marks
--    registration cancelled, restores the seat — all in one Postgres transaction.
--
-- 2. expire_pending_registrations: cron job 60s. Bulk-marks pending_payment
--    rows expired and atomically restores seats per workshop in a single CTE.

create or replace function cancel_registration_with_seat_release(
  p_registration_id uuid,
  p_amount_vnd integer,
  p_reason text
)
returns table (
  registration_id uuid,
  workshop_id uuid,
  payment_id uuid
)
language plpgsql
set search_path = public
as $$
declare
  v_registration record;
  v_payment_id uuid;
begin
  -- Lock the registration row to serialize concurrent payment webhooks / retries
  -- targeting the same registration_id.
  select id, workshop_id, status
    into v_registration
    from registrations
   where id = p_registration_id
   for update;

  if not found then
    raise exception 'REGISTRATION_NOT_FOUND';
  end if;

  if v_registration.status <> 'pending_payment'::registration_status then
    -- Already cancelled / expired / confirmed by another flow. No-op safe.
    raise exception 'REGISTRATION_NOT_PENDING';
  end if;

  insert into payments (
    registration_id,
    amount_vnd,
    status,
    failure_reason
  )
  values (
    p_registration_id,
    p_amount_vnd,
    'failed'::payment_status,
    p_reason
  )
  returning id into v_payment_id;

  update registrations
     set status = 'cancelled'::registration_status,
         cancelled_reason = p_reason
   where id = p_registration_id;

  -- Atomic compensating UPDATE — never SELECT-then-add in application code.
  -- Guard `seats_remaining < capacity` keeps the CHECK constraint safe if drift exists.
  update workshops
     set seats_remaining = seats_remaining + 1
   where id = v_registration.workshop_id
     and seats_remaining < capacity;

  return query
    select p_registration_id, v_registration.workshop_id, v_payment_id;
end;
$$;

create or replace function expire_pending_registrations()
returns table (
  workshop_id uuid,
  released_count integer
)
language plpgsql
set search_path = public
as $$
begin
  return query
  with expired as (
    update registrations
       set status = 'expired'::registration_status
     where status = 'pending_payment'::registration_status
       and expires_at is not null
       and expires_at < now()
    returning registrations.workshop_id
  ),
  grouped as (
    select expired.workshop_id as ws_id, count(*)::integer as cnt
      from expired
     group by expired.workshop_id
  ),
  bumped as (
    update workshops w
       set seats_remaining = least(w.capacity, w.seats_remaining + g.cnt)
      from grouped g
     where w.id = g.ws_id
    returning w.id as ws_id, g.cnt
  )
  select bumped.ws_id, bumped.cnt from bumped;
end;
$$;

revoke all on function cancel_registration_with_seat_release(uuid, integer, text)
  from public, anon, authenticated;
revoke all on function expire_pending_registrations()
  from public, anon, authenticated;

grant execute on function cancel_registration_with_seat_release(uuid, integer, text)
  to service_role;
grant execute on function expire_pending_registrations()
  to service_role;
