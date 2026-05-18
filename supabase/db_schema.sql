-- =============================================================================
-- UNIHUB WORKSHOP — SCHEMA DUMP
-- -----------------------------------------------------------------------------
-- Extracted from live DB: hpncfgxtjnxjkbkqcbvc (ap-southeast-1)
-- Date: 2026-05-18
--
-- Bao gồm: extensions, enums, tables, constraints, triggers, indexes,
--           RPCs, RLS policies, grants, realtime publication.
--
-- Chạy trên DB fresh (không có sẵn tables). Idempotent:
--   CREATE OR REPLACE, IF NOT EXISTS, DO $$ EXCEPTION WHEN duplicate_object.
-- =============================================================================


-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
create extension if not exists "pgcrypto";


-- ============================================================================
-- 2. ENUMS
-- ============================================================================
do $$ begin create type user_role as enum ('student', 'organizer', 'staff');
exception when duplicate_object then null; end $$;

do $$ begin create type registration_status as enum ('pending_payment', 'confirmed', 'cancelled', 'expired');
exception when duplicate_object then null; end $$;

do $$ begin create type payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');
exception when duplicate_object then null; end $$;

do $$ begin create type check_in_source as enum ('online', 'offline');
exception when duplicate_object then null; end $$;

do $$ begin create type notification_status as enum ('pending', 'in_progress', 'sent', 'failed');
exception when duplicate_object then null; end $$;


-- ============================================================================
-- 3. TRIGGER FUNCTION
-- ============================================================================
create or replace function set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ============================================================================
-- 4. TABLES (columns only — constraints added separately below)
-- ============================================================================

