-- =============================================================================
-- ⚠️  HARD RESET — bỏ comment block này để xóa sạch toàn bộ DB
-- =============================================================================
/*
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
drop type if exists payment_status     cascade;
drop type if exists registration_status cascade;
drop type if exists user_role          cascade;

drop function if exists set_updated_at cascade;

-- ⚠️  Storage KHÔNG xóa được bằng SQL (Supabase chặn).
-- Xóa bucket thủ công: Dashboard → Storage → workshop-assets → Delete bucket
*/
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
  create type user_role as enum ('student', 'organizer', 'scanner');
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

  -- Sinh viên BẮT BUỘC link tới students. Organizer/scanner thì mssv NULL.
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
-- created_by dùng cho ownership check ở middleware Express:
--   organizer chỉ UPDATE/DELETE workshop có created_by = profiles.id của họ.
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
  created_by             uuid not null references profiles(id) on delete restrict,
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
comment on column workshops.created_by is
  'Ownership: chỉ organizer này được UPDATE/DELETE. Check ở Express middleware.';
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
  key         text primary key,
  endpoint    text not null,
  user_id     uuid references profiles(id) on delete set null,
  response    jsonb not null,
  created_at  timestamptz not null default now()
);


-- ============================================================================
-- BẢNG 7: check_ins
-- ----------------------------------------------------------------------------
-- UNIQUE(registration_id) đảm bảo idempotent: nếu offline sync gửi trùng,
-- DB tự reject (PG 23505) → client nhận 409 Conflict.
-- ============================================================================
create table if not exists check_ins (
  id                uuid primary key default gen_random_uuid(),
  registration_id   uuid not null references registrations(id) on delete restrict,
  scanner_user_id   uuid not null references profiles(id)      on delete restrict,
  source            check_in_source not null,
  checked_in_at     timestamptz not null default now(),

  constraint check_ins_registration_unique unique (registration_id)
);


-- ============================================================================
-- BẢNG 8: notifications — IN-APP ONLY
-- ----------------------------------------------------------------------------
-- Email gửi qua adapter (console.log mock cho MVP), KHÔNG lưu vào bảng này.
-- ============================================================================
create table if not exists notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  title       text not null,
  body        text not null,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);


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

-- workshops: public read khi published
drop policy if exists workshops_read_public on workshops;
create policy workshops_read_public on workshops
  for select
  using (is_published = true and cancelled_at is null);

-- profiles: user đọc/sửa chính mình
drop policy if exists profiles_read_self on profiles;
create policy profiles_read_self on profiles
  for select using (id = auth.uid());

drop policy if exists profiles_update_self on profiles;
create policy profiles_update_self on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());


-- ============================================================================
-- STORAGE — bucket workshop-assets (cover image + room map)
-- ----------------------------------------------------------------------------
-- Public bucket, 5 MB, chỉ image/jpeg, image/png, image/webp.
-- Path convention: {workshop_id}/cover.{ext}, {workshop_id}/room-map.{ext}.
-- Ownership cấp workshop-level enforce tại Express middleware (requireOwnership),
-- không tại Storage policy — đủ cho MVP.
-- ============================================================================
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
