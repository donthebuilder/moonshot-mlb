'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT, TYPE } from '../../lib/theme'
import { fetchJSON } from '../../lib/data'
import { dataUrl } from '../../lib/dataSource'
import { callsFromLock } from '../../lib/phone/todayCalls'
import CardSwipe from '../CardSwipe'

// TONIGHT'S CALLS AS CARDS, ON THE HOME PAGE (2026-10-16). The swipe-through built for the phone app, moved onto the real site so there is one place to
// look: one full-width card at a time, tap to flip for why he was called. The list is pick_lock.json (who was called in each game), the same record the
// locked-record rule reads. Nothing renders until there is a list: no empty frame, no invented card.
export default function CallsSwipe({ sport = 'mlb' }) {
  const [calls, setCalls] = useState(null)
  useEffect(() => {
    let alive = true
    fetchJSON([dataUrl('current/pick_lock.json')])
      .then((j) => { if (alive) { const out = callsFromLock(j); setCalls(out.items.length ? out : null) } })
      .catch(() => { /* no list, no section */ })
    return () => { alive = false }
  }, [])
  if (!calls) return null
  return (
    <section aria-label="Tonight's calls as cards" style={{ margin: '0 0 14px', minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: TYPE.label, fontWeight: 900, letterSpacing: '.16em', fontFamily: NUM_FONT, color: C.text3 }}>TONIGHT&apos;S CALLS</span>
        <span style={{ flex: 1, height: 1, background: `linear-gradient(90deg, ${C.orange}66, transparent)` }} />
        <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT }}>{calls.items.length} cards · locked before first pitch</span>
      </div>
      <CardSwipe sport={sport} items={calls.items} />
    </section>
  )
}