create table if not exists students (
  mssv            text not null,
  full_name       text not null,
  is_active       boolean not null default true,
  last_synced_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table students is 'Whitelist sinh viên hợp lệ. Nguồn: CSV nightly. Backend ghi qua service_role.';

create table if not exists profiles (
  id                   uuid not null,
  role                 user_role not null default 'student'::user_role,
  mssv                 text,
  display_name         text not null,
  phone                text,
  must_change_password boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on column profiles.must_change_password is
  'true = lần đầu đăng nhập, bắt buộc đổi mật khẩu default (123) trước khi dùng app.';

create table if not exists workshops (
  id                   uuid not null default gen_random_uuid(),
  title                text not null,
  description          text,
  speaker_name         text not null,
  speaker_bio          text,
  room                 text not null,
  cover_image_url      text,
  room_map_url         text,
  start_time           timestamptz not null,
  end_time             timestamptz not null,
  capacity             integer not null,
  seats_remaining      integer not null,
  fee_vnd              integer not null default 0,
  pdf_url              text,
  summary_md           text,
  summary_generated_at timestamptz,
  is_published         boolean not null default false,
  cancelled_at         timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on column workshops.cover_image_url is 'URL ảnh bìa workshop trên Supabase Storage (bucket: workshop-assets). NULL nếu chưa upload.';
comment on column workshops.room_map_url is 'URL ảnh sơ đồ phòng học trên Supabase Storage (bucket: workshop-assets). NULL nếu chưa upload.';
comment on column workshops.seats_remaining is 'Giảm trong cùng transaction với INSERT registration (atomic UPDATE — ADR-004).';
comment on column workshops.summary_md is 'AI tóm tắt PDF workshop. NULL nếu chưa generate. Regenerate = UPDATE.';

create table if not exists registrations (
  id               uuid not null default gen_random_uuid(),
  mssv             text not null,
  workshop_id      uuid not null,
  status           registration_status not null default 'pending_payment'::registration_status,
  qr_token         text,
  expires_at       timestamptz,
  cancelled_reason text,
  confirmed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists payments (
  id              uuid not null default gen_random_uuid(),
  registration_id uuid not null,
  amount_vnd      integer not null,
  status          payment_status not null default 'pending'::payment_status,
  gateway_ref     text,
  failure_reason  text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists idempotency_keys (
  key        text not null,
  endpoint   text not null,
  user_id    uuid,
  response   jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists check_ins (
  id              uuid not null default gen_random_uuid(),
  registration_id uuid not null,
  staff_user_id   uuid not null,
  source          check_in_source not null,
  checked_in_at   timestamptz not null default now()
);

create table if not exists notifications (
  id              uuid not null default gen_random_uuid(),
  user_id         uuid not null,
  registration_id uuid,
  title           text not null,
  body            text not null,
  status          notification_status not null default 'pending'::notification_status,
  retry_count     integer not null default 0,
  last_error      text,
  read_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table if not exists csv_import_logs (
  id             uuid not null default gen_random_uuid(),
  source_file    text,
  status         text not null,
  message        text,
  created_at     timestamptz not null default now(),
  imported_at    timestamptz not null default now(),
  imported_count integer not null default 0
);
comment on table csv_import_logs is 'Audit log cho CSV nightly student import. Backend ghi qua service_role; không expose trực tiếp cho FE.';


-- ============================================================================
-- 5. PRIMARY KEYS
-- ============================================================================
alter table students         add constraint students_pkey         primary key (mssv);
alter table profiles         add constraint profiles_pkey         primary key (id);
alter table workshops        add constraint workshops_pkey        primary key (id);
alter table registrations    add constraint registrations_pkey    primary key (id);
alter table payments         add constraint payments_pkey         primary key (id);
alter table idempotency_keys add constraint idempotency_keys_pkey primary key (key, endpoint);
alter table check_ins        add constraint check_ins_pkey        primary key (id);
alter table notifications    add constraint notifications_pkey    primary key (id);
alter table csv_import_logs  add constraint csv_import_logs_pkey  primary key (id);


-- ============================================================================
-- 6. FOREIGN KEYS
-- ============================================================================
alter table profiles
  add constraint profiles_id_fkey   foreign key (id)   references auth.users(id) on delete cascade,
  add constraint profiles_mssv_fkey foreign key (mssv) references students(mssv)  on delete restrict;

alter table registrations
  add constraint registrations_mssv_fkey        foreign key (mssv)        references students(mssv)  on delete restrict,
  add constraint registrations_workshop_id_fkey foreign key (workshop_id) references workshops(id)   on delete restrict;

alter table payments
  add constraint payments_registration_id_fkey foreign key (registration_id) references registrations(id) on delete restrict;

alter table idempotency_keys
  add constraint idempotency_keys_user_id_fkey foreign key (user_id) references profiles(id) on delete set null;

alter table check_ins
  add constraint check_ins_registration_id_fkey foreign key (registration_id) references registrations(id) on delete restrict,
  add constraint check_ins_staff_user_id_fkey   foreign key (staff_user_id)   references profiles(id)      on delete restrict;

alter table notifications
  add constraint notifications_user_id_fkey         foreign key (user_id)         references profiles(id)      on delete cascade,
  add constraint notifications_registration_id_fkey foreign key (registration_id) references registrations(id) on delete cascade;


-- ============================================================================
-- 7. UNIQUE CONSTRAINTS
-- ============================================================================
alter table profiles  add constraint profiles_mssv_unique          unique (mssv);
alter table check_ins add constraint check_ins_registration_unique  unique (registration_id);


-- ============================================================================
-- 8. CHECK CONSTRAINTS
-- ============================================================================
alter table students add constraint students_mssv_format
  check (mssv ~ '^[A-Za-z0-9]{6,20}$');

alter table profiles add constraint profiles_role_mssv_link check (
  (role = 'student' and mssv is not null) or
  (role <> 'student' and mssv is null)
);

alter table workshops
  add constraint workshops_capacity_positive check (capacity > 0),
  add constraint workshops_seats_range       check (seats_remaining >= 0 and seats_remaining <= capacity),
  add constraint workshops_time_order        check (end_time > start_time),
  add constraint workshops_fee_nonneg        check (fee_vnd >= 0);

alter table payments
  add constraint payments_amount_positive check (amount_vnd > 0);

alter table notifications
  add constraint notifications_retry_count_non_negative check (retry_count >= 0);

alter table csv_import_logs
  add constraint csv_import_logs_status_check
    check (status in ('running', 'completed', 'failed', 'skipped')),
  add constraint csv_import_logs_imported_count_non_negative
    check (imported_count >= 0);


-- ============================================================================
-- 9. EXCLUDE CONSTRAINT (registrations — chống double booking active)
-- ----------------------------------------------------------------------------
-- Ngăn 2 record active cùng student + workshop. Cho phép đăng ký lại sau
-- khi cancelled/expired.
-- ============================================================================
do $$ begin
  alter table registrations add constraint registrations_unique_active
    exclude using btree (mssv with =, workshop_id with =)
    where (status in ('pending_payment', 'confirmed'));
exception when duplicate_object then null;
end $$;


-- ============================================================================
-- 10. TRIGGERS (set_updated_at)
-- ============================================================================
drop trigger if exists students_set_updated_at on students;
create trigger students_set_updated_at
  before update on students for each row execute function set_updated_at();

drop trigger if exists profiles_set_updated_at on profiles;
create trigger profiles_set_updated_at
  before update on profiles for each row execute function set_updated_at();

drop trigger if exists workshops_set_updated_at on workshops;
create trigger workshops_set_updated_at
  before update on workshops for each row execute function set_updated_at();

drop trigger if exists registrations_set_updated_at on registrations;
create trigger registrations_set_updated_at
  before update on registrations for each row execute function set_updated_at();

drop trigger if exists payments_set_updated_at on payments;
create trigger payments_set_updated_at
  before update on payments for each row execute function set_updated_at();

drop trigger if exists notifications_set_updated_at on notifications;
create trigger notifications_set_updated_at
  before update on notifications for each row execute function set_updated_at();


-- ============================================================================
-- 11. INDEXES
-- ============================================================================
create index if not exists workshops_published_start_idx
  on workshops (start_time)
  where is_published = true and cancelled_at is null;

create index if not exists registrations_mssv_status_idx     on registrations (mssv, status);
create index if not exists registrations_workshop_status_idx on registrations (workshop_id, status);

create index if not exists registrations_expires_idx
  on registrations (expires_at)
  where status = 'pending_payment';

create index if not exists payments_registration_idx on payments (registration_id);

create index if not exists notifications_user_created_idx
  on notifications (user_id, created_at desc);

create index if not exists notifications_retry_idx
  on notifications (status, updated_at)
  where status in ('pending', 'failed', 'in_progress') and retry_count < 3;

create index if not exists csv_import_logs_imported_at_idx
  on csv_import_logs (imported_at desc);

create unique index if not exists csv_import_logs_completed_source_file_idx
  on csv_import_logs (source_file)
  where source_file is not null and status = 'completed';


-- ============================================================================
-- 12. ROW LEVEL SECURITY — enable on all tables
-- ============================================================================
alter table students         enable row level security;
alter table profiles         enable row level security;
alter table workshops        enable row level security;
alter table registrations    enable row level security;
alter table payments         enable row level security;
alter table idempotency_keys enable row level security;
alter table check_ins        enable row level security;
alter table notifications    enable row level security;
alter table csv_import_logs  enable row level security;


-- ============================================================================
-- 13. GRANTS
-- ----------------------------------------------------------------------------
-- workshops: anon + authenticated đọc (RLS filter published).
-- profiles: authenticated self read/update.
-- notifications: authenticated self read (RLS filter user_id).
-- Bảng còn lại: deny-all với anon/authenticated — chỉ service_role bypass.
-- ============================================================================
grant usage on schema public to anon, authenticated, service_role;
grant select on workshops     to anon, authenticated;
grant select, update on profiles to authenticated;
grant select on notifications to authenticated;
grant all on students, profiles, workshops, registrations, payments,
  idempotency_keys, check_ins, notifications, csv_import_logs to service_role;


-- ============================================================================
-- 14. RLS POLICIES
-- ============================================================================
drop policy if exists workshops_read_public on workshops;
create policy workshops_read_public on workshops
  for select to anon, authenticated
  using (is_published = true and cancelled_at is null);

drop policy if exists profiles_read_self on profiles;
create policy profiles_read_self on profiles
  for select to authenticated
  using ((select auth.uid()) = id);

drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles
  for update to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

do $$ begin
  create policy notifications_self_select on notifications
    for select to authenticated
    using (user_id = auth.uid());
exception when duplicate_object then null;
end $$;


-- ============================================================================
-- 15. REALTIME PUBLICATION
-- ============================================================================
do $$ begin
  alter publication supabase_realtime add table notifications;
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table workshops;
exception when duplicate_object then null;
end $$;


-- ============================================================================
-- 16. RPC FUNCTIONS
-- ============================================================================

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
  v_student_active boolean;
  v_registration_id uuid;
  v_qr_token text := gen_random_uuid()::text;
  v_status registration_status;
  v_expires_at timestamptz;
  v_notification_id uuid;
begin
  select is_active into v_student_active from students where mssv = p_mssv;
  if not found or v_student_active is not true then raise exception 'STUDENT_NOT_VERIFIED'; end if;

  update workshops
     set seats_remaining = seats_remaining - 1
   where id = p_workshop_id and seats_remaining > 0 and is_published = true and cancelled_at is null
   returning id, title, fee_vnd into v_workshop;

  if not found then
    select id, seats_remaining, is_published, cancelled_at into v_existing from workshops where id = p_workshop_id;
    if not found or v_existing.is_published is not true or v_existing.cancelled_at is not null then
      raise exception 'RESOURCE_NOT_FOUND';
    end if;
    raise exception 'SEATS_SOLD_OUT';
  end if;

  v_status := case when v_workshop.fee_vnd = 0 then 'confirmed'::registration_status else 'pending_payment'::registration_status end;
  v_expires_at := case when v_status = 'pending_payment' then now() + interval '15 minutes' else null end;

  insert into registrations (mssv, workshop_id, status, qr_token, expires_at, confirmed_at)
  values (p_mssv, p_workshop_id, v_status, v_qr_token, v_expires_at, case when v_status = 'confirmed' then now() else null end)
  returning id into v_registration_id;

  if v_status = 'confirmed' then
    insert into notifications (user_id, registration_id, title, body, status)
    values (p_user_id, v_registration_id,
      'Đăng ký workshop thành công',
      'Bạn đã đăng ký thành công workshop "' || v_workshop.title || '". Mã QR đã sẵn sàng trong Vé của tôi.',
      'pending')
    returning id into v_notification_id;
  end if;

  return query select v_registration_id, p_workshop_id, v_status, v_qr_token, v_workshop.fee_vnd, v_notification_id;
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
  select r.id, r.status, r.qr_token, r.expires_at, w.title, w.fee_vnd
    into v_registration
    from registrations r join workshops w on w.id = r.workshop_id
   where r.id = p_registration_id;

  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  if v_registration.status <> 'pending_payment'::registration_status then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  if v_registration.expires_at is not null and v_registration.expires_at < now() then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  if p_amount_vnd <> v_registration.fee_vnd then raise exception 'PAYMENT_AMOUNT_MISMATCH'; end if;

  insert into payments (registration_id, amount_vnd, status, gateway_ref)
  values (p_registration_id, p_amount_vnd, 'succeeded', p_gateway_ref)
  returning id into v_payment_id;

  update registrations set status = 'confirmed', confirmed_at = now(), expires_at = null where id = p_registration_id;

  insert into notifications (user_id, registration_id, title, body, status)
  values (p_user_id, p_registration_id,
    'Thanh toán workshop thành công',
    'Thanh toán cho workshop "' || v_registration.title || '" đã hoàn tất. Mã QR đã sẵn sàng trong Vé của tôi.',
    'pending')
  returning id into v_notification_id;

  return query select v_payment_id, p_registration_id, v_registration.qr_token, v_notification_id;
end;
$$;


create or replace function public.cancel_registration_with_seat_release(
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
  select id, workshop_id, status into v_registration from registrations where id = p_registration_id for update;
  if not found then raise exception 'REGISTRATION_NOT_FOUND'; end if;
  if v_registration.status <> 'pending_payment'::registration_status then raise exception 'REGISTRATION_NOT_PENDING'; end if;

  insert into payments (registration_id, amount_vnd, status, failure_reason)
  values (p_registration_id, p_amount_vnd, 'failed'::payment_status, p_reason)
  returning id into v_payment_id;

  update registrations set status = 'cancelled'::registration_status, cancelled_reason = p_reason where id = p_registration_id;
  update workshops set seats_remaining = seats_remaining + 1 where id = v_registration.workshop_id and seats_remaining < capacity;

  return query select p_registration_id, v_registration.workshop_id, v_payment_id;
end;
$$;


create or replace function public.expire_pending_registrations()
returns table (workshop_id uuid, released_count integer)
language plpgsql
set search_path = public
as $$
begin
  return query
  with expired as (
    update registrations set status = 'expired'::registration_status
     where status = 'pending_payment'::registration_status and expires_at is not null and expires_at < now()
    returning registrations.workshop_id
  ),
  grouped as (
    select expired.workshop_id as ws_id, count(*)::integer as cnt from expired group by expired.workshop_id
  ),
  bumped as (
    update workshops w set seats_remaining = least(w.capacity, w.seats_remaining + g.cnt)
      from grouped g where w.id = g.ws_id
    returning w.id as ws_id, g.cnt
  )
  select bumped.ws_id, bumped.cnt from bumped;
end;
$$;


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
      from registrations r join profiles p on p.mssv = r.mssv
     where r.workshop_id = p_workshop_id and r.status = 'confirmed'::registration_status
  )
  insert into notifications (user_id, registration_id, title, body, status)
  select user_id, registration_id, p_title, p_body, 'pending'::notification_status from affected
  returning id;
end;
$$;


-- ============================================================================
-- 17. FUNCTION PERMISSIONS (service_role only)
-- ============================================================================
revoke all on function public.create_registration_with_outbox(text, uuid, uuid)                   from public, anon, authenticated;
revoke all on function public.confirm_registration_payment_with_outbox(uuid, uuid, integer, text)  from public, anon, authenticated;
revoke all on function public.cancel_registration_with_seat_release(uuid, integer, text)           from public, anon, authenticated;
revoke all on function public.expire_pending_registrations()                                       from public, anon, authenticated;
revoke all on function public.notify_workshop_change(uuid, text, text)                            from public, anon, authenticated;

grant execute on function public.create_registration_with_outbox(text, uuid, uuid)                   to service_role;
grant execute on function public.confirm_registration_payment_with_outbox(uuid, uuid, integer, text)  to service_role;
grant execute on function public.cancel_registration_with_seat_release(uuid, integer, text)           to service_role;
grant execute on function public.expire_pending_registrations()                                       to service_role;
grant execute on function public.notify_workshop_change(uuid, text, text)                            to service_role;


-- ============================================================================
-- 18. STORAGE — bucket workshop-assets (organizer upload)
-- ----------------------------------------------------------------------------
-- Clone DB cần có bucket + policies để upload ảnh bìa/sơ đồ phòng hoạt động
-- ngay sau khi chạy schema.
-- ============================================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('workshop-assets', 'workshop-assets', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;

drop policy if exists "workshop_assets_read_public" on storage.objects;
create policy "workshop_assets_read_public" on storage.objects
  for select using (bucket_id = 'workshop-assets');

drop policy if exists "workshop_assets_insert_organizer" on storage.objects;
create policy "workshop_assets_insert_organizer" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'workshop-assets'
    and exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'organizer')
  );

drop policy if exists "workshop_assets_update_organizer" on storage.objects;
create policy "workshop_assets_update_organizer" on storage.objects
  for update to authenticated
  using (bucket_id = 'workshop-assets' and exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'organizer'))
  with check (bucket_id = 'workshop-assets' and exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'organizer'));

drop policy if exists "workshop_assets_delete_organizer" on storage.objects;
create policy "workshop_assets_delete_organizer" on storage.objects
  for delete to authenticated
  using (bucket_id = 'workshop-assets' and exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.role = 'organizer'));


-- ============================================================================
-- 19. SEED AUTH ACCOUNTS — admin/staff only
-- ----------------------------------------------------------------------------
-- Idempotent seed cho DB fresh. Nếu user đã tồn tại theo email, cập nhật lại
-- mật khẩu/profile thay vì tạo trùng auth.users.
-- ============================================================================
do $$
declare
  v_admin_id uuid;
  v_staff_id uuid;
  v_now timestamptz := now();
begin
  select id into v_admin_id from auth.users where lower(email) = 'admin@unihub';
  if v_admin_id is null then
    v_admin_id := '11111111-1111-4111-8111-111111111111'::uuid;
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      v_admin_id,
      'authenticated',
      'authenticated',
      'admin@unihub',
      crypt('123', gen_salt('bf')),
      v_now,
      v_now,
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"account":"admin","display_name":"Ban tổ chức","email_verified":true}'::jsonb,
      v_now,
      v_now,
      '',
      '',
      '',
      ''
    );
  else
    update auth.users
       set encrypted_password = crypt('123', gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, v_now),
           raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
           raw_user_meta_data = '{"account":"admin","display_name":"Ban tổ chức","email_verified":true}'::jsonb,
           updated_at = v_now
     where id = v_admin_id;
  end if;

  insert into auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1',
    v_admin_id,
    v_admin_id::text,
    jsonb_build_object('sub', v_admin_id::text, 'email', 'admin@unihub', 'email_verified', true),
    'email',
    v_now,
    v_now,
    v_now
  )
  on conflict (provider_id, provider) do update
    set user_id = excluded.user_id,
        identity_data = excluded.identity_data,
        updated_at = excluded.updated_at;

  insert into public.profiles (id, role, mssv, display_name, must_change_password)
  values (v_admin_id, 'organizer'::user_role, null, 'Ban tổ chức', false)
  on conflict (id) do update
    set role = excluded.role,
        mssv = excluded.mssv,
        display_name = excluded.display_name,
        must_change_password = excluded.must_change_password;

  select id into v_staff_id from auth.users where lower(email) = 'staff@unihub';
  if v_staff_id is null then
    v_staff_id := '22222222-2222-4222-8222-222222222222'::uuid;
    insert into auth.users (
      instance_id,
      id,
      aud,
      role,
      email,
      encrypted_password,
      email_confirmed_at,
      last_sign_in_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    )
    values (
      '00000000-0000-0000-0000-000000000000',
      v_staff_id,
      'authenticated',
      'authenticated',
      'staff@unihub',
      crypt('123', gen_salt('bf')),
      v_now,
      v_now,
      '{"provider":"email","providers":["email"]}'::jsonb,
      '{"account":"staff","display_name":"Nhân sự check-in","email_verified":true}'::jsonb,
      v_now,
      v_now,
      '',
      '',
      '',
      ''
    );
  else
    update auth.users
       set encrypted_password = crypt('123', gen_salt('bf')),
           email_confirmed_at = coalesce(email_confirmed_at, v_now),
           raw_app_meta_data = '{"provider":"email","providers":["email"]}'::jsonb,
           raw_user_meta_data = '{"account":"staff","display_name":"Nhân sự check-in","email_verified":true}'::jsonb,
           updated_at = v_now
     where id = v_staff_id;
  end if;

  insert into auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2',
    v_staff_id,
    v_staff_id::text,
    jsonb_build_object('sub', v_staff_id::text, 'email', 'staff@unihub', 'email_verified', true),
    'email',
    v_now,
    v_now,
    v_now
  )
  on conflict (provider_id, provider) do update
    set user_id = excluded.user_id,
        identity_data = excluded.identity_data,
        updated_at = excluded.updated_at;

  insert into public.profiles (id, role, mssv, display_name, must_change_password)
  values (v_staff_id, 'staff'::user_role, null, 'Nhân sự check-in', false)
  on conflict (id) do update
    set role = excluded.role,
        mssv = excluded.mssv,
        display_name = excluded.display_name,
        must_change_password = excluded.must_change_password;
end $$;


-- ============================================================================
-- 20. AI SUMMARY STATUS
-- ============================================================================
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
