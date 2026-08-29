/* MOONSHOT service worker.
 *
 * 2026-08-09, Donovan: "I'd definitely like the notifications on my phone to
 * keep going without the tab."
 *
 * READ THIS BEFORE EXPECTING MORE THAN IT DOES.
 *
 * There are three different things people mean by "notifications keep going",
 * and only two of them are possible without a server:
 *
 *   1. TAB BACKGROUNDED, browser still running — works today, and works BETTER
 *      through this file. `new Notification()` from a page is unreliable on
 *      Android and unsupported in some contexts; a notification shown by a
 *      SERVICE WORKER registration is the supported path, survives the page
 *      being frozen, and can be clicked to bring the site back to the exact
 *      tab. That's what this handles.
 *
 *   2. SITE INSTALLED TO THE HOME SCREEN — works, via the manifest. On iOS
 *      this is also a hard PREREQUISITE for web notifications at all: Safari
 *      only grants them to a site added to the Home Screen.
 *
 *   3. SITE FULLY CLOSED, phone in your pocket, alert arrives anyway — this
 *      one is NOT possible from a static site. It requires the Web Push
 *      protocol: a server holding VAPID keys, a stored subscription per
 *      device, and something running on a schedule to decide what to send.
 *      moonshot-mlb publishes nothing and stores nothing, by design.
 *
 *      The honest workaround already exists and is already built: the BOT
 *      posts to Discord, and the Discord mobile app delivers push with
 *      everything closed, on both platforms, today. Anything that genuinely
 *      needs to reach a pocket should go out through the bot, not the browser.
 *
 * The cache here is deliberately tiny — this is NOT an offline app. A betting
 * tool that serves you a cached slate is worse than one that fails to load,
 * so nothing from the data branch is ever cached and every fetch goes to the
 * network. The worker exists for notifications and installability only.
 */

const VERSION = 'moonshot-sw-v1'

self.addEventListener('install', (e) => {
  // Take over immediately rather than waiting for every old tab to close —
  // otherwise an update ships and nobody sees it until they quit the browser.
  self.skipWaiting()
})

self.addEventListener('activate', (e) => {
  e.waitUntil((async () => {
    // Drop anything a previous version cached. We keep no caches now.
    const keys = await caches.keys()
    await Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    await self.clients.claim()
  })())
})

// NO FETCH HANDLER ON PURPOSE.
//
// Registering a fetch listener makes every request in the page go through this
// worker, and a bug here would break the whole site silently. Since we cache
// nothing, the correct handler is no handler: the browser goes straight to the
// network exactly as it did before this file existed.

// The page asks the worker to show a notification. Going through the worker
// (rather than `new Notification`) is what keeps it alive when the page is
// backgrounded or frozen.
self.addEventListener('message', (e) => {
  const d = e.data
  if (!d || d.type !== 'notify') return
  const { title, body, tag, silent, url } = d
  e.waitUntil(self.registration.showNotification(title || 'DASH Network · Moonshot', {
    body: body || '',
    tag: tag || undefined,
    silent: !!silent,
    // renotify only matters with a tag; without it a repeat tag stays quiet.
    renotify: !silent && !!tag,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    // Defaults to the BOARD, not the front door (2026-08-28, when / became the
    // front door and the board moved to /app). A homer alert that opened a
    // marketing page would be the wrong end of the site.
    data: { url: url || '/app' },
  }))
})

// Tapping the notification should land you back in the tab you already had
// open, not spawn a fifth copy of the site.
self.addEventListener('notificationclick', (e) => {
  e.notification.close()
  const target = e.notification?.data?.url || '/app'
  e.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    for (const c of all) {
      if ('focus' in c) {
        try { if (target && target !== '/' && 'navigate' in c) await c.navigate(target) } catch {}
        return c.focus()
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target)
    return undefined
  })())
})

// Web Push, for the day a server exists to send it. Harmless until then: with
// no subscription on file this never fires.
self.addEventListener('push', (e) => {
  let d = {}
  try { d = e.data ? e.data.json() : {} } catch { d = { body: e.data ? e.data.text() : '' } }
  e.waitUntil(self.registration.showNotification(d.title || '⚾ DASH Network · Moonshot', {
    body: d.body || '',
    tag: d.tag || undefined,
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    data: { url: d.url || '/app' },
  }))
})
