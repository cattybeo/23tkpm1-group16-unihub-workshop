-- Notification outbox + transactional registration/payment helpers.
-- Supabase CLI is not available in this workspace, so this migration was
-- created manually with the next sequential timestamp.

do $$ begin
  create type notification_status as enum ('pending', 'in_progress', 'sent', 'failed');
exception when duplicate_object then null;
end $$;

alter table if exists notifications
  add column if not exists registration_id uuid references registrations(id) on delete cascade,
  add column if not exists status notification_status not null default 'pending',
  add column if not exists retry_count integer not null default 0,
  add column if not exists last_error text,
  add column if not exists updated_at timestamptz not null default now();

do $$ begin
  alter table notifications
    add constraint notifications_retry_count_non_negative check (retry_count >= 0);
exception when duplicate_object then null;
end $$;

drop trigger if exists notifications_set_updated_at on notifications;
create trigger notifications_set_updated_at
  before update on notifications
  for each row execute function set_updated_at();

create index if not exists notifications_user_created_idx
  on notifications (user_id, created_at desc);

create index if not exists notifications_retry_idx
  on notifications (status, updated_at)
  where status in ('pending', 'failed', 'in_progress') and retry_count < 3;

alter table if exists notifications enable row level security;
revoke all on table notifications from anon, authenticated;
grant all on table notifications to service_role;

create or replace function public.create_registration_with_outbox(
  p_mssv text,
  p_workshop_id uuid,
  p_user_id uuid
)
returns table (
  registration_id uuid,
  workshop_id uuid,
  status registration_status,
  qr_token text,
  fee_vnd integer,
  notification_id uuid
)
language plpgsql
set search_path = public
as $$
declare
  v_workshop record;
  v_existing record;
  v_registration_id uuid;
  v_qr_token text := gen_random_uuid()::text;
  v_status registration_status;
  v_expires_at timestamptz;
  v_notification_id uuid;
begin
  update workshops
     set seats_remaining = seats_remaining - 1
   where id = p_workshop_id
     and seats_remaining > 0
     and is_published = true
     and cancelled_at is null
   returning id, title, fee_vnd
        into v_workshop;

  if not found then
    select id, seats_remaining, is_published, cancelled_at
      into v_existing
      from workshops
     where id = p_workshop_id;

    if not found or v_existing.is_published is not true or v_existing.cancelled_at is not null then
      raise exception 'RESOURCE_NOT_FOUND';
    end if;

    raise exception 'SEATS_SOLD_OUT';
  end if;

  v_status := case
    when v_workshop.fee_vnd = 0 then 'confirmed'::registration_status
    else 'pending_payment'::registration_status
  end;
  v_expires_at := case
    when v_status = 'pending_payment' then now() + interval '15 minutes'
    else null
  end;

  insert into registrations (
    mssv,
    workshop_id,
    status,
    qr_token,
    expires_at,
    confirmed_at
  )
  values (
    p_mssv,
    p_workshop_id,
    v_status,
    v_qr_token,
    v_expires_at,
    case when v_status = 'confirmed' then now() else null end
  )
  returning id into v_registration_id;

  if v_status = 'confirmed' then
    insert into notifications (
      user_id,
      registration_id,
      title,
      body,
      status
    )
    values (
      p_user_id,
      v_registration_id,
      'Đăng ký workshop thành công',
      'Bạn đã đăng ký thành công workshop "' || v_workshop.title || '". Mã QR đã sẵn sàng trong Vé của tôi.',
      'pending'
    )
    returning id into v_notification_id;
  end if;

  return query
    select v_registration_id, p_workshop_id, v_status, v_qr_token, v_workshop.fee_vnd, v_notification_id;
end;
$$;

create or replace function public.confirm_registration_payment_with_outbox(
  p_registration_id uuid,
  p_user_id uuid,
  p_amount_vnd integer,
  p_gateway_ref text
)
returns table (
  payment_id uuid,
  registration_id uuid,
  qr_token text,
  notification_id uuid
)
language plpgsql
set search_path = public
as $$
declare
  v_registration record;
  v_payment_id uuid;
  v_notification_id uuid;
begin
  select
    r.id,
    r.status,
    r.qr_token,
    r.expires_at,
    w.title,
    w.fee_vnd
  into v_registration
  from registrations r
  join workshops w on w.id = r.workshop_id
  where r.id = p_registration_id;

  if not found then
    raise exception 'REGISTRATION_NOT_FOUND';
  end if;

  if v_registration.status <> 'pending_payment'::registration_status then
    raise exception 'REGISTRATION_NOT_FOUND';
  end if;

  if v_registration.expires_at is not null and v_registration.expires_at < now() then
    raise exception 'REGISTRATION_NOT_FOUND';
  end if;

  if p_amount_vnd <> v_registration.fee_vnd then
    raise exception 'PAYMENT_AMOUNT_MISMATCH';
  end if;

  insert into payments (
    registration_id,
    amount_vnd,
    status,
    gateway_ref
  )
  values (
    p_registration_id,
    p_amount_vnd,
    'succeeded',
    p_gateway_ref
  )
  returning id into v_payment_id;

  update registrations
     set status = 'confirmed',
         confirmed_at = now(),
         expires_at = null
   where id = p_registration_id;

  insert into notifications (
    user_id,
    registration_id,
    title,
    body,
    status
  )
  values (
    p_user_id,
    p_registration_id,
    'Thanh toán workshop thành công',
    'Thanh toán cho workshop "' || v_registration.title || '" đã hoàn tất. Mã QR đã sẵn sàng trong Vé của tôi.',
    'pending'
  )
  returning id into v_notification_id;

  return query
    select v_payment_id, p_registration_id, v_registration.qr_token, v_notification_id;
end;
$$;

revoke all on function public.create_registration_with_outbox(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.confirm_registration_payment_with_outbox(uuid, uuid, integer, text) from public, anon, authenticated;
grant execute on function public.create_registration_with_outbox(text, uuid, uuid) to service_role;
grant execute on function public.confirm_registration_payment_with_outbox(uuid, uuid, integer, text) to service_role;
