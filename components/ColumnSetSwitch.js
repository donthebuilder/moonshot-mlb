'use client'
import { C, NUM_FONT } from '../lib/theme'
import { alpha } from '../lib/scales'
import { COLUMN_SETS } from '../lib/columnViews'

// THE COLUMN-SET SWITCH (Wave 4): Short list / What I read / All, three 44px pills in one row. It lives in
// the board's Filters sheet (components/FiltersDrawer.js `columnSet`), so no board gets a taller header.
// The accent is the product's own; the state is carried by border + fill + aria-pressed, never red or green.
export default function ColumnSetSwitch({ set, onChange, accent = C.orange }) {
  return (
    <div role="group" aria-label="Columns" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
      {COLUMN_SETS.map((v) => {
        const on = set === v.key
        return (
          <button key={v.key} type="button" onClick={() => onChange(v.key)} aria-pressed={on} title={v.title} style={{
            minHeight: 44, minWidth: 44, padding: '0 14px', borderRadius: 10, cursor: 'pointer',
            fontFamily: NUM_FONT, fontSize: 12, fontWeight: on ? 800 : 700,
            border: `1px solid ${on ? accent : C.border2}`,
            background: on ? alpha(accent, 0.14) : 'transparent',
            color: on ? accent : C.text2,
          }}>{v.label}</button>
        )
      })}
    </div>
  )
}
