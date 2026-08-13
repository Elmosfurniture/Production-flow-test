# Push notifications — Supabase setup

One-time backend setup so a posted message pushes a notification to every
device, even when the app is closed. Do these in your Supabase dashboard.

## Your VAPID keys
- **Public** (already baked into the app — safe to share):
  `BNY14v0L_mZhm90gYHc_fjrzDWYH8KE52JriBUKOLSdkpKugr9UbdqvifCYBJIaiqImoZmvOuZh71MXjQ9yaAcI`
- **Private** (SECRET — only paste into Supabase, never anywhere public):
  `MNKShi6LRy4rzQE20-j3jPV6PadhfSL4xGQgN6v0BS0`

## 1. Create the table
SQL Editor → run `migrations/021_push_subscriptions.sql`.

## 2. Deploy the Edge Function
The function code is in `supabase/functions/send-push/index.ts`.

Easiest (no CLI): Dashboard → **Edge Functions** → **Create a function** →
name it exactly `send-push` → paste the file contents → **Deploy**.
Then turn **"Verify JWT" OFF** for this function (so the webhook can call it).

(CLI alternative: `supabase functions deploy send-push --no-verify-jwt`.)

## 3. Set the function secrets
Project Settings → **Edge Functions** → **Secrets** → add:
- `VAPID_PUBLIC_KEY`  = the public key above
- `VAPID_PRIVATE_KEY` = the private key above
- `VAPID_SUBJECT`     = `mailto:youremail@example.com`

(`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are provided automatically.)

## 4. Fire it on every new message
Database → **Webhooks** → **Create a new hook**:
- Table: `messages`, Events: **Insert**
- Type: **Supabase Edge Function** → `send-push`
- (If asked for an HTTP header, add `Authorization: Bearer <your anon key>`.)

## 5. Turn it on per device
On each phone/computer that wants alerts:
- **iPhone:** open the live site in Safari → Share → **Add to Home Screen** →
  open the app **from the home-screen icon** → Dashboard → **Enable
  notifications** → Allow.
- **Android/desktop:** Dashboard → **Enable notifications** → Allow.
  (Installing via the browser's "Install app" is optional but recommended.)

## Test
Post a message from one device; the others get a notification. On desktop you
can close the tab (browser still running) and still receive it.
