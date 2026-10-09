'use client'
import { useMemo, useState } from 'react'
import { C } from '../../lib/nfl/theme'
import { matchupTag } from '../../lib/nfl/dvpSignal'
import ProjectedView, { sortClick, rankRows } from '../slate/ProjectedView'
import { angleDefs } from './NflBoardExtras'
import { slateTotals, TD_WORD } from '../../lib/nfl/teamTdModel'

// TUDDY'S PROJECTED OUTPUT (2026-09-28, parity plan 00Q step 1). MOONSHOT's
// panel (components/slate/ProjectedView.js, the view its own Projected output
// renders through) with football's counts in it:
//   Proj TD      ALWAYS the TEAM model's expected touchdowns (lib/nfl/teamTdModel.js,
//                the dial on the Slate's game cards). A filter changes which rows
//                show, never this number.
//   Kept players' xTD   only while a player-level filter is on: the sum of the kept
//                players' xTD. A different question from the game total (it covers
//                the tracked players only), so it has its own column and name.
//   Rec / Rec yds / Rush yds   the sum of each player's per-game averages
// By game or by team; the chips are the board's own angles plus high
// confidence and the watchlist; everything else recomputes over what's left.
// The per-game averages are the week file's.
const PROJ = 'Proj TD'
const KEPT = "Kept players' xTD"
const SUMS = [['Rec', 'REC'], ['Rec yds', 'RECYD'], ['Rush yds', 'RUYD']]
const KEPT_EXPLAIN = "The sum of the expected touchdowns of the players your filter keeps. It is a different question from Proj TD: Proj TD is the whole game from the team model; this counts only the tracked players (about 80% of real touchdowns) who are left after the filter, so it is smaller and moves with every chip."
const PROJ_EXPLAIN = `${TD_WORD[0].toUpperCase()}${TD_WORD.slice(1)} from the team model: each club's touchdown rate against the other's defence. The same number as the dial on the Slate's game cards; filters never change it.`

export default function NflProjected({ data, matchup, logs, players: pool = [], games = [], watchlist = null, onOpenGame = null, onOpenTeam = null }) {
  const [active, setActive] = useState(() => new Set())
  const [by, setBy] = useState('game')
  const [sortCol, setSortCol] = useState(PROJ)
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
  const totals = useMemo(() => slateTotals(data, logs), [data, logs])
  const filtered = active.size > 0   // every chip keeps a subset of players
  const teamTd = useMemo(() => {
    const m = {}
    for (const g of games) { const t = totals[g.game_id]; if (t) { m[g.away] = t.awayTd; m[g.home] = t.homeTd } }
    return m
  }, [games, totals])

  const columns = filtered ? [PROJ, KEPT, ...SUMS.map((c) => c[0])] : [PROJ, ...SUMS.map((c) => c[0])]
  const sortOk = columns.includes(sortCol) ? sortCol : PROJ   // a cleared filter takes its column with it

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
    const out = []
    for (const [label, gr] of groups) {
      const m = gr.pk != null ? totals[gr.pk]?.total : teamTd[gr.team]
      if (!Number.isFinite(m)) continue   // no model for this row: no row, never a roster sum under the model's name
      const values = { [PROJ]: m }
      for (const [col, key] of SUMS) values[col] = gr.pool.reduce((s, p) => s + (Number(p.stats?.[key]) || 0), 0)
      if (filtered) values[KEPT] = gr.pool.reduce((s, p) => s + (Number(p.stats?.xTD) || 0), 0)
      out.push({ label, values, _count: gr.pool.length, _pk: gr.pk ?? null, _team: gr.team ?? null })
    }
    return rankRows(out, sortOk, sortDir)
  }, [games, players, by, sortOk, sortDir, filtered, totals, teamTd])

  const colMeta = { label: by === 'game' ? 'Game' : 'Club', [PROJ]: { group: 'Team model', explain: PROJ_EXPLAIN }, [KEPT]: { group: 'Kept', explain: KEPT_EXPLAIN, w: 92 }, Rec: { group: 'Players, per game' }, 'Rec yds': { group: 'Players, per game' }, 'Rush yds': { group: 'Players, per game' } }

  return (
    <ProjectedView
      lenses={lenses} active={active} setActive={setActive} shownCount={players.length} totalCount={total} noun="players" sport="nfl"
      by={by} setBy={setBy}
      note={<>
        <b style={{ color: C.text2 }}>{PROJ}</b> — {TD_WORD} from the team model (the Slate&apos;s game dial); filters pick the rows, never this number.
        {filtered ? <> <b style={{ color: C.text2 }}>{KEPT}</b> sums the kept players&apos; own xTD — a different question.</> : ''} Rec, Rec yds and Rush yds are the players&apos; per-game averages, summed{data?.preseason ? '. Preseason: last season’s rates at full usage — read it as the ceiling' : ''}.
      </>}
      colMeta={colMeta}
      rows={rows} primary={PROJ} unit="TD" columns={columns}
      sortCol={sortOk} sortDir={sortDir} onSort={sortClick(sortOk, setSortCol, setSortDir)}
      podiumTip={(r) => `${r._count} scored players · ${r.values['Rec'].toFixed(1)} catches · ${r.values['Rec yds'].toFixed(0)} rec yds · ${r.values['Rush yds'].toFixed(0)} rush yds`}
      barsTitle={<>{PROJ} by {by} — this week&apos;s touchdowns, top to bottom</>}
      barsFoot={<>Bar length is {PROJ} — same numbers as the table below, ordered top to bottom.</>}
      footnote={<>{filtered ? <>{KEPT} covers only the tracked players (about 80% of real touchdowns), so it is not the game total. </> : null}Rec, Rec yds and Rush yds are sums over the players in view, so a filter above moves them. A pill (▲ ▼) means that {by} sits clearly above or below this week&apos;s own average, not a hard threshold.</>}
      onOpenGame={onOpenGame} onOpenTeam={onOpenTeam} accent={C.green}
    />
  )
}
