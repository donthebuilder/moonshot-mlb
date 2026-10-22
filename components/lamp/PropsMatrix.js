'use client'
import { useMemo, useState } from 'react'
import PropsMatrix, { MatrixEmpty } from '../player/PropsMatrix'
import Brief from '../player/Brief'
import { SportTheme } from '../SportTheme'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import { GLOW_AT, STREAK_AT } from '../player/heat'
import { Kicker, Pills } from './ui'

// 🏒 LAMP'S PROPS MATRIX (2026-10-20, the parity sweep: "build anything truly missing"): MOONSHOT's props heat
// (components/player/PropsMatrix.js), on a skater's own NHL game log.
// GOALS / SHOTS / POINTS / ASSISTS at the bars a bettor plays, over his last 5, 10, 20 and the season, with the games each
// rate stands on: `cleared / games` per window, never a forecast and never a price. This season's log; a man with no game
// yet this season reads last season's, said so. No log, no grid: the honest empty line says so.
const MARKETS = [
  { key: 'g', label: 'G', stat: 'g', lines: [1, 2], first: 1 },
  { key: 'shots', label: 'SOG', stat: 'shots', lines: [2, 3, 4, 5], first: 3 },
  { key: 'pts', label: 'PTS', stat: 'pts', lines: [1, 2, 3], first: 1 },
  { key: 'a', label: 'A', stat: 'a', lines: [1, 2], first: 1 },
]
const WINDOWS = [['L5', 5], ['L10', 10], ['L20', 20], ['Szn', Infinity]]
const THIN_N = 5

const num = (g, stat) => (g?.[stat] == null || g[stat] === '' || !Number.isFinite(Number(g[stat])) ? null : Number(g[stat]))

/** Rows of the matrix from a NEWEST-FIRST log. A game with no number for the stat is not a game for that market. */
export function nhlMatrixRows(log, lines) {
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

export default function LampPropsMatrix({ logThis = [], logLast = [], seasonThis = '', seasonLast = '' }) {
  const [mkt, setMkt] = useState('g')
  const [lines, setLines] = useState({})
  const useLast = !logThis.length && logLast.length > 0
  const games = useLast ? logLast : logThis
  const label = useLast ? seasonLast : seasonThis
  const rows = useMemo(() => nhlMatrixRows(games, lines), [games, lines])
  const on = rows.find((r) => r.key === mkt) || rows[0]
  if (!games.length) {
    return (
      <section aria-label="Props">
        <Kicker>PROPS · EVERY MARKET, EVERY WINDOW</Kicker>
        <MatrixEmpty C={C} NUM_FONT={NUM_FONT}>No games in his log yet, so there is nothing to count. The grid fills in with his first game.</MatrixEmpty>
      </section>
    )
  }
  return (
    <section aria-label="Props">
      <Kicker>PROPS · EVERY MARKET, EVERY WINDOW{label ? ` · ${label}` : ''}{useLast ? ' (no game yet this season)' : ''}</Kicker>
      <SportTheme theme={C} accent={C.ice} numFont={NUM_FONT}>
        <PropsMatrix rows={rows} windows={WINDOWS.map(([w]) => w)} C={C} NUM_FONT={NUM_FONT} accent={C.ice} look="dense" thin={THIN_N}
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
            help={`Each cell is the share of his games that cleared the bar, with the games it stands on under it. A grey cell sits on fewer than ${THIN_N} games. Counted from his own regular-season log; nothing here is a forecast.`} />
        </div>
      </SportTheme>
    </section>
  )
}
