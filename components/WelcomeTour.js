'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../lib/theme'

// THE FIRST-VISIT TOUR (2026-10-16, Phase 1 step 3; Donovan: "after they sign up take them to the card inside the app, or maybe a tutorial").
// The card landing sends a new account here with ?welcome=1. Three short steps, skippable, shown once per device
// (localStorage 'dash_tour_v1'); the flag is stripped from the address afterwards so a refresh or a shared link never replays it.
// A bottom sheet, not a modal wall: the board stays behind it. 44px buttons, safe-area padding, scrolls if a phone is turned sideways.
const KEY = 'dash_tour_v1'
const STEPS = [
  { head: 'This is the call', body: 'Every pick here is locked before the game starts. Hits and misses are both counted, in public.' },
  { head: 'Tap a card to flip it', body: 'The back shows why he was picked: the numbers behind the call, in plain words.' },
  { head: 'Follow a player', body: 'Tap Follow on anyone and your phone tells you when it matters. Alerts are free.' },
]

const seen = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }
const remember = () => { try { localStorage.setItem(KEY, '1') } catch { /* private window: it just shows again next time */ } }

export default function WelcomeTour() {
  const [step, setStep] = useState(-1)   // -1 = not showing
  useEffect(() => {
    let flagged = false
    try { flagged = new URLSearchParams(window.location.search).get('welcome') === '1' } catch { flagged = false }
    if (flagged && !seen()) setStep(0)
  }, [])
  if (step < 0) return null
  const done = () => {
    remember()
    setStep(-1)
    try {
      const u = new URL(window.location.href)
      u.searchParams.delete('welcome')
      window.history.replaceState(window.history.state, '', `${u.pathname}${u.search}${u.hash}`)
    } catch { /* the address keeps the flag; the tour is remembered anyway */ }
  }
  const last = step === STEPS.length - 1
  const s = STEPS[step]
  const btn = { minHeight: 44, minWidth: 44, padding: '0 18px', borderRadius: 10, font: 'inherit', fontWeight: 800, cursor: 'pointer' }
  return (
    <div role="dialog" aria-label="Welcome tour" aria-modal="false"
      style={{ position: 'fixed', left: 0, right: 0, zIndex: 90, padding: '0 12px', bottom: 'calc(96px + env(safe-area-inset-bottom))', pointerEvents: 'none' }}>
      <div style={{ pointerEvents: 'auto', maxWidth: 480, margin: '0 auto', maxHeight: '45vh', overflowY: 'auto', background: C.bg2, border: `1px solid ${C.border}`, borderRadius: 14, padding: '14px 16px', color: C.text, boxShadow: `0 -6px 24px ${C.shadow}` }}>
        <div style={{ fontFamily: NUM_FONT, fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.14em', color: C.orange }}>{step + 1} OF {STEPS.length}</div>
        <div style={{ fontSize: TYPE.title, fontWeight: 800, margin: '4px 0 4px' }}>{s.head}</div>
        <div style={{ fontSize: TYPE.name, color: C.text2, lineHeight: 1.5 }}>{s.body}</div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'space-between', marginTop: 12 }}>
          <button type="button" onClick={done} style={{ ...btn, background: 'transparent', border: `1px solid ${C.border}`, color: C.text2 }}>Skip</button>
          <button type="button" onClick={() => (last ? done() : setStep(step + 1))} style={{ ...btn, background: C.orange, border: `1px solid ${C.orange}`, color: C.bg }}>{last ? 'Got it' : 'Next'}</button>
        </div>
      </div>
    </div>
  )
}
