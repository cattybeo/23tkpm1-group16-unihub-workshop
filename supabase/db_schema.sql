-- =============================================================================
-- ⚠️  HARD RESET — bỏ comment block này để xóa sạch toàn bộ DB
-- =============================================================================

drop policy if exists workshops_read_public   on workshops;
drop policy if exists profiles_read_self      on profiles;
drop policy if exists profiles_update_self    on profiles;

drop table if exists notifications     cascade;
drop table if exists check_ins         cascade;
drop table if exists idempotency_keys  cascade;
drop table if exists payments          cascade;
drop table if exists registrations     cascade;
drop table if exists workshops         cascade;
drop table if exists profiles          cascade;
drop table if exists students          cascade;

drop type if exists check_in_source    cascade;
drop type if exists notification_status cascade;
drop type if exists payment_status     cascade;
drop type if exists registration_status cascade;
drop type if exists user_role          cascade;

drop function if exists set_updated_at cascade;
drop function if exists public.create_registration_with_outbox(text, uuid, uuid) cascade;
drop function if exists public.confirm_registration_payment_with_outbox(uuid, uuid, integer, text) cascade;
drop function if exists public.cancel_registration_with_seat_release(uuid, integer, text) cascade;
drop function if exists public.expire_pending_registrations() cascade;

-- ⚠️  Storage KHÔNG xóa được bằng SQL (Supabase chặn).
-- Xóa bucket thủ công: Dashboard → Storage → workshop-assets → Delete bucket

-- =============================================================================

-- =============================================================================
-- UNIHUB WORKSHOP — FULL SYSTEM SCHEMA (single source of truth)
-- -----------------------------------------------------------------------------
-- File này là toàn bộ schema của hệ thống, IDEMPOTENT:
--   - Chạy lần đầu (DB fresh)  → tạo mới mọi thứ
--   - Chạy lại trên DB cũ      → chỉ thêm phần thiếu, không lỗi
--
-- Bao gồm:
--   1. Extensions
--   2. Enums
--   3. Trigger function (set_updated_at)
--   4. 8 bảng: students, profiles, workshops, registrations, payments,
--              idempotency_keys, check_ins, notifications
--   5. Triggers
--   6. Indexes (5 query nóng MVP)
--   7. Row Level Security + policies
--   8. Storage bucket: workshop-assets + Storage policies
-- =============================================================================


-- ============================================================================
-- 1. EXTENSIONS
-- ============================================================================
create extension if not exists "pgcrypto";  -- gen_random_uuid()


