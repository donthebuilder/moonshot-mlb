'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { C, NUM_FONT, TYPE } from '../lib/theme'
import { setViewChoice, wantedView, phoneShellOn } from '../lib/viewMode'
import { sportKey, appHref } from '../lib/routes'

// The two buttons between the phone app and the full site, and the one redirect that picks a side.
// PhoneSegment: the header switch inside the phone app (PHONE | FULL SITE). PhoneViewPill: the corner pill on the full site.
const sportFromHash = () => { try { return sportKey(new URLSearchParams(window.location.hash.replace(/^#/, '')).get('sport')) } catch { return 'mlb' } }

export function PhoneSegment({ sport = 'mlb' }) {
  const router = useRouter()
  const seg = (on) => ({ minHeight: 36, minWidth: 44, padding: '0 12px', borderRadius: 999, border: 'none', cursor: 'pointer', font: 'inherit', fontFamily: NUM_FONT, fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.08em', background: on ? C.orange : 'transparent', color: on ? C.bg : C.text2, boxShadow: on ? `0 0 14px ${C.orange}66` : 'none' })
  return (
    <div role="group" aria-label="Phone app or full site" style={{ display: 'inline-flex', padding: 3, gap: 2, border: `1px solid ${C.border}`, borderRadius: 999, background: C.bg2 }}>
      <button type="button" aria-pressed="true" style={seg(true)}>PHONE</button>
      <button type="button" aria-pressed="false" style={seg(false)} onClick={() => { setViewChoice('full'); router.push(appHref(sport)) }}>FULL SITE</button>
    </div>
  )
}

export function PhoneViewPill() {
  const router = useRouter()
  if (!phoneShellOn()) return null
  return (
    <button type="button" onClick={() => { setViewChoice('phone'); router.push(`/m?sport=${sportFromHash()}`) }} aria-label="Open the phone app"
      style={{ position: 'fixed', right: 14, bottom: 'calc(14px + env(safe-area-inset-bottom))', zIndex: 80, display: 'flex', alignItems: 'center', gap: 8, minHeight: 44, padding: '0 16px', borderRadius: 999, border: `1px solid ${C.orange}`, background: C.orange, color: C.bg, font: 'inherit', fontWeight: 800, fontSize: TYPE.name, cursor: 'pointer', boxShadow: `0 8px 26px ${C.orange}55` }}>
      <span aria-hidden="true">📱</span> Phone view
    </button>
  )
}

/** On the full site: a phone (or a saved 'phone' choice) goes to the phone app. A saved 'full' choice always stays. */
export function ViewRouter() {
  const router = useRouter()
  useEffect(() => {
    if (!phoneShellOn()) return
    if (wantedView() === 'phone') router.replace(`/m?sport=${sportFromHash()}`)
  }, [router])
  return null
}
