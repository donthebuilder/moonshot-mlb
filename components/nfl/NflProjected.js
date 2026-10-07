'use client'
import { useMemo, useState } from 'react'
import { C } from '../../lib/nfl/theme'
import { matchupTag } from '../../lib/nfl/dvpSignal'
import ProjectedView, { sortClick, rankRows } from '../slate/ProjectedView'
import { angleDefs } from './NflBoardExtras'

// TUDDY'S PROJECTED OUTPUT (2026-09-28, parity plan 00Q step 1). MOONSHOT's
// panel (components/slate/ProjectedView.js, the view its own Projected output
// renders through) with football's counts in it:
//   Proj TD      the sum of each scored player's xTD -- the model's expected
//                touchdowns (the dial on the Slate's game cards)
//   Rec / Rec yds / Rush yds   the sum of each player's per-game averages
// By game or by team; the chips are the board's own angles plus high
// confidence and the watchlist; everything recomputes over what's left.
// No new number: xTD and the per-game averages are the week file's.
const COLS = [['Proj TD', 'xTD'], ['Rec', 'REC'], ['Rec yds', 'RECYD'], ['Rush yds', 'RUYD']]

export default function NflProjected({ data, matchup, logs, players: pool = [], games = [], watchlist = null, onOpenGame = null, onOpenTeam = null }) {
  const [active, setActive] = useState(() => new Set())
  const [by, setBy] = useState('game')
  const [sortCol, setSortCol] = useState('Proj TD')
  const [sortDir, setSortDir] = useState('desc')
  const week = data ? { season: data.season, week: data.week } : null
  const lenses = useMemo(() => [
    { key: 'highconf', label: '⭐ High confidence', tip: "TUDDY's high-confidence TD flag.", hit: (p) => Boolean(p.high_confidence_td_flag) },
    ...angleDefs({ matchup, logs, market: 'TD', matchupTag, week }).map((a) => ({ key: a.key, label: a.label, tip: a.title, hit: a.test })),
    { key: 'watch', label: '⭐ My watchlist', tip: 'Only players on your watchlist.', hit: (p) => Boolean(watchlist?.isPinned(p.player_id)) },
  ], [matchup, logs, week?.season, week?.week, watchlist])   // eslint-disable-line react-hooks/exhaustive-deps

  const players = useMemo(() => {
    const base = pool.filter((p) => !p.on_bye && p.stats)
    if (!active.size) return base
    const on = lenses.filter((l) => active.has(l.key))
    return base.filter((p) => on.every((l) => l.hit(p)))
  }, [pool, active, lenses])
  const total = pool.filter((p) => !p.on_bye && p.stats).length

  const rows = useMemo(() => {
    const groups = new Map()
    if (by === 'game') {
      for (const g of games) {
        const gp = players.filter((p) => p.team === g.away || p.team === g.home)
        if (gp.length) groups.set(`${g.away} @ ${g.home}`, { pool: gp, pk: g.game_id })
      }
    } else {
      for (const p of players) {
        if (!p.team) continue
        if (!groups.has(p.team)) groups.set(p.team, { pool: [], team: p.team })
        groups.get(p.team).pool.push(p)
      }
    }
    const out = [...groups.entries()].map(([label, gr]) => {
      const values = {}
      for (const [col, key] of COLS) values[col] = gr.pool.reduce((s, p) => s + (Number(p.stats?.[key]) || 0), 0)
      return { label, values, _count: gr.pool.length, _pk: gr.pk ?? null, _team: gr.team ?? null }
    })
    return rankRows(out, sortCol, sortDir)
  }, [games, players, by, sortCol, sortDir])

  return (
    <ProjectedView
      lenses={lenses} active={active} setActive={setActive} shownCount={players.length} totalCount={total} noun="players" sport="nfl"
      by={by} setBy={setBy}
      note={<>
        <b style={{ color: C.text2 }}>xTD</b> — each player&apos;s expected touchdowns a game, summed over
        everyone scored on this slate (the dial on the Slate&apos;s game cards). Rec, Rec yds and Rush yds are the same
        players&apos; per-game averages, summed{data?.preseason ? '. Preseason: last season’s rates at full usage — read it as the ceiling' : ''}.
      </>}
      rows={rows} primary="Proj TD" unit="TD" columns={COLS.map((c) => c[0])}
      sortCol={sortCol} sortDir={sortDir} onSort={sortClick(sortCol, setSortCol, setSortDir)}
      podiumTip={(r) => `${r._count} scored players · ${r.values['Rec'].toFixed(1)} catches · ${r.values['Rec yds'].toFixed(0)} rec yds · ${r.values['Rush yds'].toFixed(0)} rush yds`}
      barsTitle={<>Proj TD by {by} — this week&apos;s touchdowns, top to bottom</>}
      barsFoot={<>Bar length is Proj TD — same numbers as the table below, ordered top to bottom.</>}
      footnote={<>Every column is a sum over the players in view, so a filter above moves all of them. A pill (▲ ▼) means that {by} sits clearly above or below this week&apos;s own average, not a hard threshold.</>}
      onOpenGame={onOpenGame} onOpenTeam={onOpenTeam} accent={C.green}
    />
  )
}
