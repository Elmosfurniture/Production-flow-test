-- Migration 016: machine_steps.alt_machine_names
--
-- A step can now route to any of several machines instead of exactly one.
-- The "pool" for a step = machine_name (primary) ++ alt_machine_names. The
-- scheduler's dispatcher (Phase 2) will pick the least-loaded pool member on
-- the day each job lands. Until Phase 2 ships, alt_machine_names is purely
-- informational — the existing dispatcher keeps using machine_name only, so
-- nothing schedules differently yet.
--
-- The default empty array means existing rows behave exactly as before.

alter table machine_steps
  add column if not exists alt_machine_names text[] not null default '{}';
