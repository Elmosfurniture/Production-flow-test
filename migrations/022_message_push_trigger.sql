-- Migration 022: fire the send-push Edge Function whenever a message is posted.
-- A database trigger (via pg_net) is more reliable than the dashboard Webhook
-- UI. Run once in the Supabase SQL editor.

create extension if not exists pg_net;

create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
as $$
begin
  perform net.http_post(
    url := 'https://oevjemzjuorbcklkxity.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ldmplbXpqdW9yYmNrbGt4aXR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MzY2ODQsImV4cCI6MjA5NDExMjY4NH0.Nzo1PVBVS6rXrizPLT3Y3A0RFU_uCPnsBq0UJaUbT9c',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9ldmplbXpqdW9yYmNrbGt4aXR5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg1MzY2ODQsImV4cCI6MjA5NDExMjY4NH0.Nzo1PVBVS6rXrizPLT3Y3A0RFU_uCPnsBq0UJaUbT9c'
    ),
    body := jsonb_build_object('record', row_to_json(NEW))
  );
  return NEW;
end;
$$;

drop trigger if exists on_message_created on public.messages;
create trigger on_message_created
  after insert on public.messages
  for each row execute function public.notify_new_message();
