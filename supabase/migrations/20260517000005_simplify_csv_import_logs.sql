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
