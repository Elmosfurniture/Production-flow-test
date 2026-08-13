-- ============================================================
-- Migration 011 — Schedule rows track partial quantity completed.
--
-- Until now each schedule row only had a binary status (queued / working /
-- paused / completed). That works for "this row is done" but not for
-- "operator made 15 of 20 today, 5 still missing". Part Tracking + the End
-- of Day walk both need to surface that partial state.
--
-- qty_done is the count of physical units finished on this row. Rules:
--   * default 0
--   * never exceeds qty (the planned amount for the row)
--   * row status auto-derived elsewhere: qty_done = 0 → queued/working,
--     qty_done >= qty → completed
--   * MES Station's Complete Step confirmation writes the final qty here;
--     Part Tracking lets the boss enter or correct it manually.
-- ============================================================

alter table schedule
  add column if not exists qty_done integer not null default 0;
