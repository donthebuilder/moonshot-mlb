'use client'
import { NUM_FONT as MLB_NUM } from '../../lib/theme'
import { alpha } from '../../lib/scales'
import { useSportTheme } from '../SportTheme'

// MOONSHOT'S SHORTLIST FRAME (2026-09-29, Donovan on TUDDY's Picks: "figure
// it out" -- build it from MOONSHOT's Bot page). The Shortlist's head line
// ("🎯 Who stands out ... showing N of M scored", the Show-all toggle) and its
// pill rows, lifted out of components/Shortlist.js so TUDDY's Bot page is
// built from them. MOONSHOT reads no SportTheme provider, so it draws the
// exact literals it always drew; TUDDY/LAMP get their accent.

function tint(themed, accent) {
  return themed ? alpha(accent, 0.14) : 'rgba(249,115,22,.14)'
}

/** "🎯 Title  showing N of M scored · every column sorts on click  [Show all]" */
export function ShortlistHead({ title, shown, total, limit, setLimit, cap = 40, noun = 'scored' }) {
  const { C, NUM_FONT, accent, themed } = useSportTheme()
  const all = limit >= total
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 9, flexWrap: 'wrap', marginBottom: 4 }}>
      <span style={{ fontSize: 12.5, fontWeight: 900 }}>{title}</span>
      <span style={{ fontSize: 9.5, color: C.text3 }}>
        showing <b style={{ color: C.text2 }}>{shown}</b> of {total} {noun} ·
        every column sorts on click
      </span>
      {total > cap && (
        <button
          onClick={() => setLimit((v) => (v >= total ? cap : total))}
          style={{
            padding: '2px 9px', borderRadius: 999, cursor: 'pointer', fontSize: 9.5,
            fontWeight: 800, fontFamily: themed ? NUM_FONT : MLB_NUM,
            border: `1px solid ${all ? accent : C.border}`,
            background: all ? tint(themed, accent) : 'transparent',
            color: all ? accent : C.text3,
          }}
        >{all ? `Back to top ${cap}` : `Show all ${total}`}</button>
      )}
    </div>
  )
}

/** A row of Shortlist pills: [[key, label]]. `size` 'view' (10px) or 'pack' (9.5px). */
export function ShortlistPills({ options, value, onChange, size = 'view' }) {
  const { C, NUM_FONT, accent, themed } = useSportTheme()
  return options.map(([k, label]) => (
    <button key={k} onClick={() => onChange(k)} style={{
      padding: size === 'view' ? '3px 11px' : '2.5px 10px', borderRadius: 999, cursor: 'pointer', fontSize: size === 'view' ? 10 : 9.5,
      fontWeight: 800, fontFamily: themed ? NUM_FONT : MLB_NUM,
      border: `1px solid ${value === k ? accent : C.border}`,
      background: value === k ? tint(themed, accent) : 'transparent',
      color: value === k ? accent : C.text3,
    }}>{label}</button>
  ))
}
