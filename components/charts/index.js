'use client'
import { C as MLB_C, NUM_FONT as MLB_NUM } from '../../lib/theme'

// THE SHARED CHART CORE (2026-09-30, BATCH-NFL-FIELD). Lifted out of
// components/SprayField.js style for style, so every drawn chart on the
// network -- MOONSHOT's spray chart, LAMP's shot map, TUDDY's Field -- sits
// in the same frame, filters with the same chips, keys with the same legend
// and says "nothing here" the same way. One system, not four. Every piece
// takes the product's theme (default: MOONSHOT's), never a hex of its own.
//
//   ChartCard    the framed panel the field sits in (SprayField .spray-wrap)
//   ChipGroup    small-caps label + counted chips (was matchup/SprayParts)
//   ChartLegend  the key, built from what is drawn
//   ChartEmpty   the honest empty / loading / error line

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
export function ChipGroup({ label, options, value, onChange, color, first = false, theme = MLB_C, numFont = MLB_NUM, chipStyle = null }) {
  return (
    <>
      {label ? <span style={{ fontSize: 9, color: theme.text3, textTransform: 'uppercase', letterSpacing: '.07em', ...(first ? {} : { marginLeft: 6 }) }}>{label}</span> : null}
      {options.map(({ k, label: l, n, title }) => (
        <button key={k} type="button" onClick={() => onChange(k)} disabled={n === 0 && k !== 'ALL'}
          title={title} aria-pressed={value === k}
          style={{ ...chipBtn(value === k, color, theme, numFont), opacity: (n || n == null || k === 'ALL') ? 1 : 0.35, ...(chipStyle || {}) }}>
          {l}{k !== 'ALL' && n != null && <span style={{ opacity: 0.65 }}> {n}</span>}
        </button>
      ))}
    </>
  )
}

/** The framed panel. `className` keeps SprayField's phone hook (.spray-wrap). */
export function ChartCard({ children, theme = MLB_C, style = null, className = 'spray-wrap', ...rest }) {
  return (
    <div className={className} {...rest} style={{
      display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start',
      background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 10,
      ...(style || {}),
    }}>{children}</div>
  )
}

/** items: [{ key, mark, label }] -- mark is a node (a glyph or a tiny svg). */
export function ChartLegend({ items, theme = MLB_C, style = null }) {
  if (!items?.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontSize: 9.5, color: theme.text3, lineHeight: 1.6, ...(style || {}) }}>
      {items.map((it) => (
        <span key={it.key || it.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
          {it.mark}{it.label}
        </span>
      ))}
    </div>
  )
}

export function ChartEmpty({ children, theme = MLB_C, style = null }) {
  return <div style={{ fontSize: 11, color: theme.text3, padding: '10px 0', lineHeight: 1.6, ...(style || {}) }}>{children}</div>
}
