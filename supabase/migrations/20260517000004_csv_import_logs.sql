create table if not exists csv_import_logs (
  id uuid primary key default gen_random_uuid(),
  source_file text,
  imported_at timestamptz not null default now(),
  imported_count integer not null default 0 check (imported_count >= 0),
  status text not null default 'completed' check (status in ('completed', 'failed')),
  message text,
  created_at timestamptz not null default now()
);

create index if not exists csv_import_logs_imported_at_idx
  on csv_import_logs (imported_at desc);

create unique index if not exists csv_import_logs_completed_source_file_idx
  on csv_import_logs (source_file)
  where source_file is not null and status = 'completed';

alter table if exists csv_import_logs enable row level security;

grant all on csv_import_logs to service_role;

comment on table csv_import_logs is
  'Log tối giản cho CSV nightly student import. Backend ghi qua service_role; không expose trực tiếp cho FE.';
