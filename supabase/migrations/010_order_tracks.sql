-- Two-track scheduling: per-(order, department) start dates + bottleneck
--
-- Phase 1 computed per-track values live from cached routing. Phase 2 persists
-- them so:
--   • the scheduler writes a real start date per side (steel base + wood top
--     of a coffee table get their own prod_week walking back from the same
--     dispatch date),
--   • status can be tracked per side (steel done while wood still in
--     progress) without conflating the order's overall status,
--   • Dispatch can decide "both sides ready" before letting the order ship.
--
-- The existing orders.prod_week / orders.prod_day stays populated for
-- backwards compatibility — we mirror the EARLIEST track's start to it so
-- screens that haven't been migrated still see a sensible value.

create table if not exists order_tracks (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  department      department_enum not null,
  prod_week       integer check (prod_week between 1 and 53),
  prod_day        integer check (prod_day between 1 and 7),
  bottleneck      text,
  total_minutes   integer,
  work_days       integer,
  status          order_status_enum not null default 'pending',
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz default now(),
  unique(order_id, department)
);

create index if not exists idx_order_tracks_order
  on order_tracks(order_id);
create index if not exists idx_order_tracks_dept_week
  on order_tracks(department, prod_week);
create index if not exists idx_order_tracks_status
  on order_tracks(status) where status <> 'completed';
