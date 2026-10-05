'use client'
// THE TONIGHT STRIP (2026-10-04, Donovan approved the shape): three rows at the
// top of every Home -- WENT, LINING UP, STILL TO GO -- three names each and a
// "+N" that opens the rest; the full Ledger is one tap below. The rows come from
// lib/tonight.js (pure, one builder per sport); this only draws them, in the
// product's own theme (SportTheme; MOONSHOT falls back to lib/theme).
// STILL TO GO marks each man live (⚡) or still to start (⏳); CALLED names wear the
// product's colour with the key ('■ CALLED') on the row's label (Donovan 10-05 chose
// this compact form over a stamp per name) -- never on hover only.
import { useState } from 'react'
import { useSportTheme } from './SportTheme'
import { surname } from '../lib/player'
import { STATUS_WORD } from '../lib/callStatus'

// a surname keeps its particle ("Amon-Ra St. Brown" -> "St. Brown", not "Brown")
const PARTICLE = /^(st\.?|de|del|della|di|da|van|von|der|den|le|la|du|mc|o')$/i
function short(name) {
  const parts = String(name || '').trim().split(/\s+/)
  const last = surname(name)
  const before = parts[parts.length - last.split(' ').length - 1]
  return before && PARTICLE.test(before) ? `${before} ${last}` : last
}

const SHOW = 3

function Row({ label, items, onOpen, C, NUM_FONT, kind, accent }) {
  const [open, setOpen] = useState(false)
  if (!items?.length) return null
  const shown = open ? items : items.slice(0, SHOW)
  const rest = items.length - SHOW
  return (
    // the label sits ABOVE the names (a side column left 3 names no room at 390 and the
    // row grew to 3 lines); each name keeps a 44 px target through its padding, pulled
    // back with a negative margin so a row of names reads as one line
    <div style={{ minWidth: 0, borderTop: `1px solid ${C.border}`, padding: '7px 0 8px' }}>
      <div style={{ font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.08em', color: C.text3 }}>
        {label}
        {/* the key for STILL TO GO's colour, in the status word itself (lib/callStatus) */}
        {kind === 'still' && items.some((x) => x.status === 'called') && <span style={{ marginLeft: 8, color: accent }}>■ {STATUS_WORD.called}</span>}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 20, minWidth: 0, marginTop: 2 }}>
        {shown.map((x) => (
          <button key={x.id} type="button" onClick={onOpen ? () => onOpen(x.id, x) : undefined}
            aria-label={[x.name, kind === 'still' ? (x.when === 'now' ? 'live' : 'still to start') : null, kind === 'still' && x.status ? STATUS_WORD[x.status] : null, x.note].filter(Boolean).join(', ')}
            style={{ minHeight: 44, margin: '-10px 0', display: 'inline-flex', alignItems: 'center', gap: 5, padding: 0, border: 0, background: 'transparent', color: C.text, cursor: onOpen ? 'pointer' : 'default', font: 'inherit', textAlign: 'left' }}>
            {/* surnames keep three on one line at 390; the full name is on the button for
                screen readers, and CALLED is said in words there too (colour isn't the only cue:
                the row's label carries the key) */}
            <span style={{ fontSize: 13, fontWeight: 800, color: kind === 'still' && x.status === 'called' ? accent : C.text }}>{short(x.name)}</span>
            {kind === 'still' && <span aria-hidden="true" style={{ fontSize: 11 }}>{x.when === 'now' ? '⚡' : '⏳'}</span>}
            {x.note && <span style={{ fontSize: 11, fontFamily: NUM_FONT, color: C.text3, fontWeight: 700 }}>{x.note}</span>}
          </button>
        ))}
        {rest > 0 && (
          <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open}
            style={{ minHeight: 44, minWidth: 44, margin: '-10px 0', padding: '0 4px', border: 0, background: 'transparent', color: C.text2, font: `800 11px/1 ${NUM_FONT}`, cursor: 'pointer' }}>
            {open ? 'less' : `+${rest}`}
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * @param data    { went, lining, still } from lib/tonight.js
 * @param onOpen  (id, item) => open his card
 * @param onLedger open the sport's full Ledger
 */
export default function TonightStrip({ data, onOpen, onLedger, words = {} }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  if (!data || !(data.went?.length || data.lining?.length || data.still?.length)) return null
  return (
    <section aria-label="Tonight" style={{ border: `1px solid ${C.border}`, borderRadius: 12, padding: '8px 12px 4px', margin: '0 0 12px', background: C.bg2, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', minHeight: 30 }}>
        <span style={{ font: `900 11px/1 ${NUM_FONT}`, letterSpacing: '.12em', color: accent }}>TONIGHT</span>
        {onLedger && (
          <button type="button" onClick={onLedger} style={{ minHeight: 44, margin: '-7px 0', padding: '0 2px', border: 0, background: 'transparent', color: C.text2, font: `800 11px/1 ${NUM_FONT}`, cursor: 'pointer' }}>full Ledger ›</button>
        )}
      </div>
      <Row label={words.went || 'WENT'} items={data.went} onOpen={onOpen} C={C} NUM_FONT={NUM_FONT} accent={accent} kind="went" />
      <Row label="LINING UP" items={data.lining} onOpen={onOpen} C={C} NUM_FONT={NUM_FONT} accent={accent} kind="lining" />
      <Row label="STILL TO GO" items={data.still} onOpen={onOpen} C={C} NUM_FONT={NUM_FONT} accent={accent} kind="still" />
    </section>
  )
}
