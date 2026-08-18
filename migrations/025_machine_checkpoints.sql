-- Migration 025: Machine checkpoints
-- A checkpoint is a NAMED GROUP OF MACHINES (e.g. every saw -> "Cutting",
-- every sander -> "Sanding"). Tracking rolls the group up per order so the
-- boss can see how far through the factory a product is without expanding
-- every part: "Cutting 7/7 done", "Sanding 5/7".
--
-- Grouping is just a shared name on the machine row — no separate table, so a
-- machine belongs to exactly one checkpoint and renaming the group is a
-- rename on each of its machines. Applies to wood AND steel (any department);
-- NULL / blank = the machine is not part of any checkpoint.
--
-- Checkpoint DISPLAY ORDER is derived from machines.display_order (the drag
-- order on the Machines screen) — the earliest machine in a group sets where
-- that checkpoint sits in the flow, so no extra column is needed.
--
-- Run this once in the Supabase SQL editor.

ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS checkpoint text;

COMMENT ON COLUMN machines.checkpoint IS
  'Name of the manufacturing checkpoint this machine belongs to (e.g. "Cutting"). Machines sharing a name form one group; Tracking shows a per-order done count for each group. NULL = not on a checkpoint.';

-- Speeds up "every machine in checkpoint X" lookups once the list grows.
CREATE INDEX IF NOT EXISTS machines_checkpoint_idx
  ON machines (department, checkpoint)
  WHERE checkpoint IS NOT NULL;
