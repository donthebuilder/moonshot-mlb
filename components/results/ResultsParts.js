'use client'
import { TYPE } from '../../lib/theme'
import { alpha } from '../../lib/scales'
import { useSportTheme } from '../SportTheme'
import { flatChip, FLAT_CHIP_CLASS } from '../../lib/chips'

// MOONSHOT'S RESULTS FRAME, IN PARTS (2026-09-30, Donovan: "upgrade the
// results pages to fit the mlb components for each sport"). The two rows at
// the top of MOONSHOT's Results (components/tabs/Results.js): the question
// buttons (This night / All season / ...) and the view pills under them.
// TUDDY's record carried hand copies in green; LAMP's record had neither.
// MOONSHOT reads no SportTheme provider and draws exactly what it drew.

/** modes: [[key, label, question]] */
export function ModeBar({ modes, mode, setMode }) {
  const { C, accent, themed } = useSportTheme()
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 11, flexWrap: 'wrap' }}>
      {modes.map(([k, label, question]) => {
        const on = mode === k
        return (
          <button
            key={k} onClick={() => setMode(k)}
            style={{
              flex: '1 1 170px', minWidth: 0, textAlign: 'left', cursor: 'pointer',
              padding: '7px 13px', borderRadius: 11,
              border: `1px solid ${on ? accent : C.border}`,
              background: on ? (themed ? alpha(accent, 0.13) : 'rgba(249,115,22,.13)') : 'rgba(255,255,255,.03)',
            }}
          >
            <div style={{ fontSize: TYPE.name, fontWeight: 900, color: on ? accent : C.text2 }}>{label}</div>
            <div style={{ fontSize: TYPE.micro, color: C.text3, marginTop: 1 }}>{question}</div>
          </button>
        )
      })}
    </div>
  )
}

export function TabBtn({ active, onClick, children }) {
  // flat and square like every chip (2026-10-21, chips batch); it was a round 999 pill
  const { C, accent, NUM_FONT } = useSportTheme()
  return (
    <button onClick={onClick} className={FLAT_CHIP_CLASS} style={flatChip(active, accent, C, NUM_FONT)}>{children}</button>
  )
}

/** The view row: [[key, label]]. */
export function ViewRow({ views, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap', alignItems: 'center' }}>
      {views.map(([k, label]) => (
        <TabBtn key={k} active={value === k} onClick={() => onChange(k)}>{label}</TabBtn>
      ))}
    </div>
  )
}
