-- Migration 015: parts.department
--
-- Adds a department column to parts so a single product can span multiple
-- departments (a coffee table with a steel base AND a wood top). The
-- ProductForm uses this to render department tabs — each part is owned by
-- exactly one tab. Before this migration, a product's department drove
-- everything; now the product's department is just one of many depts the
-- product touches, derived from its parts.
--
-- Backfill strategy (mirrors what the UI already does today to draw
-- WOOD/STEEL section headers in ProductCard):
--   1. First machine_step's machine.department.
--   2. Fall back to the product's own department.
--   3. Final safety net — any still-NULL parts get 'wood' so the NOT NULL-on-
--      write code path in saveProduct.js never trips on a legacy row.
--
-- The column is left nullable so the migration can't half-fail on a freak
-- edge case; app save code always sets it.

alter table parts
  add column if not exists department department_enum;

-- 1. First step's machine department
update parts pt
set department = m.department
from (
  select distinct on (ms.part_id)
         ms.part_id,
         mach.department
  from machine_steps ms
  join machines mach on mach.name = ms.machine_name
  order by ms.part_id, ms.sequence asc
) m
where pt.id = m.part_id
  and pt.department is null;

-- 2. Fall back to product's department
update parts pt
set department = p.department
from products p
where pt.product_id = p.id
  and pt.department is null
  and p.department is not null;

-- 3. Safety net — any still-NULL parts get 'wood' (the most common dept)
update parts
set department = 'wood'
where department is null;

create index if not exists parts_department_idx on parts (department);
