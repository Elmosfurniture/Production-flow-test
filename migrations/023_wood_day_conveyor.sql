-- Migration 023: Wood day-conveyor scheduling
-- Wood department moves to a fixed Mon–Fri "day conveyor" instead of bottleneck
-- minutes. Each wood machine gets a day number (0 = Monday/first day of
-- manufacturing … 4 = Friday/finishing). All machines with the same number run
-- on the same day; a part can only advance to a machine on that machine's day.
--
-- Per-product overrides let a single product reassign a machine's day for itself
-- only (e.g. KFC booth bench seat uses CNC Sharp on day 2), without touching that
-- machine's day for any other product.
--
-- Steel scheduling is unaffected — wood_day is only read by the wood engine.
-- Run this once in the Supabase SQL editor.

-- 1. Per-machine default day (0–4). NULL = not placed on the conveyor yet.
ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS wood_day smallint;

COMMENT ON COLUMN machines.wood_day IS
  'Wood conveyor day this machine runs on: 0=Mon (first day) … 4=Fri (finishing). NULL = unassigned. Ignored for non-wood machines.';

-- 2. Per-product day overrides, keyed by machine name.
--    Shape: { "CNC Sharp": 2, "Top & Bottom (L)": 0 }
--    A machine listed here uses the override day for THIS product only; machines
--    not listed fall back to machines.wood_day.
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS wood_day_overrides jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN products.wood_day_overrides IS
  'Per-product wood conveyor day overrides, keyed by machine name -> day (0–4). Overrides machines.wood_day for this product only.';
