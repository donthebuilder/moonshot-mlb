'use client'
import { useEffect, useState } from 'react'

import { useDashAccount } from '../lib/dash/sync'
import { NUDGE_EVENT } from '../lib/dash/nudge'
import { alertPrefs } from '../lib/dash/alerts'
import { canNotify, installHint, permission } from '../lib/notify'
import { installHintText } from '../lib/copy/notifications'
import { dockClearCss } from '../lib/dockClear'
import { C as MLB_C, NUM_FONT } from '../lib/theme'
import { C as NFL_C } from '../lib/nfl/theme'
import { C as NHL_C } from '../lib/nhl/theme'
import { C as NBA_C } from '../lib/nba/theme'
import AlertsQuick from './AlertsQuick'

// "GET ALERTS FOR THE PLAYERS YOU FOLLOW?" (2026-10-13; permission and settings UX). The right moment to ask is right after somebody follows a player for the first
// time: they just said who they care about. A quiet, dismissible sheet above the bottom bar, mounted once in the app shell next to the account ask.
//   * ONCE PER DEVICE: shown the first time only (localStorage); closing it or choosing anything ends it for good on this device.
//   * NEVER BEFORE A FOLLOW: it listens for the follow nudge (lib/dash/follow.js), so a first visit that follows nobody never sees it.
//   * NEVER OVER AN ANSWER: not shown when alerts are already on here, when the browser blocked them, or when the browser cannot show them. (Signed-out visitors get
//     the account ask instead: alerts to a closed site need an account. This one waits until they are signed in and follow again.)
//   * iPhone: the Add to Home Screen steps appear ONLY on an iPhone where the site is not on the Home Screen (installHint()), since that is the one platform that needs them.
// Every storage call is in a try/catch: private mode just means it is skipped.
const LOOK = {
  mlb: { theme: MLB_C, accent: 'orange' },
  nfl: { theme: NFL_C, accent: 'green' },
  nhl: { theme: NHL_C, accent: 'ice' },
  nba: { theme: NBA_C, accent: 'purple' },
}
export const ASKED_KEY = 'dash_alerts_ask_v1'
const read = () => { try { return window.localStorage.getItem(ASKED_KEY) } catch { return 'blocked' } }   // unreadable storage = do not ask
const mark = () => { try { window.localStorage.setItem(ASKED_KEY, '1') } catch { /* private mode */ } }

export default function AlertsAsk({ sport = 'mlb' }) {
  const account = useDashAccount()
  const [open, setOpen] = useState(false)
  const [done, setDone] = useState(false)
  const signedIn = Boolean(account?.ready && account?.configured && account?.signedIn)
  const { theme: T, accent } = LOOK[sport] || LOOK.mlb
  const A = T[accent] || T.text
  const NUM = NUM_FONT

  useEffect(() => {
    if (!signedIn) return undefined
    let timer = null
    const onNudge = (e) => {
      if (e?.detail?.reason !== 'follow' || read() !== null) return
      if (alertPrefs().on || permission() === 'denied') return
      if (!canNotify() && !installHint()) return
      mark()                                                    // shown once: asked, whatever they answer
      timer = setTimeout(() => setOpen(true), 700)              // after the star's own feedback, not on top of it
    }
    window.addEventListener(NUDGE_EVENT, onNudge)
    return () => { window.removeEventListener(NUDGE_EVENT, onNudge); if (timer) clearTimeout(timer) }
  }, [signedIn])

  if (!open) return null
  const box = { position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: 396, width: 'min(520px, calc(100vw - 32px))', maxHeight: '70vh', overflowY: 'auto', background: T.bg2, border: `1px solid ${A}55`, borderRadius: 14, color: T.text, boxShadow: `0 18px 50px ${T.bg}`, padding: '14px 16px' }
  const hint = installHint()
  return (
    <div role="dialog" aria-label="Get alerts for the players you follow?" className="alerts-ask" style={box}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <strong style={{ fontSize: 14 }}>{done ? 'Alerts are on' : 'Get alerts for the players you follow?'}</strong>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close" style={{ marginLeft: 'auto', width: 44, height: 44, background: 'none', border: 0, color: T.text3, fontSize: 16, cursor: 'pointer' }}>✕</button>
      </div>
      {done ? (
        <p style={{ margin: '4px 0 8px', color: T.text2, fontSize: 12.5, lineHeight: 1.45 }}>You will hear about the players you follow. Change it any time in Alerts.</p>
      ) : hint ? (
        <p style={{ margin: '4px 0 8px', color: T.text2, fontSize: 12.5, lineHeight: 1.45 }}>{installHintText()}</p>
      ) : (
        <>
          <p style={{ margin: '4px 0 10px', color: T.text2, fontSize: 12.5, lineHeight: 1.45 }}>Pick how much you hear. One tap turns it on for this device, and you can change it any time.</p>
          <AlertsQuick C={T} accent={A} NUM_FONT={NUM} onDone={() => setDone(true)} />
        </>
      )}
      <button type="button" onClick={() => setOpen(false)} style={{ minHeight: 44, padding: '0 4px', background: 'none', border: 0, color: T.text3, fontSize: 12.5, cursor: 'pointer' }}>{done || hint ? 'Close' : 'Not now'}</button>
      <style>{dockClearCss('alerts-ask')}</style>
    </div>
  )
}
