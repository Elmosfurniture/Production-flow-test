-- ProductionFlow TEST database schema (FLAT + permissive).
-- Built from the columns the app actually reads/writes — NOT the raw migrations
-- (which have drifted from the live DB). No enum types, no data backfills, no
-- create/drop dances: just clean CREATE TABLEs that always run.
--
-- Paste this WHOLE file into the TEST project's SQL Editor and click Run.
-- TEST DB ONLY: the first two lines WIPE the public schema of this project.

drop schema if exists public cascade;
create schema public;
grant usage on schema public to postgres, anon, authenticated, service_role;
grant create on schema public to postgres;

-- ---------- base tables (no inbound foreign keys) ----------
create table employees (
  id           uuid primary key default gen_random_uuid(),
  name         text,
  role         text,
  departments  text[] default '{}',
  pin          text,
  active       boolean default true,
  created_at   timestamptz default now()
);

create table customers (
  id          uuid primary key default gen_random_uuid(),
  code        text unique,
  name        text,
  active      boolean default true,
  created_at  timestamptz default now()
);

create table machines (
  id              uuid primary key default gen_random_uuid(),
  name            text,
  department      text,
  setup_time_min  integer default 0,
  is_bottleneck   boolean default false,
  active          boolean default true,
  display_order   integer default 0,
  rate_per_hour   numeric,
  wood_day        smallint,
  color           text,
  created_at      timestamptz default now()
);

create table folders (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  department  text,
  created_at  timestamptz default now()
);

create table public_holidays (
  id     uuid primary key default gen_random_uuid(),
  date   date unique,
  name   text
);

create table department_settings (
  department   text primary key,
  buffer_days  integer default 3
);

create table messages (
  id           uuid primary key default gen_random_uuid(),
  body         text,
  author_id    uuid,
  author_name  text,
  author_role  text,
  author_dept  text,
  created_at   timestamptz default now()
);

create table push_subscriptions (
  endpoint       text primary key,
  p256dh         text,
  auth           text,
  employee_id    uuid,
  employee_name  text,
  created_at     timestamptz default now()
);

-- ---------- products & routing ----------
create table products (
  id                  uuid primary key default gen_random_uuid(),
  code                text unique,
  description         text,
  "group"             text,
  department          text,
  default_priority    integer default 5,
  folder_id           uuid,
  abbreviations       text[] default '{}',
  is_dispatch_only    boolean default false,
  wood_day_overrides  jsonb default '{}',
  created_at          timestamptz default now()
);

create table parts (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid references products(id) on delete cascade,
  name           text,
  qty_per_unit   numeric default 1,
  length         numeric,
  width          numeric,
  thickness      numeric,
  material_code  text,
  part_priority  integer default 1,
  is_assembly    boolean default false,
  department     text,
  created_at     timestamptz default now()
);

create table machine_steps (
  id                 uuid primary key default gen_random_uuid(),
  part_id            uuid references parts(id) on delete cascade,
  sequence           integer,
  machine_name       text,
  alt_machine_names  text[] default '{}',
  seconds_per_part   numeric default 0,
  setup_time         integer default 0,
  wood_day_offset    smallint,
  created_at         timestamptz default now()
);

-- ---------- orders & scheduling ----------
create table orders (
  id                     uuid primary key default gen_random_uuid(),
  kwitasie_nr            text,
  qty                    integer,
  qty_done               integer,
  status                 text default 'pending',
  product_code           text,
  customer_code          text,
  department             text,
  due_date               date,
  prod_week              integer,
  prod_day               integer,
  send_week              integer,
  send_day               integer,
  description            text,
  priority_rank          integer,
  ord_nr                 text,
  "group"                text,
  wood_type              text,
  notes                  text,
  needs_review           boolean default false,
  original_item_code     text,
  ready_for_dispatch_at  timestamptz,
  shipped_at             timestamptz,
  created_at             timestamptz default now()
);

create table order_tracks (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid references orders(id) on delete cascade,
  department     text,
  prod_week      integer,
  prod_day       integer,
  bottleneck     text,
  total_minutes  integer,
  work_days      integer,
  status         text default 'pending',
  started_at     timestamptz,
  completed_at   timestamptz,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now()
);

create table schedule (
  id               uuid primary key default gen_random_uuid(),
  order_id         uuid references orders(id) on delete cascade,
  machine_id       uuid,
  machine_step_id  uuid,
  scheduled_date   date,
  start_time       time,
  end_time         time,
  position         integer default 0,
  status           text default 'queued',
  includes_setup   boolean default false,
  qty              integer,
  qty_done         integer default 0,
  started_at       timestamptz,
  completed_at     timestamptz,
  created_at       timestamptz default now()
);

-- ---------- allow the anon key full access to every table ----------
-- This Supabase project enforces Row-Level Security, so give each public table
-- a permissive "anon can do anything" policy (dev only — matches how prod's
-- anon key already has full access).
do $$
declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists anon_all on public.%I', t);
    execute format('create policy anon_all on public.%I for all to anon, authenticated using (true) with check (true)', t);
  end loop;
end$$;

-- ---------- anon full access (RLS off, dev) ----------
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
alter default privileges in schema public grant all on tables to anon, authenticated;
alter default privileges in schema public grant all on sequences to anon, authenticated;