-- ============================================================================
-- 2. ENUMS — bọc DO block để idempotent (CREATE TYPE không có IF NOT EXISTS)
-- ============================================================================
do $$ begin
  create type user_role as enum ('student', 'organizer', 'staff');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type registration_status as enum (
    'pending_payment',  -- vừa giữ chỗ, chờ thanh toán (TTL 15 phút)
    'confirmed',        -- đã thanh toán (hoặc miễn phí) — QR đã phát hành
    'cancelled',        -- sinh viên huỷ thủ công
    'expired'           -- không thanh toán trong TTL → cron release seat
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type payment_status as enum ('pending', 'succeeded', 'failed', 'refunded');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type check_in_source as enum ('online', 'offline');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type notification_status as enum ('pending', 'in_progress', 'sent', 'failed');
exception when duplicate_object then null;
end $$;


-- ============================================================================
-- 3. TRIGGER FUNCTION — tự động cập nhật updated_at
-- ============================================================================
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;


-- ============================================================================
-- BẢNG 1: students — whitelist từ CSV nightly
-- ----------------------------------------------------------------------------
-- mssv (MSSV của trường) làm PRIMARY KEY luôn — không cần UUID surrogate.
-- Lý do: MSSV stable, unique, đọc data debug dễ hơn UUID.
--
-- Logic upsert (ADR-001 Batch Sequential):
--   - Có trong CSV, không trong DB → INSERT, is_active=true
--   - Có trong DB, không trong CSV → UPDATE is_active=false (soft deactivate)
--   - Có cả 2, full_name khác       → UPDATE full_name
-- ============================================================================
create table if not exists students (
  mssv            text primary key,
  full_name       text not null,
  is_active       boolean not null default true,
  last_synced_at  timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  constraint students_mssv_format check (mssv ~ '^[A-Za-z0-9]{6,20}$')
);

drop trigger if exists students_set_updated_at on students;
create trigger students_set_updated_at
  before update on students
  for each row execute function set_updated_at();

comment on table students is
  'Whitelist sinh viên hợp lệ. Nguồn: CSV nightly. Backend ghi qua service_role.';
comment on column students.mssv is
  'MSSV — mã định danh của trường, làm PK luôn.';


-- ============================================================================
-- BẢNG 2: profiles — extend auth.users của Supabase
-- ----------------------------------------------------------------------------
-- auth.users (builtin của Supabase Auth) lưu credential.
-- profiles thêm role + link tới students (cho sinh viên) hoặc NULL (cho staff).
--
-- must_change_password = true: lần đầu đăng nhập với mật khẩu default '123'
-- → AuthGuard ở FE bắt buộc redirect đến /change-password.
-- ============================================================================
create table if not exists profiles (
  id                   uuid primary key references auth.users(id) on delete cascade,
  role                 user_role not null default 'student',
  mssv                 text references students(mssv) on delete restrict,
  display_name         text not null,
  phone                text,
  must_change_password boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),

  -- Sinh viên BẮT BUỘC link tới students. Organizer/staff thì mssv NULL.
  constraint profiles_role_mssv_link check (
    (role = 'student' and mssv is not null) or
    (role <> 'student' and mssv is null)
  ),
  constraint profiles_mssv_unique unique (mssv)
);

-- Migration cho DB đã tồn tại từ trước (chưa có must_change_password)
alter table profiles
  add column if not exists must_change_password boolean not null default false;

drop trigger if exists profiles_set_updated_at on profiles;
create trigger profiles_set_updated_at
  before update on profiles
  for each row execute function set_updated_at();

comment on column profiles.must_change_password is
  'true = lần đầu đăng nhập, bắt buộc đổi mật khẩu default (123) trước khi dùng app.';


-- ============================================================================
-- BẢNG 3: workshops — đã gộp 2 cột AI summary + 2 cột asset URL vào đây
-- ----------------------------------------------------------------------------
-- cover_image_url + room_map_url: ảnh upload qua bucket workshop-assets.
-- ============================================================================
create table if not exists workshops (
  id                     uuid primary key default gen_random_uuid(),
  title                  text not null,
  description            text,
  speaker_name           text not null,
  speaker_bio            text,
  room                   text not null,
  cover_image_url        text,                          -- ảnh bìa workshop (bucket workshop-assets)
  room_map_url           text,                          -- ảnh sơ đồ phòng (bucket workshop-assets)
  start_time             timestamptz not null,
  end_time               timestamptz not null,
  capacity               integer  not null,
  seats_remaining        integer  not null,
  fee_vnd                integer  not null default 0,
  pdf_url                text,                          -- file PDF mô tả workshop
  summary_md             text,                          -- AI summary
  summary_generated_at   timestamptz,                   -- thời điểm gen summary
  is_published           boolean  not null default false,
  cancelled_at           timestamptz,                   -- không null = đã huỷ
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint workshops_capacity_positive check (capacity > 0),
  constraint workshops_seats_range       check (seats_remaining >= 0 and seats_remaining <= capacity),
  constraint workshops_time_order        check (end_time > start_time),
  constraint workshops_fee_nonneg        check (fee_vnd >= 0)
);

-- Migration cho DB đã tồn tại (chưa có cover_image_url)
alter table workshops
  add column if not exists cover_image_url text;
alter table workshops
  add column if not exists room_map_url text;
alter table workshops
  drop column if exists created_by;

drop trigger if exists workshops_set_updated_at on workshops;
create trigger workshops_set_updated_at
  before update on workshops
  for each row execute function set_updated_at();

comment on column workshops.cover_image_url is
  'URL ảnh bìa workshop trên Supabase Storage (bucket: workshop-assets). NULL nếu chưa upload.';
