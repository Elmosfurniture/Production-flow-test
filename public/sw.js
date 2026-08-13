/* ProductionFlow service worker — receives Web Push and shows a notification
   even when the app is closed, and focuses/opens the app when tapped.
   Paths are derived from the registration scope so it works under the
   /ProductionFlow/ GitHub Pages base AND on localhost. */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} }
  catch { data = { title: 'New message', body: event.data ? event.data.text() : '' } }

  const base = self.registration.scope // e.g. https://host/ProductionFlow/
  const title = data.title || 'New message'
  const options = {
    body: data.body || '',
    icon: data.icon || base + 'logo.png',
    badge: data.badge || base + 'logo.png',
    tag: data.tag || 'productionflow-message',
    renotify: true,
    data: { url: data.url || base + 'dashboard' },
  }
  event.waitUntil(self.registration.showNotification(title, options))
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = (event.notification.data && event.notification.data.url)
    || (self.registration.scope + 'dashboard')
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if (c.url.startsWith(self.registration.scope) && 'focus' in c) {
        try { await c.navigate(target) } catch { /* ignore */ }
        return c.focus()
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target)
  })())
})
