'use client'
import TeamMark from '../TeamMark'
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

// `logo` = { sport, abbr }: the club's logo before the name (Donovan 10-01:
// "logo need to be on the standings and on the match up components").
export function MatchupTitle({ name, meta, theme = MLB_C, numFont = MLB_NUM, type = MLB_TYPE, logo = null }) {
  return (
    <h2 style={{ margin: '0 0 8px', fontSize: type.title, fontWeight: 900 }}>
      {logo?.abbr ? <TeamMark sport={logo.sport} abbr={logo.abbr} variant="logo" px={22} style={{ marginRight: 8, verticalAlign: '-4px' }} /> : null}
      {name} <span style={{ fontFamily: numFont, fontSize: 11, color: theme.text3, fontWeight: 600 }}>· {meta}</span>
    </h2>
  )
}

export function SubLabel({ children, theme = MLB_C, numFont = MLB_NUM, style }) {
  return <div style={{ fontSize: 10, fontWeight: 900, letterSpacing: '.1em', color: theme.text3, fontFamily: numFont, marginBottom: 5, ...style }}>{children}</div>
}

/** items: [{ key, label, pct (0-100, the bar), text (the right-hand figure),
 *  tick (optional 0-100: a reference mark, e.g. LAMP's league average) }] */
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
            <span style={{ height: 10, borderRadius: 5, background: theme.bg3, position: 'relative' }}><span style={{ position: 'absolute', inset: 0, width: `${Math.max(0, Math.min(100, p.pct))}%`, borderRadius: 5, background: fill }} />{p.tick != null && <span title={p.tickTitle || 'league average'} style={{ position: 'absolute', top: -3, bottom: -3, width: 2, left: `${Math.max(0, Math.min(100, p.tick))}%`, background: theme.text }} />}</span>
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
 * FACT TILES (2026-10-04, Donovan on the Slate game card: "all these words give
 * me anxiety ... clean it up visually"). The same fact FactLines prints as a
 * sentence, as a tile: a short label, the number big, its rank small under it
 * -- MOONSHOT's PeriodTiles look (components/VerdictHero.js), wrapping. The
 * season / sample caveat is said ONCE, in `note`, not on every line.
 * tiles: [{ k, v, sub?, tone? }] -- a tile with no v is dropped.
 */
export function FactTiles({ tiles = [], note = null, theme = MLB_C, numFont = MLB_NUM, min = 92 }) {
  const shown = tiles.filter((t) => t && t.v != null && t.v !== '' && t.v !== false)
  if (!shown.length) return null
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: 'grid', gap: 6, gridTemplateColumns: `repeat(auto-fill, minmax(${min}px, 1fr))` }}>
        {shown.map((t) => (
          <div key={t.k} style={{ padding: '7px 8px 6px', borderRadius: 12, border: `1px solid ${theme.border}`, background: theme.glass, minWidth: 0 }}>
            <div style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.08em', color: theme.text3, fontFamily: numFont, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.k}</div>
            <div style={{ fontSize: 16, fontWeight: 900, fontFamily: numFont, color: t.tone || theme.text, lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.v}</div>
            {t.sub ? <div style={{ fontSize: 11, color: theme.text3, fontFamily: numFont, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.sub}</div> : null}
          </div>
        ))}
      </div>
      {note ? <div style={{ marginTop: 5, fontSize: 11, color: theme.text3 }}>{note}</div> : null}
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
  theme = MLB_C, numFont = MLB_NUM, onPick = null, pickedKey = null,
}) {
  const ink = accent || theme.orange
  const axis = { fontFamily: numFont, fontSize: 10, fontWeight: 800, color: theme.text3, letterSpacing: '.04em', lineHeight: 1.2 }
  // onPick (optional, 2026-09-29): tiles become buttons that open a detail
  // (TUDDY's "where he gets the ball"); without it, the same plain tiles.
  const tile = (c) => {
    const Tag = onPick ? 'button' : 'div'
    return (
      <Tag key={c.key} title={c.title} {...(onPick ? { type: 'button', onClick: () => onPick(c), 'aria-pressed': pickedKey === c.key } : {})}
        style={{ aspectRatio: aspect, borderRadius: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2,
          background: c.heat == null ? theme.bg2 : `color-mix(in srgb, ${ink} ${Math.round(8 + c.heat * 55)}%, ${theme.bg2})`,
          outline: (hotKey != null && hotKey === c.key) || (pickedKey != null && pickedKey === c.key) ? `2px solid ${pickedKey === c.key ? theme.text : ink}` : 'none', outlineOffset: 1,
          ...(onPick ? { border: 'none', padding: 0, cursor: 'pointer', color: 'inherit', font: 'inherit', minHeight: 0, minWidth: 0 } : {}) }}>
        <b style={{ fontFamily: numFont, fontSize: 13, color: theme.text }}>{c.big}</b>
        {c.small != null ? <span style={{ fontFamily: numFont, fontSize: 10, color: theme.text2 }}>{c.small}</span> : null}
      </Tag>
    )
  }
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
