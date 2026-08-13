-- ============================================================
-- Migration 005 — Schedule rows track step + clock time.
--
-- Existing `schedule` table has (order_id, machine_id, scheduled_date,
-- position, status, started_at, completed_at). The dispatcher needs:
--   - machine_step_id  : which step of which part this row covers
--   - start_time       : scheduled clock-time start (e.g. 08:00)
--   - end_time         : scheduled clock-time end (spans any breaks within)
--   - includes_setup   : whether setup_time was charged on this row
--
-- started_at / completed_at remain for MES Station's actual run times.
-- ============================================================

alter table schedule
  add column if not exists machine_step_id uuid references machine_steps(id) on delete cascade,
  add column if not exists start_time      time,
  add column if not exists end_time        time,
  add column if not exists includes_setup  boolean not null default false;

create index if not exists schedule_date_idx         on schedule (scheduled_date);
create index if not exists schedule_date_machine_idx on schedule (scheduled_date, machine_id);
create index if not exists schedule_machine_step_idx on schedule (machine_step_id);