comment on column workshops.room_map_url is
  'URL ảnh sơ đồ phòng học trên Supabase Storage (bucket: workshop-assets). NULL nếu chưa upload.';
comment on column workshops.seats_remaining is
  'Giảm trong cùng transaction với INSERT registration (SELECT FOR UPDATE — ADR-004).';
comment on column workshops.summary_md is
  'AI tóm tắt PDF workshop. NULL nếu chưa generate. Regenerate = UPDATE.';


-- ============================================================================
-- BẢNG 4: registrations
-- ============================================================================
create table if not exists registrations (
  id                uuid primary key default gen_random_uuid(),
  mssv              text not null references students(mssv) on delete restrict,
  workshop_id       uuid not null references workshops(id)  on delete restrict,
  status            registration_status not null default 'pending_payment',
  qr_token          text,
  expires_at        timestamptz,
  cancelled_reason  text,
  confirmed_at      timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  -- Cho phép đăng ký lại sau khi cancel/expired, nhưng KHÔNG 2 record cùng active.
  constraint registrations_unique_active
    exclude using btree (mssv with =, workshop_id with =)
    where (status in ('pending_payment', 'confirmed'))
);

drop trigger if exists registrations_set_updated_at on registrations;
create trigger registrations_set_updated_at
  before update on registrations
  for each row execute function set_updated_at();


-- ============================================================================
-- BẢNG 5: payments — tách khỏi registrations vì 1 reg có thể nhiều attempt
--                     (circuit breaker open rồi close, ADR-007)
-- ============================================================================
create table if not exists payments (
  id                uuid primary key default gen_random_uuid(),
  registration_id   uuid not null references registrations(id) on delete restrict,
  amount_vnd        integer not null,
  status            payment_status not null default 'pending',
  gateway_ref       text,
  failure_reason    text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint payments_amount_positive check (amount_vnd > 0)
);

drop trigger if exists payments_set_updated_at on payments;
create trigger payments_set_updated_at
  before update on payments
  for each row execute function set_updated_at();


-- ============================================================================
-- BẢNG 6: idempotency_keys (ADR-008) — chống trừ tiền 2 lần
-- ----------------------------------------------------------------------------
-- TTL 24h xử lý ở application: WHERE created_at > now() - interval '24 hours'.
-- ============================================================================
create table if not exists idempotency_keys (
  key         text not null,
  endpoint    text not null,
  user_id     uuid references profiles(id) on delete set null,
  response    jsonb not null,
  created_at  timestamptz not null default now(),

  constraint idempotency_keys_pkey primary key (key, endpoint)
);

alter table idempotency_keys
  drop constraint if exists idempotency_keys_pkey;
alter table idempotency_keys
  add constraint idempotency_keys_pkey primary key (key, endpoint);


-- ============================================================================
-- BẢNG 7: check_ins
-- ----------------------------------------------------------------------------
-- UNIQUE(registration_id) đảm bảo idempotent: nếu offline sync gửi trùng,
-- DB tự reject (PG 23505) → client nhận 409 Conflict.
-- ============================================================================
create table if not exists check_ins (
  id                uuid primary key default gen_random_uuid(),
  registration_id   uuid not null references registrations(id) on delete restrict,
  staff_user_id     uuid not null references profiles(id)      on delete restrict,
  source            check_in_source not null,
  checked_in_at     timestamptz not null default now(),

  constraint check_ins_registration_unique unique (registration_id)
);


-- ============================================================================
-- BẢNG 8: notifications — IN-APP OUTBOX + EMAIL MOCK DISPATCH
-- ----------------------------------------------------------------------------
-- Email gửi qua adapter (console.log mock cho MVP), trạng thái outbox lưu tại đây.
-- ============================================================================
create table if not exists notifications (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references profiles(id) on delete cascade,
  registration_id   uuid references registrations(id) on delete cascade,
  title             text not null,
  body              text not null,
  status            notification_status not null default 'pending',
  retry_count       integer not null default 0,
  last_error        text,
  read_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint notifications_retry_count_non_negative check (retry_count >= 0)
);

