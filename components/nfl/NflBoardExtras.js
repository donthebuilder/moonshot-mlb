'use client'
import { C, NUM_FONT, gradeFor } from '../../lib/nfl/theme'
import { LABELS } from '../../lib/nfl/scoreLabels'
import { quoteFor } from '../../lib/nfl/oddsMatch'
import NflTable from './NflTable'
import NflFace from './NflFace'
import { Segmented } from '../Filters'

// TUDDY BOARD EXTRAS (2026-09-27, board filters plan): the pieces MOONSHOT's
// board has that TUDDY's two boards (Touchdowns.js for TD, Boards.js for the
// other markets) did not, built once and used by both.

/** List | Cards switch, MOONSHOT's words. */
export function ViewSwitch({ value, onChange }) {
  return (
    <Segmented label="View" value={value} onChange={onChange}
      options={[{ key: 'list', label: 'List', title: 'One sortable table: click a header, shift-click for a tiebreaker' }, { key: 'cards', label: 'Cards', title: 'The card board' }]} />
  )
}

/**
 * THE LIST VIEW (plan TUDDY 1). The market's score, grade, its three heaviest
 * components (percentiles in the week's pool -- the numbers the score is built
 * from, spec.weights), the matchup and the book's price. A phone keeps five
 * columns: rank, player, score and the two heaviest components; the rest is on
 * the card a tap away. Sort any header; shift-click adds a tiebreaker.
 */
export function NflBoardList({ players, market, weights, odds, phone, onPlayerClick }) {
  const top = Object.entries(weights || {}).sort((a, b) => b[1] - a[1]).slice(0, phone ? 2 : 3).map(([k]) => k)
  const rows = players.map((p, i) => {
    const q = odds ? quoteFor(odds, p, market) : null
    return {
      _id: p.player_id, _p: p, rank: i + 1, name: p.name, pos: p.position,
      matchup: `${p.team}${p.opp ? ` v ${p.opp}` : ''}`,
      score: Math.round(p.scores[market]), grade: gradeFor(p.scores[market]).label,
      price: q && q.over != null && q.matches !== false ? Number(q.over) : null,
      ...Object.fromEntries(top.map((k) => [k, Number.isFinite(p.components?.[market]?.[k]) ? Math.round(p.components[market][k]) : null])),
    }
  })
  const columns = [
    { key: 'rank', label: '#', w: 30, heat: false },
    { key: 'name', label: 'Player', w: phone ? 158 : 170, heat: false, sticky: true, fmt: (v, r) => (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
        <NflFace player={r._p} size={22} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v}</span>
      </span>) },
    ...(phone ? [] : [{ key: 'pos', label: 'Pos', w: 40, heat: false }, { key: 'matchup', label: 'Game', w: 80, heat: false }]),
    { key: 'score', label: 'Score', w: 52, primary: true, scale: 'seq', domain: [0, 100] },
    ...(phone ? [] : [{ key: 'grade', label: 'Grade', w: 56, heat: false }]),
    ...top.map((k) => ({ key: k, label: LABELS[k] || k, w: phone ? 74 : 86, scale: 'seq', domain: [0, 100] })),
    ...(phone || !odds ? [] : [{ key: 'price', label: 'Price', w: 60, heat: false, fmt: (v) => (v == null ? '—' : v > 0 ? `+${v}` : String(v)) }]),
  ]
  if (!rows.length) return null
  return (
    <NflTable rows={rows} columns={columns} heatMode="primary" maxRows={rows.length} maxHeight={9999}
      dimRow={(r) => r._p?.low_sample} onRowClick={(r) => (r._p?.position === 'DEF' ? null : onPlayerClick?.(r._p, market))}
      caption={phone
        ? 'Score and the two heaviest parts of it, as percentiles in this week’s pool. Tap a row for the full card.'
        : 'Score, grade, and the three heaviest parts of the score as percentiles in this week’s pool. Click a header to sort; shift-click adds a tiebreaker.'} />
  )
}

export const numFontStyle = { fontFamily: NUM_FONT, color: C.text3 }
