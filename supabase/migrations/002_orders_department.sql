-- ============================================================
-- elmo's Production — Add department to orders
-- Run in Supabase SQL editor.
--
-- Adds a nullable department column to orders so each row can be
-- routed independently of products.department. Imported by
-- importOrders() in src/lib/importCSV.js using detectDepartment(),
-- which maps the CSV Group column → enum value.
--
-- Existing rows will be NULL until the next CSV re-import backfills them.
-- ============================================================

alter table orders
  add column if not exists department department_enum;

create index if not exists orders_department_idx on orders (department);