drop trigger if exists notifications_set_updated_at on notifications;
create trigger notifications_set_updated_at
  before update on notifications
  for each row execute function set_updated_at();


-- ============================================================================
-- INDEXES — 5, trace về query nóng MVP
-- ============================================================================
-- "Workshop công khai sắp diễn ra": trang chủ student, lọc theo time
create index if not exists workshops_published_start_idx
  on workshops (start_time)
  where is_published = true and cancelled_at is null;

-- "Đăng ký của tôi" + count theo workshop
create index if not exists registrations_mssv_status_idx     on registrations (mssv, status);
create index if not exists registrations_workshop_status_idx on registrations (workshop_id, status);

-- Cron release seat hết TTL
create index if not exists registrations_expires_idx
  on registrations (expires_at)
  where status = 'pending_payment';

-- JOIN payment ↔ registration (FK không tự tạo index trên PG)
create index if not exists payments_registration_idx on payments (registration_id);

-- Notification dropdown + retry worker
create index if not exists notifications_user_created_idx
  on notifications (user_id, created_at desc);

create index if not exists notifications_retry_idx
  on notifications (status, updated_at)
  where status in ('pending', 'failed', 'in_progress') and retry_count < 3;


-- ============================================================================
-- RPC HELPERS — transactional registration/payment + notification outbox
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


-- ----------------------------------------------------------------------------
-- Seat release RPCs (spec blueprint/specs/seat-reservation.md)
--   - cancel_registration_with_seat_release: compensating action khi payment
--     business-fail (card declined). Atomic: payments insert + reg cancel + seat+1.
--   - expire_pending_registrations: cron 60s. Bulk-flip pending_payment quá TTL
--     thành expired + restore seats per workshop trong 1 CTE.
-- CLAUDE.md hard rule #3: KHÔNG SELECT-rồi-UPDATE thủ công cho seat.
-- ----------------------------------------------------------------------------
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
  -- Lock the registration row to serialize concurrent webhook / retry calls
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

create or replace function public.expire_pending_registrations()
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


-- ============================================================================
-- ROW LEVEL SECURITY (RLS) — minimal
-- ----------------------------------------------------------------------------
-- Triết lý:
--   - Bật RLS trên MỌI bảng (Supabase best practice).
--   - Chỉ tạo POLICY cho bảng FE truy cập trực tiếp qua Supabase JS:
--       workshops (Realtime broadcast seats_remaining)
--       profiles  (FE lấy display_name + must_change_password của user)
--   - Các bảng khác: ENABLE RLS + 0 policy = deny all qua anon/auth.
--     Backend Express dùng SUPABASE_SERVICE_ROLE_KEY để bypass.
-- ============================================================================

alter table workshops         enable row level security;
alter table profiles          enable row level security;
alter table students          enable row level security;
alter table registrations     enable row level security;
alter table payments          enable row level security;
alter table idempotency_keys  enable row level security;
alter table check_ins         enable row level security;
alter table notifications     enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select on workshops to anon, authenticated;
grant select, update on profiles to authenticated;
grant all on students, profiles, workshops, registrations, payments,
  idempotency_keys, check_ins, notifications to service_role;
revoke all on function public.create_registration_with_outbox(text, uuid, uuid) from public, anon, authenticated;
revoke all on function public.confirm_registration_payment_with_outbox(uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.cancel_registration_with_seat_release(uuid, integer, text) from public, anon, authenticated;
revoke all on function public.expire_pending_registrations() from public, anon, authenticated;
grant execute on function public.create_registration_with_outbox(text, uuid, uuid) to service_role;
grant execute on function public.confirm_registration_payment_with_outbox(uuid, uuid, integer, text) to service_role;
grant execute on function public.cancel_registration_with_seat_release(uuid, integer, text) to service_role;
grant execute on function public.expire_pending_registrations() to service_role;

-- workshops: public read khi published
drop policy if exists workshops_read_public on workshops;
create policy workshops_read_public on workshops
  for select
  to anon, authenticated
  using (is_published = true and cancelled_at is null);

-- profiles: user đọc/sửa chính mình
drop policy if exists profiles_read_self on profiles;
create policy profiles_read_self on profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

create table if not exists csv_import_logs (
  id uuid primary key default gen_random_uuid(),
  source_file text,
  source_date date,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'completed', 'failed', 'skipped')),
  total_count integer not null default 0 check (total_count >= 0),
  valid_count integer not null default 0 check (valid_count >= 0),
  created_count integer not null default 0 check (created_count >= 0),
  updated_count integer not null default 0 check (updated_count >= 0),
  deactivated_count integer not null default 0 check (deactivated_count >= 0),
  skipped_count integer not null default 0 check (skipped_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  errors jsonb not null default '[]'::jsonb,
  message text,
  created_at timestamptz not null default now()
);

