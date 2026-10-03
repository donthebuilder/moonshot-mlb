'use client'
// LIVE ON YOUR TAP (2026-10-02, Donovan: "live in game based on personal
// refresh"). The site no longer re-fetches live things on a timer. One shared
// signal instead: the ↻ in a product's header (components/RefreshStamp.js),
// or coming back to the tab after a minute away, asks every live view on the
// page to pull once. Each view subscribes with useLiveRefresh(fn). Push
// notifications are server-side and unaffected (the cron sends them).
import { useEffect, useRef, useSyncExternalStore } from 'react'

const subs = new Set()
const watchers = new Set()
let state = { at: Date.now(), pulling: false, reason: 'load' }
const emit = () => watchers.forEach((w) => w())
const RETURN_MS = 60 * 1000   // back on the tab after this long = one pull

/** Ask every live view on the page to pull now. */
export function requestLiveRefresh(reason = 'tap') {
  state = { at: Date.now(), pulling: true, reason }
  emit()
  for (const fn of subs) { try { fn(reason) } catch { /* one view failing never stops the rest */ } }
  setTimeout(() => { state = { ...state, pulling: false }; emit() }, 1200)
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && Date.now() - state.at > RETURN_MS) requestLiveRefresh('return')
  })
}

/** fn runs on every refresh request (the ↻, or a return to the tab). */
export function useLiveRefresh(fn) {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    const h = (why) => ref.current?.(why)
    subs.add(h)
    return () => { subs.delete(h) }
  }, [])
}

/** { at, pulling } of the last refresh, for the stamp. */
export function useLiveRefreshState() {
  return useSyncExternalStore((cb) => { watchers.add(cb); return () => watchers.delete(cb) }, () => state, () => state)
}

/** For code inside an effect: subscribe fn to the ↻; returns the unsubscribe. */
export function onLiveRefresh(fn) {
  const h = (why) => { try { fn(why) } catch { /* keep the rest going */ } }
  subs.add(h)
  return () => { subs.delete(h) }
}
