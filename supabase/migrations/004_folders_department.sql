-- ============================================================
-- Migration 004 — Folders are now department-scoped.
--
-- Adds:
--   - folders.department      department_enum (nullable, backfilled below)
--   - unique (department, name)  so "Tables" can exist in both Steel & Wood
--   - drops the old global unique on folders.name
--
-- Backfill: each existing folder gets the most common department of its
-- products. Folders with no products stay NULL and surface in the Folders
-- manager so the user can assign a dept.
-- ============================================================

alter table folders add column if not exists department department_enum;

-- Pick the majority dept per folder (window function: row_number() over the
-- (folder_id, department) counts, partitioned by folder, ordered desc — rn=1
-- is the most common dept for that folder). Only updates folders that don't
-- already have a department, so the migration is safe to re-run.
with folder_dept_counts as (
  select
    folder_id,
    department,
    row_number() over (partition by folder_id order by count(*) desc) as rn
  from products
  where folder_id is not null
  group by folder_id, department
)
update folders f
set department = sub.department
from folder_dept_counts sub
where f.id = sub.folder_id and sub.rn = 1 and f.department is null;

-- Swap the unique constraint: name was globally unique, now (department, name)
-- so "Tables" can live in Steel and Wood simultaneously.
alter table folders drop constraint if exists folders_name_key;
create unique index if not exists folders_dept_name_uniq on folders (department, name);
create index if not exists folders_department_idx on folders (department);
