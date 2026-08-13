-- Migration 021: Web Push subscriptions
-- One row per device that opted in to push notifications. The Edge Function
-- "send-push" reads this table and pushes a notification to every device when
-- a new message is posted. Run once in the Supabase SQL editor.

create table if not exists push_subscriptions (
  endpoint     text primary key,
  p256dh       text not null,
  auth         text not null,
  employee_id  uuid,
  employee_name text,
  created_at   timestamptz not null default now()
);

-- The app talks to Supabase with the shared anon key (behind its own PIN
-- login), so allow that role to register/remove its own device subscription.
alter table push_subscriptions enable row level security;

drop policy if exists "anon manage push subs" on push_subscriptions;
create policy "anon manage push subs"
  on push_subscriptions for all
  to anon, authenticated
  using (true) with check (true);
