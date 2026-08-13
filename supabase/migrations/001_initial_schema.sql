-- ============================================================
-- elmo's Production — Initial schema
-- Run in Supabase SQL editor (or `supabase db push` if using CLI).
-- ============================================================

-- Enable UUID generator (Supabase already has pgcrypto enabled, but be explicit)
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- Enumerated types
-- ------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'role_enum') then
    create type role_enum as enum ('boss', 'manager', 'worker');
  end if;
  if not exists (select 1 from pg_type where typname = 'department_enum') then
    create type department_enum as enum ('steel', 'wood', 'upholstery', 'dispatch');
  end if;
  if not exists (select 1 from pg_type where typname = 'order_status_enum') then
    create type order_status_enum as enum ('pending', 'in_progress', 'completed');
  end if;
  if not exists (select 1 from pg_type where typname = 'schedule_status_enum') then
    create type schedule_status_enum as enum ('queued', 'working', 'paused', 'completed');
  end if;
end$$;

-- ------------------------------------------------------------
-- Employees
-- ------------------------------------------------------------
create table if not exists employees (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  role         role_enum not null default 'worker',
  pin_hash     text,                       -- store a hash of the 4-digit PIN, never plaintext
  departments  department_enum[] not null default '{}',
  active       boolean not null default true,
  created_at   timestamptz not null default now()
);

create index if not exists employees_role_idx on employees (role);
create index if not exists employees_active_idx on employees (active);

-- ------------------------------------------------------------
-- Customers
-- ------------------------------------------------------------
create table if not exists customers (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,        -- short code used in orders.customer_code
  name        text not null,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index if not exists customers_active_idx on customers (active);

-- ------------------------------------------------------------
-- Machines
-- ------------------------------------------------------------
create table if not exists machines (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,
  department      department_enum not null,
  setup_time_min  integer not null default 0 check (setup_time_min >= 0),
  is_bottleneck   boolean not null default false,
  active          boolean not null default true,
  created_at      timestamptz not null default now()
);

create unique index if not exists machines_name_dept_uniq on machines (department, name);
create index if not exists machines_active_idx on machines (active);

-- ------------------------------------------------------------
-- Products
-- ------------------------------------------------------------
-- NOTE: "group" is a SQL reserved word, so this column must always be quoted as "group".
-- If you'd rather avoid the quoting headache, rename to product_group in your app code.
create table if not exists products (
  id                uuid primary key default gen_random_uuid(),
  code              text not null unique,
  description       text not null,
  "group"           text,
  department        department_enum not null,
  default_priority  integer not null default 5 check (default_priority between 1 and 9),
  created_at        timestamptz not null default now()
);

create index if not exists products_department_idx on products (department);

-- ------------------------------------------------------------
-- Parts (per product)
-- ------------------------------------------------------------
create table if not exists parts (
  id              uuid primary key default gen_random_uuid(),
  product_id      uuid not null references products (id) on delete cascade,
  name            text not null,
  qty_per_unit    numeric(10,3) not null default 1 check (qty_per_unit > 0),
  length          numeric(10,2),             -- mm
  width           numeric(10,2),             -- mm
  thickness       numeric(10,2),             -- mm
  material_code   text,
  process_code    text,
  created_at      timestamptz not null default now()
);

create index if not exists parts_product_idx on parts (product_id);

-- ------------------------------------------------------------
-- Machine steps (routing per part)
-- ------------------------------------------------------------
create table if not exists machine_steps (
  id                 uuid primary key default gen_random_uuid(),
  part_id            uuid not null references parts (id) on delete cascade,
  sequence           integer not null check (sequence >= 1),
  machine_name       text not null,             -- denormalised label; real machine FK resolved at runtime
  seconds_per_part   numeric(10,2) not null default 0 check (seconds_per_part >= 0),
  setup_time         integer not null default 0 check (setup_time >= 0),  -- minutes
  created_at         timestamptz not null default now(),
  unique (part_id, sequence)
);

create index if not exists machine_steps_part_idx on machine_steps (part_id);

-- ------------------------------------------------------------
-- Orders
-- ------------------------------------------------------------
-- "group" is reserved — quoted column, same caveat as products."group".
create table if not exists orders (
  id              uuid primary key default gen_random_uuid(),
  kwitasie_nr     text not null unique,
  qty             integer not null check (qty > 0),
  product_code    text not null references products (code) on update cascade,
  description     text,
  customer_code   text not null references customers (code) on update cascade,
  ord_nr          text,
  "group"         text,
  prod_week       integer check (prod_week between 1 and 53),
  prod_day        integer check (prod_day between 1 and 7),
  send_week       integer check (send_week between 1 and 53),
  send_day        integer check (send_day between 1 and 7),
  wood_type       text,
  notes           text,
  status          order_status_enum not null default 'pending',
  created_at      timestamptz not null default now()
);

create index if not exists orders_status_idx on orders (status);
create index if not exists orders_customer_idx on orders (customer_code);
create index if not exists orders_product_idx on orders (product_code);
create index if not exists orders_prod_week_idx on orders (prod_week, prod_day);
create index if not exists orders_send_week_idx on orders (send_week, send_day);

-- ------------------------------------------------------------
-- Schedule (machine queue)
-- ------------------------------------------------------------
create table if not exists schedule (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders (id) on delete cascade,
  machine_id      uuid not null references machines (id) on delete restrict,
  scheduled_date  date not null,
  position        integer not null default 0,                  -- ordering within the machine's queue for that date
  status          schedule_status_enum not null default 'queued',
  started_at      timestamptz,
  completed_at    timestamptz,
  created_at      timestamptz not null default now(),
  unique (machine_id, scheduled_date, position)
);

create index if not exists schedule_order_idx on schedule (order_id);
create index if not exists schedule_machine_date_idx on schedule (machine_id, scheduled_date);
create index if not exists schedule_status_idx on schedule (status);

-- ============================================================
-- Row-Level Security (RLS)
-- ============================================================
-- RLS is OFF for these tables in this migration so the anon key can read/write
-- during development. BEFORE going to production, enable RLS on every table
-- and add policies that match your auth model:
--   alter table employees enable row level security;
--   create policy "read for authenticated"  on employees for select to authenticated using (true);
--   create policy "write for boss only"     on employees for all    to authenticated using (...);
-- Repeat per table.
