'use client'
import { useSportTheme } from '../SportTheme'
import { explain } from '../../lib/explain'
import { alpha } from '../../lib/scales'

// THE CHECKLIST (2026-10-21, Donovan: the read up top, "more visual than textual"). His own rules as tiles: the rule's
// label, one big number, a little line under it. A tile that passes lights in the product's accent with a ✓; a fail is
// quiet with a –; no data is a dash and dimmed (never counted). Tap a tile: what the rule is and how it tested.
// rows: [{ key, label, rule, tested, pass: true|false|null, big, small }] from the sport's own rule file
// (MOONSHOT: lib/mlb/checklist.js). The sport decides the rules; this only draws them.
export default function Checklist({ rows, title = 'THE CHECKLIST', style }) {
  const { C, NUM_FONT, accent } = useSportTheme()
  if (!rows?.length) return null
  const known = rows.filter((r) => r.pass != null)
  const passed = rows.filter((r) => r.pass === true).length
  return (
    <div style={{ margin: '4px 0 12px', ...style }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}>
        <span style={{ font: `900 12px/1 ${NUM_FONT}`, letterSpacing: '.08em', color: C.text }}>{title}</span>
        <span style={{ font: `900 18px/1 ${NUM_FONT}`, color: passed ? accent : C.text3 }}>{passed}</span>
        <span style={{ font: `700 11px/1 ${NUM_FONT}`, color: C.text3 }}>of {known.length} pass</span>
      </div>
      <div className="checklist-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(112px, 1fr))', gap: 6 }}>
        {rows.map((r) => {
          const on = r.pass === true
          const none = r.pass == null
          const tip = `${r.label}: ${r.rule}.${r.small && !none ? ` Tonight: ${r.big} (${r.small}).` : ''} Tested on the 2026 board: ${r.tested}.`
          return (
            <button key={r.key} type="button" title={tip} onClick={() => explain(r.label, tip)}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'space-between', minHeight: 72, minWidth: 0,
                padding: '7px 9px 8px', borderRadius: 3, cursor: 'pointer', textAlign: 'left', font: 'inherit',
                border: `1px solid ${on ? alpha(accent, 0.7) : C.border}`, background: on ? alpha(accent, 0.1) : 'transparent',
                opacity: none ? 0.55 : 1,
              }}>
              <span style={{ display: 'flex', width: '100%', justifyContent: 'space-between', gap: 4, font: `800 10px/1.1 ${NUM_FONT}`, letterSpacing: '.07em', color: on ? accent : C.text3 }}>
                <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.label}</span>
                <span aria-label={on ? 'passes' : none ? 'no data' : 'does not pass'}>{on ? '✓' : '–'}</span>
              </span>
              <span style={{ font: `900 22px/1.1 ${NUM_FONT}`, color: on ? C.text : C.text2, marginTop: 4, whiteSpace: 'nowrap' }}>{r.big}</span>
              <span style={{ fontSize: 10.5, lineHeight: 1.25, color: C.text3, marginTop: 2 }}>{r.small}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
