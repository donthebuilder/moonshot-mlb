'use client'

// 🔔 ONE DOOR FOR EVERY NOTIFICATION (2026-08-09).
//
// Donovan: "I'd definitely like the notifications on my phone to keep going
// without the tab."
//
// WHAT ACTUALLY CHANGES, honestly. Alerts were fired with `new Notification()`
// straight from the page. That works on a desktop with the tab backgrounded
// and is unreliable-to-forbidden on Android, where Chrome requires
// notifications to come from a SERVICE WORKER registration. It also dies the
// moment the browser freezes the page, which phones do aggressively — so the
// alerts most likely to be dropped were exactly the ones from a phone sitting
// in a pocket, which is the case he cares about.
//
// Routed through the worker, a notification:
//   · is shown by the browser process, not the page, so a frozen or
//     backgrounded tab still delivers it
//   · survives the tab being backgrounded on Android at all
//   · can be TAPPED to return to the tab you already had open
//
// WHAT STILL DOESN'T WORK, and I'd rather say it here than have it discovered:
// with the site fully CLOSED, nothing arrives. That needs the Web Push
// protocol — a server holding VAPID keys, a subscription stored per device,
// and a scheduler deciding what to send. This site publishes nothing and
// stores nothing by design. The bot's Discord rooms already deliver push with
// everything closed, on both platforms; that's the channel for anything that
// genuinely has to reach a pocket.
//
// iOS: notifications require the site be ADDED TO THE HOME SCREEN first.
// Safari grants nothing to a plain tab. `installHint()` below detects that
// case so the UI can say so instead of silently failing.

let _reg = null
let _tried = false

/** Register the worker. Safe to call repeatedly; only the first one works. */
export async function ensureWorker() {
  if (_reg) return _reg
  if (_tried) return null
  _tried = true
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null
  try {
    _reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' })
    // If one was already active from a previous visit, use it right away.
    await navigator.serviceWorker.ready.catch(() => {})
    return _reg
  } catch {
    return null
  }
}

export const canNotify = () => typeof Notification !== 'undefined'

export const permission = () => (canNotify() ? Notification.permission : 'unsupported')

/**
 * iOS Safari only allows notifications for a site installed to the Home
 * Screen. Detect that specific dead end so the bell can explain itself rather
 * than appearing to do nothing.
 */
export function installHint() {
  if (typeof navigator === 'undefined' || typeof window === 'undefined') return null
  const ua = navigator.userAgent || ''
  const iOS = /iPad|iPhone|iPod/.test(ua)
    // iPadOS 13+ reports as a Mac; the touch points give it away.
    || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  if (!iOS) return null
  const standalone = window.matchMedia?.('(display-mode: standalone)')?.matches
    || window.navigator.standalone === true
  if (standalone) return null
  return 'On iPhone, alerts only work once the site is added to your Home Screen — tap Share, then “Add to Home Screen”, and open it from there.'
}

export async function requestPermission() {
  if (!canNotify()) return 'unsupported'
  if (Notification.permission === 'granted') { await ensureWorker(); return 'granted' }
  const p = await Notification.requestPermission()
  if (p === 'granted') await ensureWorker()
  return p
}

/**
 * Show one notification. Prefers the service worker; falls back to the page
 * API so a browser without workers behaves exactly as it did before.
 */
export async function notify({ title, body, tag, silent = false, url }) {
  if (!canNotify() || Notification.permission !== 'granted') return false
  const reg = await ensureWorker()
  if (reg) {
    try {
      // showNotification directly on the registration is the supported path
      // and needs no message round-trip.
      await reg.showNotification(title, {
        body, tag, silent,
        renotify: !silent && !!tag,
        icon: '/icon-192.png',
        badge: '/icon-192.png',
        data: { url: url || '/' },
      })
      return true
    } catch { /* fall through */ }
  }
  try { new Notification(title, { body, tag, silent }); return true } catch { return false }
}
