'use client'
import { useMemo, useState } from 'react'
import { C } from '../../lib/nhl/theme'
import ProjectedView, { sortClick, rankRows } from '../slate/ProjectedView'
import { lampAngles } from './tabs/Board'
import Hint from './Hint'

// LAMP'S PROJECTED OUTPUT (2026-09-28, parity plan 00Q step 1). MOONSHOT's
// panel (components/slate/ProjectedView.js) with the night's goal board in it:
//   Proj goals    the sum of each scored skater's goals per game (the board's
//                 own legs -- last season's until the league's new tables open)
//   Proj shots    the same skaters' shots per game, summed
//   Called goals  Proj goals over the three CALLED per game only
// By game or by team; the chips are the board's own angles plus Called only;
// everything recomputes over what's left. Nothing new is computed.
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
    const out = [...groups.entries()].map(([label, gr]) => ({
      label, _count: gr.pool.length, _pk: gr.pk ?? null, _team: gr.team ?? null,
      values: {
        'Proj goals': sum(gr.pool, (r) => r.legs?.goalsPg),
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
        Each scored skater&apos;s goals a game, added up.
        {stale ? ' Last season’s, until the new season’s tables open.' : ''}
        <Hint label="The columns" text="Proj goals adds each scored skater’s goals a game. Proj shots is the same sum for shots on goal. Called goals is Proj goals over the called skaters only." />
      </>}
      rows={rows} primary="Proj goals" unit="goals" columns={COLS}
      sortCol={sortCol} sortDir={sortDir} onSort={sortClick(sortCol, setSortCol, setSortDir)}
      podiumTip={(r) => `${r._count} scored skaters · ${r.values['Proj shots'].toFixed(1)} shots · ${r.values['Called goals'].toFixed(1)} from the called`}
      barsTitle={<>Proj goals by {by} — tonight&apos;s goals, top to bottom</>}
      barsFoot={<>Bar length is Proj goals — same numbers as the table below, ordered top to bottom.</>}
      footnote={<>Sums over the skaters in view. ▲ ▼ = clearly above or below tonight&apos;s average.</>}
      onOpenGame={onOpenGame} onOpenTeam={onOpenTeam} accent={C.ice} large
    />
  )
}
