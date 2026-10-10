'use client'
import { useMemo, useState } from 'react'
import PropsMatrix, { MatrixEmpty } from '../player/PropsMatrix'
import Brief from '../player/Brief'
import { SportTheme } from '../SportTheme'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { GLOW_AT, STREAK_AT } from '../player/heat'
import { Kicker, Pills } from './ui'

// 🏀 BUCKETS' PROPS MATRIX: MOONSHOT's props heat (components/player/PropsMatrix.js) on his own NBA game log.
// PTS / REB / AST / 3PM at the whole-number bars a bettor plays, over his last 5, 10, 20 and the season, with the
// games each rate stands on. Counted off the log rows the page already holds (regular season and playoffs; preseason
// is camp minutes, so it is not counted): `cleared / games` per window, never a forecast and never a price.
// No log, no grid: the honest empty line says so. A tap on a row moves the line chips to that market.
const MARKETS = [
  { key: 'pts', label: 'PTS', stat: 'pts', lines: [10, 15, 20, 25, 30], first: 15 },
  { key: 'reb', label: 'REB', stat: 'reb', lines: [4, 6, 8, 10], first: 6 },
  { key: 'ast', label: 'AST', stat: 'ast', lines: [3, 5, 8], first: 5 },
  { key: '3pm', label: '3PM', stat: 'tpm', lines: [1, 2, 3, 4], first: 2 },
]
const WINDOWS = [['L5', 5], ['L10', 10], ['L20', 20], ['Szn', Infinity]]
const THIN_N = 5

const num = (g, stat) => (g?.[stat] == null || g[stat] === '' || !Number.isFinite(Number(g[stat])) ? null : Number(g[stat]))

/** Rows of the matrix from a NEWEST-FIRST log. A game with no number for the stat is not a game for that market. */
export function nbaMatrixRows(log, lines) {
  return MARKETS.map((m) => {
    const line = lines[m.key] ?? m.first
    const games = log.filter((g) => num(g, m.stat) != null)
    const cells = WINDOWS.map(([, size]) => {
      const seg = games.slice(0, size === Infinity ? undefined : size)
      if (!seg.length) return null
      const ok = seg.filter((g) => num(g, m.stat) >= line).length
      return { ok, n: seg.length, pct: (100 * ok) / seg.length }
    })
    let stk = 0
    if (games.length) {
      const first = num(games[0], m.stat) >= line
      let k = 0
      for (const g of games) { if ((num(g, m.stat) >= line) === first) k += 1; else break }
      stk = first ? k : -k
    }
    return { key: m.key, label: `${line}+ ${m.label}`, line, cells, stk, m }
  })
}

export default function BucketsPropsMatrix({ log = [], logSeason = '' }) {
  const [mkt, setMkt] = useState('pts')
  const [lines, setLines] = useState({})
  const games = useMemo(() => (log || []).filter((g) => g.seasonType === 2 || g.seasonType === 3), [log])
  const rows = useMemo(() => nbaMatrixRows(games, lines), [games, lines])
  const on = rows.find((r) => r.key === mkt) || rows[0]
  if (!games.length) {
    return (
      <section aria-label="Props">
        <Kicker>PROPS · EVERY MARKET, EVERY WINDOW</Kicker>
        <MatrixEmpty C={C} NUM_FONT={NUM_FONT}>No regular-season games in his log yet, so there is nothing to count. The grid fills in with his first game.</MatrixEmpty>
      </section>
    )
  }
  return (
    <section aria-label="Props">
      <Kicker>PROPS · EVERY MARKET, EVERY WINDOW{logSeason ? ` · ${logSeason}` : ''}</Kicker>
      <SportTheme theme={C} accent={C.purple} numFont={NUM_FONT}>
        <PropsMatrix rows={rows} windows={WINDOWS.map(([w]) => w)} C={C} NUM_FONT={NUM_FONT} accent={C.purple} look="dense" thin={THIN_N}
          activeKey={on.key} onPick={(r) => setMkt(r.key)}
          cellTitle={(c, r) => (c ? `${r.label}: ${c.ok} of ${c.n} games${c.n < THIN_N ? ' (too few games to lean on)' : ''}` : 'no games in this window')} />
        {on.m.lines.length > 1 && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '8px 0 0', flexWrap: 'wrap' }}>
            <span style={{ color: C.text3, font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.08em' }}>{on.m.label} BAR</span>
            <Pills ariaLabel={`${on.m.label} bar`} value={on.line} onChange={(l) => setLines((st) => ({ ...st, [on.key]: l }))} options={on.m.lines.map((l) => ({ key: l, text: `${l}+` }))} />
          </div>
        )}
        <div style={{ marginTop: 6 }}>
          <Brief text={`Glow = ${GLOW_AT}%+ of his games · 🔥 = ${STREAK_AT}+ straight.`} label="Reading the grid"
            help={`Each cell is the share of his games that cleared the bar, with the games it stands on under it. A grey cell sits on fewer than ${THIN_N} games. Counted from his own regular-season and playoff log; preseason is not counted. Not a forecast and not a price.`} />
        </div>
      </SportTheme>
    </section>
  )
}
