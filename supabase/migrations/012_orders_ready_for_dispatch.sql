-- ============================================================
-- Migration 012 — Orders carry a "ready for dispatch" timestamp.
--
-- The flow:
--   * Part Tracking lets the boss tick parts off per machine step (qty_done).
--   * When every step is fully done the order is "production complete" — a
--     derived state, no column needed.
--   * The boss then clicks "Mark Ready for Dispatch" on Tracking. That writes
--     this timestamp, removes the order from Tracking, and reveals it in the
--     Dashboard's Ready-for-Dispatch section plus the Dispatch calendar's
--     "ready to go" colour.
--
-- Kept nullable so existing orders stay in the in-progress bucket until they
-- physically get the tick.
-- ============================================================

alter table orders
  add column if not exists ready_for_dispatch_at timestamptz;
