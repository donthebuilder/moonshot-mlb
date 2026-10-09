'use client'
import { useMemo, useState } from 'react'
import { C } from '../../lib/nhl/theme'
import ProjectedView, { sortClick, rankRows } from '../slate/ProjectedView'
import { lampAngles } from './tabs/Board'
import Hint from './Hint'

// LAMP'S PROJECTED OUTPUT (2026-09-28, parity plan 00Q step 1). MOONSHOT's
// panel (components/slate/ProjectedView.js) with the night's goal board in it:
//   Proj goals    the game's (or the club's) projected goals from the TEAM model, the same number the
//                 Slate's dial prints (lib/nhl/teamProj.js, on the board as game.proj, 2026-10-08).
//                 The chips do not move it: it is a club's, not a sum over the skaters in view.
//   Proj shots    the scored skaters' shots per game, summed (the board's own legs)
//   Called goals  the called skaters' goals per game, summed
// By game or by team; the chips are the board's own angles plus Called only; Proj shots and Called
// goals recompute over what's left. A game with no team projection has no row (no number, no row).
const COLS = ['Proj goals', 'Proj shots', 'Called goals']

export default function LampProjected({ items = [], games = [], stale = false, onOpenGame = null, onOpenTeam = null }) {
  const [active, setActive] = useState(() => new Set())
  const [by, setBy] = useState('game')
  const [sortCol, setSortCol] = useState('Proj goals')
  const [sortDir, setSortDir] = useState('desc')
  const lenses = useMemo(() => [
    { key: 'called', label: '🔒 Called only', tip: 'Only the called skaters.', test: ({ r }) => r.status === 'called' },
    ...lampAngles(items, 'GOAL'),
  ].map((a) => ({ key: a.key, label: a.label, tip: a.tip || a.title, hit: a.test })), [items])

  const pool = useMemo(() => {
    if (!active.size) return items
    const on = lenses.filter((l) => active.has(l.key))
    return items.filter((x) => on.every((l) => l.hit(x)))
  }, [items, active, lenses])

  const rows = useMemo(() => {
    const groups = new Map()
    if (by === 'game') {
      for (const g of games) {
        const gp = pool.filter((x) => x.g.game.id === g.game.id)
        if (gp.length) groups.set(`${g.game.away.abbrev} @ ${g.game.home.abbrev}`, { pool: gp, pk: g.game.id })
      }
    } else {
      for (const x of pool) {
        const t = x.r.team
        if (!t) continue
        if (!groups.has(t)) groups.set(t, { pool: [], team: t })
        groups.get(t).pool.push(x)
      }
    }
    const sum = (xs, f) => xs.reduce((s, { r }) => s + (Number(f(r)) || 0), 0)
    const gameBy = new Map(games.map((x) => [x.game.id, x]))
    // the team model's number: a game's total, or the club's own side of it (the same value the Slate prints)
    const projOf = (gr) => {
      if (gr.pk != null) return gameBy.get(gr.pk)?.proj?.total
      const gm = games.find((x) => x.proj && (x.game.home.abbrev === gr.team || x.game.away.abbrev === gr.team))
      return gm ? (gm.game.home.abbrev === gr.team ? gm.proj.home : gm.proj.away).goals : null
    }
    const out = [...groups.entries()].filter(([, gr]) => Number.isFinite(projOf(gr))).map(([label, gr]) => ({
      label, _count: gr.pool.length, _pk: gr.pk ?? null, _team: gr.team ?? null,
      values: {
        'Proj goals': projOf(gr),
        'Proj shots': sum(gr.pool, (r) => r.legs?.shotsPg),
        'Called goals': sum(gr.pool.filter(({ r }) => r.status === 'called'), (r) => r.legs?.goalsPg),
      },
    }))
    return rankRows(out, sortCol, sortDir)
  }, [games, pool, by, sortCol, sortDir])

  return (
    <ProjectedView
      lenses={lenses} active={active} setActive={setActive} shownCount={pool.length} totalCount={items.length} noun="skaters" sport="nhl"
      by={by} setBy={setBy}
      note={<>
        Projected goals come from the team model: each club&apos;s shots, shot quality, the other side&apos;s defence and goalie.
        {stale ? ' Last season’s skater rates, until the new season’s tables open.' : ''}
        <Hint label="The columns" text="Proj goals is the team model’s goals for the game or the club, the same number the Slate prints; the chips do not move it. Proj shots adds each scored skater’s shots on goal a game. Called goals adds the goals a game of the called skaters only." />
      </>}
      rows={rows} primary="Proj goals" unit="goals" columns={COLS}
      sortCol={sortCol} sortDir={sortDir} onSort={sortClick(sortCol, setSortCol, setSortDir)}
      podiumTip={(r) => `${r._count} scored skaters · ${r.values['Proj shots'].toFixed(1)} skater shots · ${r.values['Called goals'].toFixed(1)} goals a game from the called`}
      barsTitle={<>Proj goals by {by} — tonight&apos;s goals, top to bottom</>}
      barsFoot={<>Bar length is Proj goals — same numbers as the table below, ordered top to bottom.</>}
      footnote={<>Proj goals is the team model. Proj shots and Called goals are sums over the skaters in view. ▲ ▼ = clearly above or below tonight&apos;s average.</>}
      onOpenGame={onOpenGame} onOpenTeam={onOpenTeam} accent={C.ice} large
    />
  )
}
