// Supabase Edge Function: send-push
// Triggered by a Database Webhook on INSERT into `messages`. Fans the message
// out as a Web Push notification to every device in push_subscriptions.
//
// Required Edge Function secrets (Project Settings → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY   – the public VAPID key (same one shipped in the app)
//   VAPID_PRIVATE_KEY  – the private VAPID key (NEVER put this in the app)
//   VAPID_SUBJECT      – e.g. mailto:you@yourdomain.com  (any contact URL/mailto)
// SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected automatically.
//
// Deploy with JWT verification OFF so the database webhook can call it:
//   supabase functions deploy send-push --no-verify-jwt

import webpush from 'npm:web-push@3.6.7'
import { createClient } from 'npm:@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
const VAPID_PUBLIC = Deno.env.get('VAPID_PUBLIC_KEY')!
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') ?? 'mailto:admin@productionflow.app'

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE)
const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

Deno.serve(async (req) => {
  try {
    const payload = await req.json().catch(() => ({}))
    // Database webhook shape: { type, table, record, old_record }. Also accept
    // a bare message object for manual testing.
    const msg = payload.record ?? payload
    if (!msg || !msg.body) {
      return new Response(JSON.stringify({ skipped: 'no message body' }), { status: 200 })
    }

    const title = `New message from ${msg.author_name || 'someone'}`
    const body = String(msg.body).slice(0, 160)
    const notification = JSON.stringify({ title, body, tag: 'productionflow-message' })

    const { data: allSubs, error } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, employee_id')
    if (error) throw error

    // Don't notify the person who posted the message (skip their device(s)).
    const subs = (allSubs ?? []).filter((s) =>
      !(msg.author_id && s.employee_id && s.employee_id === msg.author_id))

    let sent = 0
    await Promise.all(subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          notification,
          { TTL: 600, urgency: 'high' },
        )
        sent += 1
      } catch (e) {
        // 404/410 = subscription is dead → clean it up so we stop trying.
        const code = (e as { statusCode?: number }).statusCode
        if (code === 404 || code === 410) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint)
        }
      }
    }))

    return new Response(JSON.stringify({ ok: true, sent, total: subs?.length ?? 0 }), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500 })
  }
})
