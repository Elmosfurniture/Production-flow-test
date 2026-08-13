-- ============================================================
-- Migration 006 — Schedule rows can represent partial quantities.
--
-- When a step's work doesn't fit in the remaining shift, the engine splits
-- it: it places as many parts as fit today, then continues with the rest
-- on the next working day. Each row stores its own qty so the screen can
-- show "80 of 100 parts" on the partial and "20 of 100" on the continuation.
-- Existing rows have qty = NULL; the screen falls back to the full part
-- quantity computed from order.qty × part.qty_per_unit when qty is NULL.
-- ============================================================

alter table schedule
  add column if not exists qty integer;
