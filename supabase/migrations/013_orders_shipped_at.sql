-- ============================================================
-- Migration 013 — Orders carry a shipped_at timestamp.
--
-- The flow:
--   1. Production finishes (all schedule rows for the order have qty_done = qty).
--   2. Boss ticks "Ready for Dispatch" on Tracking → ready_for_dispatch_at set,
--      order leaves Tracking + Schedule and appears on Dispatch calendar +
--      Dashboard's Ready-for-Dispatch section.
--   3. Dispatch team loads + ships, then clicks "Mark shipped" on the Dispatch
--      calendar's day modal → this column gets set, status moves to 'completed',
--      order vanishes from Dispatch calendar and lands in Dashboard's
--      Completed Orders section.
--
-- Kept nullable so existing orders stay where they are until they actually ship.
-- ============================================================

alter table orders
  add column if not exists shipped_at timestamptz;