create index if not exists csv_import_logs_started_at_idx
  on csv_import_logs (started_at desc);

create unique index if not exists csv_import_logs_completed_source_file_idx
  on csv_import_logs (source_file)
  where source_file is not null and status = 'completed';

alter table if exists csv_import_logs enable row level security;

grant all on csv_import_logs to service_role;

comment on table csv_import_logs is
  'Audit log cho CSV nightly student import. Backend ghi qua service_role; không expose trực tiếp cho FE.';

alter table if exists csv_import_logs
  add column if not exists imported_at timestamptz,
  add column if not exists imported_count integer;

update csv_import_logs
set
  imported_at = coalesce(imported_at, finished_at, started_at, created_at, now()),
  imported_count = coalesce(imported_count, valid_count, 0)
where imported_at is null or imported_count is null;

alter table if exists csv_import_logs
  alter column imported_at set default now(),
  alter column imported_at set not null,
  alter column imported_count set default 0,
  alter column imported_count set not null;

alter table if exists csv_import_logs
  drop column if exists source_date,
  drop column if exists started_at,
  drop column if exists finished_at,
  drop column if exists total_count,
  drop column if exists valid_count,
  drop column if exists created_count,
  drop column if exists updated_count,
  drop column if exists deactivated_count,
  drop column if exists skipped_count,
  drop column if exists error_count,
  drop column if exists errors;

drop index if exists csv_import_logs_started_at_idx;

create index if not exists csv_import_logs_imported_at_idx
  on csv_import_logs (imported_at desc);

drop index if exists csv_import_logs_completed_source_file_idx;

create unique index if not exists csv_import_logs_completed_source_file_idx
  on csv_import_logs (source_file)
  where source_file is not null and status = 'completed';

alter table if exists csv_import_logs enable row level security;
grant all on csv_import_logs to service_role;

drop policy if exists "workshop_assets_insert_organizer" on storage.objects;
drop policy if exists "workshop_assets_update_organizer" on storage.objects;
drop policy if exists "workshop_assets_delete_organizer" on storage.objects;

create policy "workshop_assets_insert_organizer"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'workshop-assets'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'organizer'
    )
  );

create policy "workshop_assets_update_organizer"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'workshop-assets'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'organizer'
    )
  )
  with check (
    bucket_id = 'workshop-assets'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'organizer'
    )
  );

create policy "workshop_assets_delete_organizer"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'workshop-assets'
    and exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'organizer'
    )
  );

