'use client'
import { C as MLB_C, NUM_FONT as MLB_NUM, TYPE as MLB_TYPE } from '../../lib/theme'

// THE MATCHUP DETAIL, ONCE (2026-09-28). MOONSHOT's Matchups detail
// (components/tabs/Matchups.js) lifted out style for style -- CLAUDE.md:
// MOONSHOT's components are the base -- so TUDDY's defence detail is built
// from the same pieces instead of its own framed charts (Donovan: "not
// professional ... the grid background is distracting, the last two charts
// are confusing"). Defaults are MOONSHOT's; TUDDY passes its theme and accent.
//
//   MatchupTitle  the name line: "Jared Jones · PIT vs DET · tap another row above to switch"
//   SubLabel      the small caps section label ("HIS PITCH MIX")
//   BarList       labelled share bars (a pitch mix, a coverage mix)
//   FactLines     "Handedness: …" / "Park: …" -- one plain sentence each
//   HeatTiles     the zone grid: a big number and a small one per tile, more
//                 accent = more of what the lead sentence is about

export function MatchupTitle({ name, meta, theme = MLB_C, numFont = MLB_NUM, type = MLB_TYPE }) {
  return (
    <h2 style={{ margin: '0 0 8px', fontSize: type.title, fontWeight: 900 }}>
      {name} <span style={{ fontFamily: numFont, fontSize: 11, color: theme.text3, fontWeight: 600 }}>· {meta}</span>
    </h2>
  )
}

export function SubLabel({ children, theme = MLB_C, numFont = MLB_NUM, style }) {
  return <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.1em', color: theme.text3, fontFamily: numFont, marginBottom: 5, ...style }}>{children}</div>
}

/** items: [{ key, label, pct (0-100, the bar), text (the right-hand figure) }] */
export function BarList({ label, items = [], accent, theme = MLB_C, numFont = MLB_NUM, labelWidth = 40 }) {
  if (!items.length) return null
  const fill = accent || theme.orange
  return (
    <div style={{ marginBottom: 12 }}>
      {label ? <SubLabel theme={theme} numFont={numFont}>{label}</SubLabel> : null}
      <div style={{ display: 'grid', gap: 4, maxWidth: 420 }}>
        {items.map((p) => (
          <div key={p.key} style={{ display: 'grid', gridTemplateColumns: `${labelWidth}px 1fr 44px`, alignItems: 'center', gap: 8, fontSize: 12 }}>
            <b style={{ fontFamily: numFont }}>{p.label}</b>
            <span style={{ height: 10, borderRadius: 5, background: theme.bg3, position: 'relative' }}><span style={{ position: 'absolute', inset: 0, width: `${Math.max(0, Math.min(100, p.pct))}%`, borderRadius: 5, background: fill }} /></span>
            <span style={{ fontFamily: numFont, textAlign: 'right', color: theme.text2 }}>{p.text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** lines: [[label, node]] -- one sentence each; a null node drops the line. */
export function FactLines({ lines = [], theme = MLB_C }) {
  const shown = lines.filter(([, v]) => v != null && v !== false)
  if (!shown.length) return null
  return (
    <div style={{ fontSize: 12.5, lineHeight: 1.6, color: theme.text2, marginBottom: 12 }}>
      {shown.map(([k, v]) => <div key={k}><b style={{ color: theme.text }}>{k}:</b> {v}</div>)}
    </div>
  )
}

/**
 * cells: [{ key, big, small, heat (0-1, or null = no colour), title }], in row order.
 * rowLabels / colLabels are optional axis words (MOONSHOT's zones need none).
 */
export function HeatTiles({
  label, lead, legend, cells = [], cols = 3, hotKey = null, accent,
  rowLabels = null, colLabels = null, rowLabelWidth = 64, maxWidth = 300, aspect = '1.2 / 1',
  theme = MLB_C, numFont = MLB_NUM,
}) {
  const ink = accent || theme.orange
  const axis = { fontFamily: numFont, fontSize: 10, fontWeight: 800, color: theme.text3, letterSpacing: '.04em', lineHeight: 1.2 }
  const tile = (c) => (
    <div key={c.key} title={c.title}
      style={{ aspectRatio: aspect, borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
        background: c.heat == null ? theme.bg2 : `color-mix(in srgb, ${ink} ${Math.round(8 + c.heat * 55)}%, ${theme.bg2})`,
        outline: hotKey != null && hotKey === c.key ? `2px solid ${ink}` : 'none', outlineOffset: 1 }}>
      <b style={{ fontFamily: numFont, fontSize: 13, color: theme.text }}>{c.big}</b>
      {c.small != null ? <span style={{ fontFamily: numFont, fontSize: 10, color: theme.text2 }}>{c.small}</span> : null}
    </div>
  )
  const rows = []
  for (let i = 0; i < cells.length; i += cols) rows.push(cells.slice(i, i + cols))
  return (
    <div style={{ marginBottom: 12 }}>
      {label ? <SubLabel theme={theme} numFont={numFont}>{label}</SubLabel> : null}
      {lead ? <p style={{ margin: '0 0 8px', fontSize: 12.5, lineHeight: 1.5, color: theme.text2 }}>{lead}</p> : null}
      {rowLabels || colLabels ? (
        <div style={{ display: 'grid', gridTemplateColumns: `${rowLabels ? `${rowLabelWidth}px ` : ''}repeat(${cols}, minmax(0, 1fr))`, gap: 3, maxWidth, alignItems: 'center' }}>
          {colLabels ? <>{rowLabels ? <span /> : null}{colLabels.map((l) => <span key={l} style={{ ...axis, textAlign: 'center' }}>{l}</span>)}</> : null}
          {rows.map((r, i) => (
            <div key={i} style={{ display: 'contents' }}>
              {rowLabels ? <span style={axis}>{rowLabels[i]}</span> : null}
              {r.map(tile)}
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gap: 3, maxWidth }}>
          {cells.map(tile)}
        </div>
      )}
      {legend ? <div style={{ marginTop: 5, fontSize: 11, color: theme.text3, lineHeight: 1.5 }}>{legend}</div> : null}
    </div>
  )
}
