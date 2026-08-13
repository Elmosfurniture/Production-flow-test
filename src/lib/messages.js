import { supabase } from './supabase'

// Dashboard message board — short broadcast notes posted by Boss/Manager and
// visible to everyone signed in. Stored in the `messages` table.
//
// Schema (see CREATE TABLE in repo notes):
//   id           uuid primary key default gen_random_uuid()
//   body         text not null
//   author_id    uuid references employees(id)
//   author_name  text not null
//   author_role  text not null
//   author_dept  text
//   created_at   timestamptz not null default now()

export async function listMessages(limit = 30) {
  const { data, error } = await supabase
    .from('messages')
    .select('id, body, author_id, author_name, author_role, author_dept, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(`List messages: ${error.message}`)
  return data || []
}

export async function postMessage({ body, author }) {
  const trimmed = (body || '').trim()
  if (!trimmed) return null
  const payload = {
    body: trimmed,
    author_id: author?.id ?? null,
    author_name: author?.name || 'Unknown',
    author_role: author?.role || 'Worker',
    author_dept: author?.activeDepartment || null,
  }
  const { data, error } = await supabase
    .from('messages')
    .insert(payload)
    .select()
    .single()
  if (error) throw new Error(`Post message: ${error.message}`)
  return data
}

export async function deleteMessage(id) {
  const { error } = await supabase.from('messages').delete().eq('id', id)
  if (error) throw new Error(`Delete message: ${error.message}`)
}

// Live-subscribe to inserts and deletes. Returns an unsubscribe fn.
// Each call gets a UNIQUE channel name — Supabase channels are singletons by
// name, so two subscribers (e.g. the Dashboard board + the app-wide notifier)
// sharing one name would make the second `.on()` throw "cannot add callbacks
// after subscribe()".
let channelSeq = 0
export function subscribeMessages({ onInsert, onDelete }) {
  channelSeq += 1
  const channel = supabase
    .channel(`messages-feed-${channelSeq}-${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, (payload) => {
      onInsert?.(payload.new)
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages' }, (payload) => {
      onDelete?.(payload.old)
    })
    .subscribe()
  return () => {
    try { supabase.removeChannel(channel) } catch {}
  }
}
