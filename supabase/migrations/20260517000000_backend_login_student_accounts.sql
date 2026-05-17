-- Backend login and student account support.
-- full-guide.md wins over older ownership specs: organizers are a single committee.

alter table if exists workshops
  drop column if exists created_by;

alter table if exists workshops         enable row level security;
alter table if exists profiles          enable row level security;
alter table if exists students          enable row level security;
alter table if exists registrations     enable row level security;
alter table if exists payments          enable row level security;
alter table if exists idempotency_keys  enable row level security;
alter table if exists check_ins         enable row level security;
alter table if exists notifications     enable row level security;

grant usage on schema public to anon, authenticated, service_role;
grant select on workshops to anon, authenticated;
grant select, update on profiles to authenticated;
grant all on students, profiles, workshops, registrations, payments,
  idempotency_keys, check_ins, notifications to service_role;

drop policy if exists workshops_read_public on workshops;
create policy workshops_read_public on workshops
  for select
  to anon, authenticated
  using (is_published = true and cancelled_at is null);

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

alter table if exists idempotency_keys
  drop constraint if exists idempotency_keys_pkey;
alter table if exists idempotency_keys
  add constraint idempotency_keys_pkey primary key (key, endpoint);

comment on table students is
  'Whitelist sinh viên hợp lệ. Nguồn: CSV nightly. Backend ghi qua service_role.';
comment on table profiles is
  'Application profile mapped to auth.users. Role is loaded from this table on every backend request.';
comment on table workshops is
  'Workshop catalog. Organizer access is RBAC-only; no per-workshop ownership enforcement.';
