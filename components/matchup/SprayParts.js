'use client'
import { C as MLB_C, NUM_FONT as MLB_NUM } from '../../lib/theme'

// THE SPRAY CHART'S FILTER CHIPS, SHARED (2026-09-29, Donovan: "make [where
// he shoots from] better, just like the spray chart"). Lifted out of
// components/SprayField.js style for style: a small caps label, then chips
// that each carry their count over what is in the window, dimmed and disabled
// at zero, one colour per group. LAMP's shot map filters with the same chips.

export function chipBtn(on, col, theme = MLB_C, numFont = MLB_NUM) {
  return {
    padding: '3px 9px', fontSize: 10, fontWeight: 700, borderRadius: 6,
    cursor: 'pointer', fontFamily: numFont,
    border: `1px solid ${on ? col : theme.border}`,
    background: on ? `${col}22` : 'transparent',
    color: on ? col : theme.text3,
  }
}

/** options: [{ k, label, n, title }] -- n is the count in the window ('ALL' shows none). */
export function ChipGroup({ label, options, value, onChange, color, first = false, theme = MLB_C, numFont = MLB_NUM }) {
  return (
    <>
      <span style={{ fontSize: 9, color: theme.text3, textTransform: 'uppercase', letterSpacing: '.07em', ...(first ? {} : { marginLeft: 6 }) }}>{label}</span>
      {options.map(({ k, label: l, n, title }) => (
        <button key={k} onClick={() => onChange(k)} disabled={n === 0 && k !== 'ALL'}
          title={title}
          style={{ ...chipBtn(value === k, color, theme, numFont), opacity: (n || k === 'ALL') ? 1 : 0.35 }}>
          {l}{k !== 'ALL' && <span style={{ opacity: 0.65 }}> {n}</span>}
        </button>
      ))}
    </>
  )
}
