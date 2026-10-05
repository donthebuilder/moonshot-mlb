'use client'
// THE TONIGHT STRIP (2026-10-04, Donovan approved the shape): three rows at the
// top of every Home -- WENT, LINING UP, STILL TO GO -- three names each and a
// "+N" that opens the rest; the full Ledger is one tap below. The rows come from
// lib/tonight.js (pure, one builder per sport); this only draws them, in the
// product's own theme (SportTheme; MOONSHOT falls back to lib/theme).
// STILL TO GO marks each man live (⚡) or still to start (⏳) and says CALLED or
// BOARD on the row itself -- never on hover only.
import { useState } from 'react'
import { useSportTheme } from './SportTheme'
import CallStatusBadge from './CallStatusBadge'

const SHOW = 3

function Row({ label, items, onOpen, C, NUM_FONT, kind }) {
  const [open, setOpen] = useState(false)
  if (!items?.length) return null
  const shown = open ? items : items.slice(0, SHOW)
  const rest = items.length - SHOW
  return (
    // the label sits ABOVE the names (a side column left 3 names no room at 390 and the
    // row grew to 3 lines); each name keeps a 44 px target through its padding, pulled
    // back with a negative margin so a row of names reads as one line
    <div style={{ minWidth: 0, borderTop: `1px solid ${C.border}`, padding: '7px 0 8px' }}>
      <div style={{ font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.08em', color: C.text3 }}>{label}</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', columnGap: 12, rowGap: 20, minWidth: 0, marginTop: 2 }}>
        {shown.map((x) => (
          <button key={x.id} type="button" onClick={onOpen ? () => onOpen(x.id, x) : undefined}
            style={{ minHeight: 44, margin: '-10px 0', display: 'inline-flex', alignItems: 'center', gap: 5, padding: 0, border: 0, background: 'transparent', color: C.text, cursor: onOpen ? 'pointer' : 'default', font: 'inherit', textAlign: 'left' }}>
            <span style={{ fontSize: 13, fontWeight: 800 }}>{x.name}</span>
            {kind === 'still' && <span aria-label={x.when === 'now' ? 'live' : 'still to start'} style={{ fontSize: 11 }}>{x.when === 'now' ? '⚡' : '⏳'}</span>}
            {kind === 'still' && x.status && <CallStatusBadge status={x.status} short size={11} />}
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
      <Row label={words.went || 'WENT'} items={data.went} onOpen={onOpen} C={C} NUM_FONT={NUM_FONT} kind="went" />
      <Row label="LINING UP" items={data.lining} onOpen={onOpen} C={C} NUM_FONT={NUM_FONT} kind="lining" />
      <Row label="STILL TO GO" items={data.still} onOpen={onOpen} C={C} NUM_FONT={NUM_FONT} kind="still" />
    </section>
  )
}
