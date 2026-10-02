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
//   StatStrip    the numbers above the chart, KEY value sub (was ShotPanel's)
//   ViewToggle   the small view buttons over the chart (was Rink's)

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
// `block` (2026-10-01, BATCH-2D-CORE flag 3): a plain block panel for content
// that isn't the chart + readout row (TUDDY's ChartFrame users). `live` +
// `accent`: the 2px status rail on the left edge -- the one cue kept from the
// retired ChartFrame (its grid, brackets, edge ticks and bloom are gone).
export function ChartCard({ children, theme = MLB_C, style = null, className = 'spray-wrap', block = false, live = false, accent = null, ...rest }) {
  return (
    <div className={className} {...rest} style={{
      ...(block ? { display: 'block' } : { display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-start' }),
      position: live ? 'relative' : undefined,
      background: theme.bg2, border: `1px solid ${theme.border}`, borderRadius: 12, padding: 10,
      ...(style || {}),
    }}>
      {live && (
        <span aria-hidden="true" style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 2, borderRadius: '0 2px 2px 0',
          background: `linear-gradient(180deg, ${accent || theme.text2}, ${accent || theme.text2}22)` }} />
      )}
      {children}
    </div>
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

/** stats: [{ k, v, sub, title, tone }] -- the shown plays in numbers, one line, above the chart
 *  (lifted from components/lamp/ShotPanel.js unchanged, 2026-10-02). */
export function StatStrip({ stats = [], theme = MLB_C, numFont = MLB_NUM, label = 'The shown plays, in numbers' }) {
  return (
    <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontFamily: numFont }} aria-label={label}>
      {stats.map((x) => (
        <span key={x.k} title={x.title || undefined} style={{ display: 'inline-flex', alignItems: 'baseline', gap: 4, whiteSpace: 'nowrap' }}>
          <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: theme.text3 }}>{x.k}</span>
          <span style={{ fontSize: 15, fontWeight: 900, color: x.tone || theme.text }}>{x.v ?? '—'}</span>
          {x.sub ? <span style={{ fontSize: 10, color: theme.text3 }}>{x.sub}</span> : null}
        </span>
      ))}
    </div>
  )
}

/** views: [{ k, label }]; `extra` rides at the end (a 3D toggle) -- lifted from components/lamp/Rink.js unchanged. */
export function viewBtn(on, accent, theme = MLB_C, numFont = MLB_NUM) {
  return { padding: '4px 10px', borderRadius: 7, cursor: 'pointer', font: `800 9px/1 ${numFont}`, letterSpacing: '.08em', border: `1px solid ${on ? accent : theme.border2}`, background: on ? `${accent}1f` : 'transparent', color: on ? accent : theme.text3 }
}
export function ViewToggle({ views = [], value, onChange, accent, extra = null, theme = MLB_C, numFont = MLB_NUM, label = 'Map view' }) {
  return (
    <div role="group" aria-label={label} style={{ display: 'inline-flex', gap: 4 }}>
      {views.map((v) => (
        <button key={v.k} type="button" onClick={() => onChange(v.k)} aria-pressed={value === v.k} title={v.title || undefined} style={viewBtn(value === v.k, accent, theme, numFont)}>
          {v.label}
        </button>
      ))}
      {extra}
    </div>
  )
}
