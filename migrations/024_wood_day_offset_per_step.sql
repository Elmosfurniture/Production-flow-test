-- Migration 024: Per-step wood day-offset override (conveyor v3)
--
-- The wood conveyor is being reworked from an absolute Mon–Fri week (migration
-- 023) to a RELATIVE, per-product model: day 0 is each product's own first day
-- of manufacturing, day +1 the next work day, etc. A product's route compresses
-- the distinct machine ranks it touches to 0, +1, +2… (one stage per day).
--
-- Special products need to jump stages or run several stages on the SAME day.
-- That is declared per step, right where the parts map is built. This column
-- pins a single machine_step to an explicit day-offset for its product:
--   NULL  = auto (derive from the machine's rank, compressed with the product's
--           other steps — the normal one-stage-per-day beat)
--   0,1,… = this step runs on that offset. Two steps sharing a number run the
--           same day (collapse); a later step given a smaller number than the
--           beat would assign is a jump.
--
-- Steel scheduling never reads this — it is only consumed by the wood engine.
-- Run this once in the Supabase SQL editor. Additive + nullable, so the live
-- app is unaffected until the wood v3 preview uses it.

ALTER TABLE machine_steps
  ADD COLUMN IF NOT EXISTS wood_day_offset smallint;

COMMENT ON COLUMN machine_steps.wood_day_offset IS
  'Wood conveyor v3: explicit per-product day-offset for this step (0 = product''s first day). NULL = auto (compressed machine rank). Same value on two steps = same day; a smaller value than the beat = a stage jump. Ignored for non-wood steps.';
