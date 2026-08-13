import { supabase } from './supabase'

// Web Push client. The VAPID PUBLIC key is safe to ship in the browser — only
// the matching PRIVATE key (kept in the Supabase Edge Function) can actually
// send pushes. A device subscribes once; the subscription is stored in the
// push_subscriptions table and the Edge Function fans a notification out to all
// of them whenever a message is posted.
const VAPID_PUBLIC_KEY = 'BNY14v0L_mZhm90gYHc_fjrzDWYH8KE52JriBUKOLSdkpKugr9UbdqvifCYBJIaiqImoZmvOuZh71MXjQ9yaAcI'

export function pushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window
}

// Standalone = launched from the home screen (PWA). iOS only allows push here.
export function isStandalone() {
  return (typeof window !== 'undefined')
    && (window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true)
}

export function isIOS() {
  if (typeof navigator === 'undefined') return false
  return /iphone|ipad|ipod/i.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) arr[i] = raw.charCodeAt(i)
  return arr
}

export async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return null
  const base = import.meta.env.BASE_URL // '/' in dev, '/ProductionFlow/' in prod
  try {
    return await navigator.serviceWorker.register(`${base}sw.js`, { scope: base })
  } catch {
    return null
  }
}

// Subscribe this device to push and save it. Must be called from a click
// (browsers require a user gesture to request notification permission).
export async function enablePush(user) {
  if (!pushSupported()) {
    if (isIOS() && !isStandalone()) {
      throw new Error('On iPhone, first add this app to your Home Screen (Share → Add to Home Screen), open it from there, then enable notifications.')
    }
    throw new Error('Push notifications are not supported on this device/browser.')
  }
  const perm = await Notification.requestPermission()
  if (perm !== 'granted') throw new Error('Notifications were not allowed. Enable them in your browser settings.')

  const reg = await registerServiceWorker()
  if (!reg) throw new Error('Could not start the notification service worker.')
  await navigator.serviceWorker.ready

  let sub = await reg.pushManager.getSubscription()
  if (!sub) {
    sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    })
  }
  const json = sub.toJSON()
  const row = {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh,
    auth: json.keys?.auth,
    employee_id: user?.id ?? null,
    employee_name: user?.name ?? null,
  }
  const { error } = await supabase.from('push_subscriptions').upsert(row, { onConflict: 'endpoint' })
  if (error) throw new Error(`Saving subscription: ${error.message}`)
  return true
}

export async function disablePush() {
  if (!('serviceWorker' in navigator)) return
  const reg = await navigator.serviceWorker.getRegistration()
  const sub = reg && await reg.pushManager.getSubscription()
  if (sub) {
    try { await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint) } catch { /* ignore */ }
    try { await sub.unsubscribe() } catch { /* ignore */ }
  }
}

// 'unsupported' | 'denied' | 'needs-install' | 'off' | 'on'
export async function pushStatus() {
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
    return (isIOS() && !isStandalone()) ? 'needs-install' : 'unsupported'
  }
  if (isIOS() && !isStandalone()) return 'needs-install'
  if (!('PushManager' in window)) return 'unsupported'
  if (Notification.permission === 'denied') return 'denied'
  try {
    const reg = await navigator.serviceWorker.getRegistration()
    const sub = reg && await reg.pushManager.getSubscription()
    return sub ? 'on' : 'off'
  } catch {
    return 'off'
  }
}
