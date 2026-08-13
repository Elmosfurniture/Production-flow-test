-- ============================================================
-- Migration 003 — Product folders + form-driven product creation.
--
-- Adds:
--   - folders                 (id, name unique, created_at)
--   - products.folder_id      FK to folders, on delete set null
--   - products.abbreviations  text[] for search aliases ("BTD", "BT Diner")
--   - parts.part_priority     int 1-9, per-part ordering inside a product
--   - parts.is_assembly       bool, flags assembly rows vs raw-cut rows
--
-- Backwards compatible: existing products/parts keep working, new columns
-- default to empty array / 1 / false.
-- ============================================================

create table if not exists folders (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  created_at  timestamptz not null default now()
);

create index if not exists folders_name_idx on folders (name);

alter table products
  add column if not exists folder_id     uuid references folders (id) on delete set null,
  add column if not exists abbreviations text[] not null default '{}';

create index if not exists products_folder_idx on products (folder_id);

alter table parts
  add column if not exists part_priority integer not null default 1 check (part_priority between 1 and 9),
  add column if not exists is_assembly   boolean not null default false;
