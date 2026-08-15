-- Wood day-board job status — shared across devices
--
-- Wood jobs are computed on the fly by woodDayEngine, not persisted `schedule`
-- rows, so there was nothing in the DB to mark started/done. Status lived in
-- each device's localStorage, which meant a part the boss ticked off on his
-- phone still read "to do" on the office PC.
--
-- This is the smallest thing that fixes that: one row per
-- (order, machine step, day) — exactly the key the local store already used
-- (`${orderId}::${stepId}::${dateStr}`) — so nothing about the wood engine or
-- the day-board's model has to change. When wood eventually moves onto real
-- schedule rows this table goes away and the status lives on the row itself.
--
-- Additive and safe: creates one new table, touches nothing existing.

create table if not exists wood_job_status (
  order_id        uuid not null references orders(id) on delete cascade,
  machine_step_id uuid not null references machine_steps(id) on delete cascade,
  job_date        date not null,
  status          text not null default 'queued',
  started_at      timestamptz,
  completed_at    timestamptz,
  qty_done        integer default 0,
  updated_at      timestamptz not null default now(),
  primary key (order_id, machine_step_id, job_date)
);

-- The board loads one day at a time, so date is the hot filter.
create index if not exists idx_wood_job_status_date
  on wood_job_status(job_date);
