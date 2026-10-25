'use client'
import { useMemo } from 'react'
import BucketsTable from './BucketsTable'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { NBA_ODDS_KEY } from '../../lib/nba/oddsQuote'
import { NBA_MARKETS } from '../../lib/nba/model'

// 🎯 HIT RATE UNDER THE GAME LOG (2026-10-24, Donovan, from Doink's footer: "hit row under game log ... their over/under").
// How often he went OVER tonight's book line, per stat, in his last 5, last 10 and every game of the log's window. The line
// is the book's own (the odds feed's player line for tonight). No book line on file = BUCKETS' own board bar for that
// lane (PTS 25+ reads o24.5), marked BAR in the header and said under the table -- never a made-up line. Percent first, the count small under it (Donovan: "I like the percentages"). A hit rate is a count of his
// games, not a chance: it says what happened, nothing about tonight.

const STATS = [
  { k: 'pts', label: 'PTS', val: (g) => g.pts },
  { k: 'reb', label: 'REB', val: (g) => g.reb },
  { k: 'ast', label: 'AST', val: (g) => g.ast },
  { k: '3pm', label: '3PM', val: (g) => g.tpm },
  { k: 'pra', label: 'PRA', val: (g) => (g.pts == null || g.reb == null || g.ast == null ? null : Number(g.pts) + Number(g.reb) + Number(g.ast)) },
]
const WINDOWS = [['L5', 5], ['L10', 10], ['All', Infinity]]
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/** rows: the game log, NEWEST FIRST. odds: /api/odds/latest?sport=nba. pid: his ESPN id. */
export default function LineHitRates({ rows = [], odds = null, pid = null }) {
  const mine = odds?.by_player_id?.[String(pid)] || null
  const stats = STATS.map((s) => {
    const book = num(mine?.[NBA_ODDS_KEY[s.k]]?.line)
    const bar = NBA_MARKETS[s.k]?.bar
    return { ...s, line: book ?? (bar != null ? bar - 0.5 : null), book: book != null }
  }).filter((s) => s.line != null)
  const table = useMemo(() => WINDOWS.map(([w, n]) => {
    const games = rows.slice(0, n)
    const r = { _key: w, win: w === 'All' ? `All ${games.length}` : w }
    for (const s of stats) {
      const vs = games.map(s.val).map(num).filter((v) => v != null)
      const over = vs.filter((v) => v > s.line).length
      r[s.k] = vs.length ? Math.round((100 * over) / vs.length) : null
      r[`${s.k}_n`] = `${over}/${vs.length}`
    }
    return r
  }), [rows, stats])
  if (!stats.length || !rows.length) return null
  const columns = [
    { key: 'win', label: 'Games', group: 'Window', w: 64, heat: false, sticky: true, bold: true, numeric: false },
    ...stats.map((s) => ({
      key: s.k, label: `${s.label} o${s.line}${s.book ? '' : ' BAR'}`, group: 'Over the line', w: 72, title: `Games he went over ${s.line} ${s.label}${s.book ? ' (tonight’s book line)' : ' (BUCKETS’ board bar: no book line on file)'}`,
      fmt: (v, r) => (v == null ? '—' : <span style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.15 }}>
        <span>{v}%</span><span style={{ font: `600 10px/1.1 ${NUM_FONT}`, color: C.text3 }}>{r[`${s.k}_n`]}</span></span>),
    })),
  ]
  return (
    <div style={{ marginTop: 10, minWidth: 0 }}>
      <div style={{ font: `800 10px/1 ${NUM_FONT}`, letterSpacing: '.1em', color: C.text3, margin: '0 0 6px' }}>HIT RATE · OVER THE LINE</div>
      <BucketsTable rows={table} columns={columns} maxHeight={9999} heatMode="standouts" initialSort={null} />
      {stats.some((s) => !s.book) ? <div style={{ fontSize: 11, color: C.text3, marginTop: 4 }}>BAR = no book line on file yet; BUCKETS’ board bar instead.</div> : null}
    </div>
  )
}
