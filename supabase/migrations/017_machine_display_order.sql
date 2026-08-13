-- Migration 017: machines.display_order
--
-- Lets the user drag-and-drop machines into the order they prefer on the
-- Machines screen; both Machines and Schedule then render in that order.
-- Per-department ordering — the column is global but sorted within each
-- department's filter so positions don't collide visually.
--
-- Backfill: existing rows get an alphabetical ordering as a sensible starting
-- point. Multiples of 10 so the user can drop a row "between 30 and 40" later
-- with a single UPDATE instead of renumbering every neighbour.

alter table machines
  add column if not exists display_order integer not null default 0;

update machines
set display_order = sub.rn
from (
  select id, row_number() over (partition by department order by name) * 10 as rn
  from machines
) sub
where machines.id = sub.id;

create index if not exists machines_dept_order_idx on machines (department, display_order);
