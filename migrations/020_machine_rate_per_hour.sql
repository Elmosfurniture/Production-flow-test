-- Migration 020: labour rate per machine (Rands per hour)
-- Drives the Labour Costing screen — cost per product = machine run-time × rate,
-- plus each machine's setup time amortised over a batch size.
-- Run this once in the Supabase SQL editor.

ALTER TABLE machines
  ADD COLUMN IF NOT EXISTS rate_per_hour numeric;

COMMENT ON COLUMN machines.rate_per_hour IS 'Labour cost of running this machine, in Rands per hour. NULL = not set.';
