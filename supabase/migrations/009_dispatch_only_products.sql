-- Dispatch-only products
--
-- Some products are supplied pre-assembled and only need to be put together /
-- shipped — no machine routing. Marking a product `is_dispatch_only = true`
-- tells the scheduler to skip the routing requirement and place the order
-- directly at (send date - dispatch dept buffer). The order still appears on
-- the Dispatch screen on the right day.
--
-- Default false — existing products behave exactly as before.

alter table products
  add column if not exists is_dispatch_only boolean not null default false;

-- Optional helper index for the "filter to dispatch-only" lookups.
create index if not exists idx_products_is_dispatch_only
  on products(is_dispatch_only) where is_dispatch_only = true;
