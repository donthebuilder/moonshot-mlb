'use client'

// TURNING ALERTS ON FOR THIS DEVICE, FROM ANYWHERE (2026-10-13; permission and settings UX). The Alerts panel on the front door owns the full flow; the watchlist, the
// binder and the "get alerts for the players you follow?" sheet right after a first follow need the same three steps in one tap, so they share this:
//   permission (the browser's own prompt, only from a tap) -> the master switch -> the closed-site push subscription (signed in).
// Pure of any markup. Every browser call is guarded: an unsupported browser, a blocked site and a signed-out visitor each come back as a named step, never a throw.
import { useCallback, useEffect, useState } from 'react'

import { canNotify, installHint, permission, requestPermission } from '../notify'
import { currentSubscription, pushSupported, subscribePush, vapidPublicKey } from './push'

/**
 * Run the arming steps. MUST be called straight from a tap (the permission prompt needs the gesture): nothing is awaited before requestPermission().
 * @param setMaster  alerts.js setAlertMaster / the hook's setMaster
 * @returns {{ ok: boolean, step: 'unsupported'|'ios'|'denied'|'on'|'open-only', hint?: string, welcomed?: boolean, reason?: string }}
 */
export async function armThisDevice(setMaster) {
  if (!canNotify()) return { ok: false, step: 'unsupported' }
  const hint = installHint()
  if (hint) return { ok: false, step: 'ios', hint }                       // iOS in a plain Safari tab: say so (Add to Home Screen) instead of failing silently
  const granted = permission() === 'granted' ? 'granted' : await requestPermission()
  if (granted !== 'granted') return { ok: false, step: 'denied' }
  setMaster(true)
  if (pushSupported() && (await vapidPublicKey())) {
    const r = await subscribePush()
    return r.ok ? { ok: true, step: 'on', welcomed: r.welcomed === true } : { ok: true, step: 'open-only', reason: r.reason }
  }
  return { ok: true, step: 'open-only' }
}

/** Where this device stands: 'checking' | 'unsupported' | 'ios' | 'blocked' | 'off' | 'on-open' (while a tab is open) | 'on' (even with the site closed). */
export function useDeviceAlerts(masterOn) {
  const [state, setState] = useState('checking')
  const read = useCallback(async () => {
    if (!canNotify()) return setState(installHint() ? 'ios' : 'unsupported')
    if (installHint()) return setState('ios')
    const perm = permission()
    if (perm === 'denied') return setState('blocked')
    if (perm !== 'granted' || !masterOn) return setState('off')
    const sub = await currentSubscription()
    return setState(sub ? 'on' : 'on-open')
  }, [masterOn])
  useEffect(() => { read() }, [read])
  return { state, refresh: read }
}
