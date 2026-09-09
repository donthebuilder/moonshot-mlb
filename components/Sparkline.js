'use client'
import { C, NUM_FONT } from '../lib/theme'

// ▪▪·▪ THE STRIP — a hitter's recent games as one glance.
//
// 2026-08-15, from a competitor's player board Donovan sent: a row of marks,
// filled when he cleared the bar, empty when he didn't, newest on the right.
// It is the cheapest honest visual in this whole product — no axis to read, no
// number to convert, and the shape of a slump and the shape of a run look
// nothing like each other.
//
// TWO THINGS THE ORIGINAL DOESN'T DO, both worth the pixels:
//
//   · THE ACTIVE RUN IS BRIGHTER than the rest of the strip. Three hits in the
//     last three games and three hits scattered across ten are the same count
//     and not remotely the same bet, and a flat strip makes you count squares
//     to tell them apart.
//   · EVERY MARK CARRIES ITS GAME. Hovering says the date, the opponent, what
//     he actually did and whether it was a day game — so the strip is a way
//     into the log rather than a decoration on top of it.

export default function Sparkline({ strip = [], run = 0, size = 7, gap = 2, max = 30 }) {
  if (!strip.length) return null
  const shown = strip.slice(-max)
  // The active run lives at the END of the strip (newest last). Only mark it
  // when it's a hit streak — a cold run is already obvious as a wall of empty.
  const live = run > 0 ? Math.min(run, shown.length) : 0
  const from = shown.length - live

  return (
    <span style={{ display: 'inline-flex', gap, alignItems: 'center', lineHeight: 1 }}>
      {shown.map((s, i) => {
        const inRun = live > 0 && i >= from
        return (
          <span
            key={`${s.date}-${i}`}
            title={`${s.date} ${s.home ? 'vs' : '@'} ${s.opp} · ${s.v}${s.dn ? ` · ${s.dn === 'D' ? 'day' : 'night'} game` : ''} — ${s.on ? 'cleared' : 'missed'}`}
            style={{
              width: size, height: size, borderRadius: 1.5, flexShrink: 0,
              background: s.on ? (inRun ? '#4ade80' : 'rgba(74,222,128,.42)') : 'rgba(255,255,255,.10)',
              boxShadow: inRun ? '0 0 4px rgba(74,222,128,.55)' : 'none',
            }}
          />
        )
      })}
    </span>
  )
}

/**
 * The labelled game strip — the same games with their numbers and dates.
 *
 * The dense version above is for a row in a list. This is for the one hitter
 * you actually opened, where the question stops being "what shape is he" and
 * becomes "what did he do on the 8th".
 */
export function GameStrip({ strip = [], max = 15 }) {
  const shown = strip.slice(-max)
  if (!shown.length) return null
  return (
    <div className="dense-scroll rail" style={{ display: 'flex', gap: 4, overflowX: 'auto', paddingBottom: 3 }}>
      {shown.map((s, i) => (
        <div key={`${s.date}-${i}`} title={`${s.date} ${s.home ? 'vs' : '@'} ${s.opp}${s.dn ? ` · ${s.dn === 'D' ? 'day' : 'night'}` : ''}`}
          style={{
            flex: '0 0 auto', minWidth: 42, textAlign: 'center', borderRadius: 7,
            padding: '5px 6px',
            background: s.on ? 'rgba(74,222,128,.14)' : 'rgba(255,255,255,.03)',
            border: `1px solid ${s.on ? 'rgba(74,222,128,.34)' : C.border}`,
          }}>
          <div style={{
            fontFamily: NUM_FONT, fontSize: 13, fontWeight: 900,
            color: s.on ? '#4ade80' : C.text3,
          }}>{s.v}</div>
          <div style={{ fontFamily: NUM_FONT, fontSize: 7.5, color: C.text3, whiteSpace: 'nowrap' }}>
            {s.date} {s.home ? '' : '@'}{s.opp}
          </div>
        </div>
      ))}
    </div>
  )
}
