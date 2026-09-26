'use client'
import { useEffect, useState } from 'react'
import { useDashAccount } from '../lib/dash/sync'
import { NUDGE_EVENT } from '../lib/dash/nudge'
import { C as MLB_C } from '../lib/theme'
import { C as NFL_C } from '../lib/nfl/theme'
import { C as NHL_C } from '../lib/nhl/theme'

// THE ACCOUNT ASK, AT THE MOMENT IT'S USEFUL (funnel step 3, 2026-09-26).
// Mounted once in the app shell (SportRoot). Signed out only -- signed in, or
// not known yet, it renders nothing. No wall anywhere: everything it offers
// is optional and the thing you just did already worked on this device.
//
//   ★ a new player       -> a small sheet: "Save your players"
//   alerts switched on   -> the same sheet: "Alerts need a free account"
//   3rd page view        -> one quiet line above the bottom nav, dismissible;
//                           dismissed means gone for good on this device
//
// Each sheet shows at most once per visit (sessionStorage), so a second star
// doesn't ask again. Every storage read and write is in a try/catch: private
// mode, blocked storage or a preview just means the ask is skipped.
const LOOK = {
  mlb: { theme: MLB_C, accent: 'orange' },
  nfl: { theme: NFL_C, accent: 'green' },
  nhl: { theme: NHL_C, accent: 'ice' },
}
const COPY = {
  follow: { title: 'Save your players', body: 'Starred on this device. A free account keeps your players on every device and can tell you when they do something.' },
  alerts: { title: 'Alerts need a free account', body: 'Your switches are saved on this device. Alerts reach your phone once you have a free account.' },
}
const VIEWS = 'dash_nudge_views_v1'   // sessionStorage: page views this visit
const SHOWN = 'dash_nudge_shown_v1'   // sessionStorage: sheets already shown this visit
const BAR_OFF = 'dash_nudge_bar_v1'   // localStorage: the bar was dismissed
const BAR_AFTER = 3

const store = (kind) => { try { return kind === 'local' ? window.localStorage : window.sessionStorage } catch { return null } }
const get = (kind, k) => { try { return store(kind)?.getItem(k) ?? null } catch { return null } }
const set = (kind, k, v) => { try { store(kind)?.setItem(k, v) } catch { /* storage blocked */ } }

// Sign-up that brings you back to exactly this page, hash included.
const signupHref = () => {
  try { const { pathname, search, hash } = window.location; return `/login?next=${encodeURIComponent(pathname + search + hash)}#create-account` } catch { return '/login#create-account' }
}
// A "page" in the app is its product + tab; the player param alone is not a new page.
const pageKey = () => {
  try { const h = new URLSearchParams(window.location.hash.slice(1)); return `${h.get('sport') || 'mlb'}:${h.get('tab') || 'home'}` } catch { return '' }
}

export default function AccountNudge({ sport = 'mlb' }) {
  const account = useDashAccount()
  const [sheet, setSheet] = useState(null)
  const [bar, setBar] = useState(false)
  const out = Boolean(account?.ready && account?.configured && !account?.signedIn)
  const { theme: T, accent } = LOOK[sport] || LOOK.mlb
  const A = T[accent] || T.text

  useEffect(() => {
    if (!out) return undefined
    const onNudge = (e) => {
      const reason = e?.detail?.reason
      if (!COPY[reason]) return
      const shown = String(get('session', SHOWN) || '').split(',')
      if (shown.includes(reason)) return
      set('session', SHOWN, [...shown.filter(Boolean), reason].join(','))
      setBar(false)
      setSheet(reason)
    }
    let last = ''
    const onView = () => {
      const k = pageKey()
      if (!k || k === last) return
      last = k
      const n = Number(get('session', VIEWS) || 0) + 1
      set('session', VIEWS, String(n))
      if (n >= BAR_AFTER && get('local', BAR_OFF) !== 'dismissed') setBar(true)
    }
    onView()
    window.addEventListener(NUDGE_EVENT, onNudge)
    window.addEventListener('hashchange', onView)
    return () => { window.removeEventListener(NUDGE_EVENT, onNudge); window.removeEventListener('hashchange', onView) }
  }, [out])

  if (!out) return null
  const box = { position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: 395, width: 'min(520px, calc(100vw - 32px))', background: T.bg2, border: `1px solid ${A}55`, borderRadius: 14, color: T.text, boxShadow: `0 18px 50px ${T.bg}` }

  if (sheet) {
    const c = COPY[sheet]
    return (
      <div role="dialog" aria-label={c.title} className="account-nudge" style={{ ...box, padding: '14px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <strong style={{ fontSize: 14 }}>{c.title}</strong>
          <button type="button" onClick={() => setSheet(null)} aria-label="Close" style={{ marginLeft: 'auto', background: 'none', border: 0, color: T.text3, fontSize: 16, cursor: 'pointer', padding: 4 }}>✕</button>
        </div>
        <p style={{ margin: '6px 0 12px', color: T.text2, fontSize: 12.5, lineHeight: 1.45 }}>{c.body}</p>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <a href={signupHref()} style={{ padding: '9px 14px', borderRadius: 10, background: A, color: T.bg, fontWeight: 800, fontSize: 13, textDecoration: 'none' }}>Create free account</a>
          <button type="button" onClick={() => setSheet(null)} style={{ background: 'none', border: 0, color: T.text3, fontSize: 12.5, cursor: 'pointer' }}>Not now</button>
        </div>
        <style>{NUDGE_CSS}</style>
      </div>
    )
  }
  if (!bar) return null
  return (
    <div role="note" className="account-nudge" style={{ ...box, display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px 8px 14px', fontSize: 12 }}>
      <a href={signupHref()} style={{ flex: 1, minWidth: 0, color: T.text2, textDecoration: 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        Get tonight&apos;s calls before the game · <b style={{ color: A }}>free account</b>
      </a>
      <button type="button" aria-label="Dismiss" onClick={() => { set('local', BAR_OFF, 'dismissed'); setBar(false) }} style={{ background: 'none', border: 0, color: T.text3, fontSize: 14, cursor: 'pointer', padding: '2px 6px' }}>✕</button>
      <style>{NUDGE_CSS}</style>
    </div>
  )
}

// Above the phone's bottom nav: measured 09-26 at 390px, all three products'
// bars end 71px above the screen's bottom edge (62px tall), so the ask sits
// at 82px. Near the bottom edge on desktop, where there is no bar.
const NUDGE_CSS = `.account-nudge{bottom:16px}@media(max-width:760px){.account-nudge{bottom:calc(82px + env(safe-area-inset-bottom))}}`