-- ============================================================================
-- STORAGE — bucket workshop-assets (cover image + room map)
-- ----------------------------------------------------------------------------
-- ⚠️  Block dưới ĐÃ COMMENT lại:
-- Supabase chặn xoá bucket bằng SQL, mỗi lần re-run schema sẽ phải vào Dashboard
-- → Storage → workshop-assets → Delete thủ công. Để tránh phiền hà, bucket + policy
-- chỉ chạy MỘT LẦN khi khởi tạo project (uncomment, chạy, rồi comment lại).
-- Mọi thay đổi schema khác vẫn drop/recreate bình thường.
--
-- Public bucket, 5 MB, chỉ image/jpeg, image/png, image/webp.
-- Path convention: {workshop_id}/cover.{ext}, {workshop_id}/room-map.{ext}.
-- Quyền upload enforce theo role organizer; không có ownership theo workshop.
-- ============================================================================
/*
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'workshop-assets',
  'workshop-assets',
  true,
  5242880,   -- 5 MB
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

drop policy if exists "workshop_assets_read_public"      on storage.objects;
drop policy if exists "workshop_assets_insert_organizer" on storage.objects;
drop policy if exists "workshop_assets_update_organizer" on storage.objects;
drop policy if exists "workshop_assets_delete_organizer" on storage.objects;

-- Ai cũng đọc được ảnh (public bucket)
create policy "workshop_assets_read_public"
  on storage.objects for select
  using (bucket_id = 'workshop-assets');

-- Chỉ organizer đã đăng nhập mới upload/sửa/xóa được
create policy "workshop_assets_insert_organizer"
  on storage.objects for insert
  with check (
    bucket_id = 'workshop-assets'
    and auth.role() = 'authenticated'
    and exists (
      select 1 from profiles
      where id = auth.uid() and role = 'organizer'
    )
  );

create policy "workshop_assets_update_organizer"
  on storage.objects for update
  using (
    bucket_id = 'workshop-assets'
    and auth.role() = 'authenticated'
    and exists (
      select 1 from profiles
      where id = auth.uid() and role = 'organizer'
    )
  );

create policy "workshop_assets_delete_organizer"
  on storage.objects for delete
  using (
    bucket_id = 'workshop-assets'
    and auth.role() = 'authenticated'
    and exists (
      select 1 from profiles
      where id = auth.uid() and role = 'organizer'
    )
  );
*/

-- ============================================================================
-- BULK NOTIFICATION OUTBOX RPC — workshop change broadcast
-- (đã có trong migration 20260517000008_notify_workshop_change_rpc.sql)
-- ----------------------------------------------------------------------------
-- Dùng khi organizer cancel / đổi giờ / đổi phòng workshop. Insert hàng loạt
-- notification cho mọi registration đang `confirmed`, trả về danh sách id để
-- listener dispatch (in-app + email mock).
-- ============================================================================
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


-- ============================================================================
-- REGISTRATION RPC v2 — bổ sung gate students.is_active
-- (đã có trong migration 20260517000009_register_check_student_active.sql)
-- ----------------------------------------------------------------------------
-- ⚠️  ĐÈ definition phía trên (create or replace).
-- Raise STUDENT_NOT_VERIFIED khi mssv không có trong students hoặc đã bị soft
-- delete (is_active = false) bởi CSV nightly. Phần còn lại giữ nguyên logic
-- atomic seat decrement + outbox notification.
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
  select is_active into v_student_active
    from students
   where mssv = p_mssv;

  if not found or v_student_active is not true then
    raise exception 'STUDENT_NOT_VERIFIED';
  end if;

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


-- ============================================================================
-- NOTIFICATIONS REALTIME — grant SELECT + RLS self-select + publication
-- (đã có trong migration 20260517000010_notifications_realtime_policy.sql)
-- ----------------------------------------------------------------------------
-- FE subscribe Supabase Realtime (`postgres_changes` filter user_id=eq.<self>)
-- để cập nhật chuông thông báo. Block RLS trên `notifications` mặc định
-- deny-all với authenticated; ở đây grant SELECT + policy giới hạn theo
-- user_id, đồng thời add bảng vào publication `supabase_realtime`.
-- ============================================================================
grant select on table notifications to authenticated;

do $$ begin
  create policy notifications_self_select on notifications
    for select to authenticated
    using (user_id = auth.uid());
exception when duplicate_object then null;
end $$;

do $$ begin
  alter publication supabase_realtime add table notifications;
exception when duplicate_object then null;
end $$;


-- =============================================================================
-- KẾT THÚC SCHEMA
-- =============================================================================
-- VERIFY (chạy sau để kiểm tra):
--   select column_name from information_schema.columns
--     where table_name = 'profiles' and column_name = 'must_change_password';
--   select column_name from information_schema.columns
--     where table_name = 'workshops' and column_name = 'cover_image_url';
--   select id, public from storage.buckets where id = 'workshop-assets';
--   select policyname from pg_policies
--     where tablename = 'objects' and schemaname = 'storage'
--       and policyname like 'workshop_assets%';
-- =============================================================================
