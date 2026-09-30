'use client'
import { usePickLight, pickColorOf } from '../lib/pickLight'
import { alpha } from '../lib/scales'
import { useSportTheme } from './SportTheme'

// ✨ WHO YOU HIGHLIGHTED (2026-09-30, lib/pickLight.js). The one line that
// says the tap highlight is on and for whom, above every page of a product
// while it is -- a name opens his card, × drops him, Clear empties the set.
// Nothing renders while the set is empty, so a page nobody has highlighted on
// looks exactly as it did.
export default function HighlightBar({ sport, onOpen }) {
  const { C, NUM_FONT } = useSportTheme()
  const pick = usePickLight(sport)
  if (!pick.count) return null
  const col = pickColorOf(C)
  const names = Object.entries(pick.map)
  return (
    <div role="status" aria-label="Highlighted players" style={{
      display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap',
      margin: '0 0 10px', padding: '6px 10px', borderRadius: 10,
      border: `1px solid ${alpha(col, 0.45)}`, background: alpha(col, 0.07),
    }}>
      <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.08em', color: col, fontFamily: NUM_FONT }}>
        ✨ HIGHLIGHTED · {names.length}
      </span>
      {names.map(([id, name]) => (
        <span key={id} style={{ display: 'inline-flex', alignItems: 'center', border: `1px solid ${alpha(col, 0.5)}`, borderRadius: 999, background: alpha(col, 0.12) }}>
          <button type="button" onClick={() => onOpen?.(id)} title={`Open ${name || 'his card'}`}
            style={{ minHeight: 36, padding: '0 4px 0 10px', border: 0, background: 'transparent', color: C.text, fontSize: 11, fontWeight: 700, cursor: onOpen ? 'pointer' : 'default' }}>
            {name || id}
          </button>
          <button type="button" onClick={() => pick.toggle(id)} aria-label={`Stop highlighting ${name || id}`}
            style={{ minWidth: 36, minHeight: 36, border: 0, background: 'transparent', color: C.text3, fontSize: 12, cursor: 'pointer' }}>×</button>
        </span>
      ))}
      <button type="button" onClick={pick.clear}
        style={{ marginLeft: 'auto', minHeight: 36, padding: '0 10px', borderRadius: 8, border: `1px solid ${C.border}`, background: 'transparent', color: C.text3, fontSize: 10.5, fontWeight: 800, fontFamily: NUM_FONT, cursor: 'pointer' }}>
        Clear
      </button>
    </div>
  )
}
