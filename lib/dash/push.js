'use client'

// Subscribing this browser to push, from the browser's side.
//
// The service worker has had a `push` handler since it was written — its
// comment says "for the day a server exists to send it. Harmless until then:
// with no subscription on file this never fires." That day is
// app/api/dash/push/tick. This is the missing middle: asking the browser for a
// subscription and handing it to that sender.
//
// PER DEVICE, ALWAYS. A subscription is issued by this browser and is only
// valid for this browser, so subscribing on a laptop says nothing about a
// phone. That is a property of the protocol, not a shortcut here, and the
// panel says so rather than implying the choice travelled with the account.
//
// PERMISSION FIRST. A push subscription requires notification permission
// already granted; asking for it here would be a second prompt in a different
// place from the one the bell already owns.

import { ensureWorker } from '../notify'

const SUBSCRIBE = '/api/dash/push/subscribe'

export const pushSupported = () => (
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  typeof Notification !== 'undefined'
)

// Fetched, not read from process.env — see the GET handler in
// app/api/dash/push/subscribe for why (NEXT_PUBLIC_ vars are baked in at build
// time, so a key added afterwards would be invisible until a redeploy).
// Cached for the life of the page; it never changes under a running deploy.
let _key
export async function vapidPublicKey() {
  if (_key !== undefined) return _key
  try {
    const res = await fetch(SUBSCRIBE, { cache: 'no-store', credentials: 'same-origin' })
    const body = res.ok ? await res.json() : null
    _key = body?.configured ? String(body.publicKey || '') : ''
  } catch { _key = '' }
  return _key
}

// The applicationServerKey has to be raw bytes; VAPID keys travel as
// URL-safe base64. Standard conversion, unchanged from the spec's example.
function toBytes(base64Url) {
  const padding = '='.repeat((4 - (base64Url.length % 4)) % 4)
  const base64 = (base64Url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const out = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i += 1) out[i] = raw.charCodeAt(i)
  return out
}

/** Is this browser already subscribed? */
export async function currentSubscription() {
  if (!pushSupported()) return null
  try {
    const reg = await ensureWorker()
    if (!reg) return null
    return await reg.pushManager.getSubscription()
  } catch { return null }
}

/** Subscribe and register with the account. Returns {ok, reason}. */
export async function subscribePush() {
  if (!pushSupported()) return { ok: false, reason: 'unsupported' }
  const key = await vapidPublicKey()
  if (!key) return { ok: false, reason: 'not-configured' }
  if (Notification.permission !== 'granted') return { ok: false, reason: 'permission' }

  try {
    const reg = await ensureWorker()
    if (!reg) return { ok: false, reason: 'no-worker' }
    const existing = await reg.pushManager.getSubscription()
    const sub = existing || await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: toBytes(key),
    })
    const res = await fetch(SUBSCRIBE, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      return { ok: false, reason: res.status === 401 ? 'signed-out' : (body.error || 'failed') }
    }
    return { ok: true }
  } catch (err) {
    return { ok: false, reason: String(err?.message || 'failed') }
  }
}

/** Unsubscribe this browser and forget it server-side. */
export async function unsubscribePush() {
  const sub = await currentSubscription()
  if (!sub) return { ok: true }
  const endpoint = sub.endpoint
  try { await sub.unsubscribe() } catch { /* forget it server-side anyway */ }
  try {
    await fetch(SUBSCRIBE, {
      method: 'DELETE',
      headers: { 'content-type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ endpoint }),
    })
  } catch { /* the sender drops dead endpoints on its own next run */ }
  return { ok: true }
}
