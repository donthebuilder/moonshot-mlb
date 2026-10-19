'use client'
import { C as MLB_C, NUM_FONT as MLB_NUM, TYPE } from '../lib/theme'

// THE LEADER TILE, EVERY SPORT (2026-09-29, queue batch 9). MOONSHOT's
// Leaders tile, lifted out of components/tabs/Leaders.js so TUDDY's Leaders is
// built from it instead of its own bar-behind-each-row card.
//
// USABLE, NOT A TROPHY CASE (2026-08-08, "needs something usable"): a tile
// that only names the #1 guy answers a trivia question. Each tile says WHO HE
// FACES — the leader with his matchup attached is a lead you can act on — and
// carries the two runners-up, because the interesting names are usually #2
// and #3, not the one everybody already knows about.
//
// rows    [{ _key, name, _raw }], leader first
// fmt     (row) => the value, formatted
// meta    (leader) => the small line beside the value (team chip, sample)
// facing  (leader) => { text, title } | null — the matchup line
// THE LEADERS GRID (Donovan 10-18: "these could be across the board or in little squares instead of rectangles going all the way down
// taking up the full screen"). One grid for every sport's tiles: cells of 150px+, so a phone (360-430) holds two across and a
// desktop five or six. Its own class (leader-grid), not .bot-picks-grid, which the phone sheet forces to one column.
export const LEADER_GRID = { display: 'grid', gap: 8, gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }

export default function LeaderTile({
  label, rows, fmt, color, onPlayerClick, meta, facing,
  theme = MLB_C, numFont = MLB_NUM,
}) {
  const C = theme
  if (!rows?.length) return null
  const [top, ...rest] = rows
  const face = facing ? facing(top) : null
  return (
    <div
      onClick={onPlayerClick ? () => onPlayerClick(top._raw) : undefined}
      title={onPlayerClick ? `Open ${top.name}` : undefined}
      style={{
        background: `linear-gradient(155deg, ${color}1e, ${color}06)`,
        border: `1px solid ${color}44`, borderRadius: 11, padding: '8px 10px', minWidth: 0,
        cursor: onPlayerClick ? 'pointer' : 'default',
      }}>
      <div style={{
        fontSize: TYPE.label, color: C.text3, textTransform: 'uppercase',
        letterSpacing: '.06em', fontWeight: 800, lineHeight: 1.25,
        display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden',
      }}>{label}</div>
      <div style={{
        fontSize: TYPE.name, fontWeight: 800, marginTop: 1,
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
      }}>{top.name}</div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
        <span style={{ fontFamily: numFont, fontSize: TYPE.title, fontWeight: 900, color }}>{fmt(top)}</span>
        {meta && (
          <span style={{ fontSize: TYPE.micro, color: C.text3, fontFamily: numFont }}>{meta(top)}</span>
        )}
      </div>
      {face && (
        <div style={{ fontSize: TYPE.micro, color: C.text2, fontFamily: numFont, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
          title={face.title}>
          {face.text}
        </div>
      )}
      {rest.length > 0 && (
        <div style={{ fontSize: TYPE.micro, color: C.text3, marginTop: 3, lineHeight: 1.5 }}>
          {/* one runner-up a line, name trimmed, number always whole (10-18: two on one line ran past a 160px square) */}
          {rest.map((r) => (
            <span key={r._key}
              onClick={(e) => { e.stopPropagation(); onPlayerClick?.(r._raw) }}
              style={{ cursor: onPlayerClick ? 'pointer' : 'default', display: 'flex', gap: 6, minWidth: 0 }}>
              <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.name.split(' ').slice(-1)[0]}</span>
              <b style={{ color: C.text2, fontFamily: numFont, marginLeft: 'auto', flex: 'none' }}>{fmt(r)}</b>
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
