'use client'
import { useMemo, useState } from 'react'
import { C } from '../../lib/nba/theme'
import { Why } from './ui'
import ProjectedView, { sortClick, rankRows } from '../slate/ProjectedView'

// BUCKETS' PROJECTED OUTPUT -- MOONSHOT's panel (components/slate/ProjectedView.js),
// LAMP's twin's shape, with the night's points board in it:
//   Proj pts     each rated player's points a game (the board's pooled leg),
//                summed -- a RATE projection, not the model, and labelled so
//   Called pts   the same over the called players only
//   Proj FGA     shots a game, summed
// PLAYING TIME: a roster is 15-20 men and five play, so summing everyone's rate
// counted ~350 points a game. Each club's players count in minutes order until
// the club reaches 240 minutes (five on the floor for 48); the last one counts
// for the share of his minutes that fits, the rest for none -- `w` on each item.
// By game or by team; chips: Called only, Starters. Nothing new is computed.
const TEAM_MIN = 240
const COLS = ['Proj pts', 'Called pts', 'Proj FGA']

export default function BucketsProjected({ rows: boardRows = [], games = [], onOpenGame = null, onOpenTeam = null }) {
  const [active, setActive] = useState(() => new Set())
  const [by, setBy] = useState('game')
  const [sortCol, setSortCol] = useState('Proj pts')
  const [sortDir, setSortDir] = useState('desc')
  const items = useMemo(() => {
    const out = []
    const byTeam = new Map()
    for (const r of boardRows) { if (r.score == null || !r.legs) continue; const k = `${r.gameId}|${r.team}`; if (!byTeam.has(k)) byTeam.set(k, []); byTeam.get(k).push(r) }
    for (const list of byTeam.values()) {
      let left = TEAM_MIN
      for (const r of [...list].sort((a, b) => (b.legs?.minPg || 0) - (a.legs?.minPg || 0))) {
        const m = Number(r.legs?.minPg) || 0
        const w = m > 0 ? Math.max(0, Math.min(1, left / m)) : 0
        left = Math.max(0, left - m)
        out.push({ r, w })
      }
    }
    return out
  }, [boardRows])
  const lenses = [
    { key: 'called', label: '🔒 Called only', tip: 'Only the called players.', hit: ({ r }) => r.status === 'called' },
    { key: 'starters', label: 'Starters', tip: 'Only players in the pre-tip starting five (once it is listed).', hit: ({ r }) => r.starter === true },
  ]
  const pool = useMemo(() => {
    if (!active.size) return items
    const on = lenses.filter((l) => active.has(l.key))
    return items.filter((x) => on.every((l) => l.hit(x)))
  }, [items, active]) // eslint-disable-line react-hooks/exhaustive-deps
  const rows = useMemo(() => {
    const groups = new Map()
    if (by === 'game') {
      for (const g of games) { const gp = pool.filter((x) => x.r.gameId === g.id); if (gp.length) groups.set(`${g.away.abbrev} @ ${g.home.abbrev}`, { pool: gp, pk: g.id }) }
    } else {
      for (const x of pool) { const t = x.r.team; if (!t) continue; if (!groups.has(t)) groups.set(t, { pool: [], team: t }); groups.get(t).pool.push(x) }
    }
    const sum = (xs, f) => xs.reduce((s, { r, w }) => s + (Number(f(r)) || 0) * w, 0)
    return rankRows([...groups.entries()].map(([label, gr]) => ({
      label, _count: gr.pool.length, _pk: gr.pk ?? null, _team: gr.team ?? null,
      values: { 'Proj pts': sum(gr.pool, (r) => r.legs?.ptsPg), 'Called pts': sum(gr.pool.filter(({ r }) => r.status === 'called'), (r) => r.legs?.ptsPg), 'Proj FGA': sum(gr.pool, (r) => r.legs?.fgaPg) },
    })), sortCol, sortDir)
  }, [games, pool, by, sortCol, sortDir])
  return (
    <ProjectedView lenses={lenses} active={active} setActive={setActive} shownCount={pool.length} totalCount={items.length} noun="players" sport="nba"
      by={by} setBy={setBy}
      note={<>Points per game, added up over each club&apos;s top players. <Why label="Projected points" text="Each rated player’s points a game (this season and last, pooled by games), summed over each club’s top minutes up to 240 (five on the floor for 48). A rate projection of a box-score count, not a probability. Called pts is the same over the called players only; Proj FGA is their shots a game." /></>}
      rows={rows} primary="Proj pts" unit="points" columns={COLS}
      sortCol={sortCol} sortDir={sortDir} onSort={sortClick(sortCol, setSortCol, setSortDir)}
      podiumTip={(r) => `${r._count} rated players · ${r.values['Proj FGA'].toFixed(1)} shots · ${r.values['Called pts'].toFixed(1)} from the called`}
      barsTitle={<>Proj points by {by} — top to bottom</>}
      barsFoot={<>Bar length is Proj pts — same numbers as the table below.</>}
      footnote={<>Every column adds up the players in view, so a chip above moves all of them. ▲ ▼ = clearly above or below tonight&apos;s average.</>}
      onOpenGame={onOpenGame} onOpenTeam={onOpenTeam} accent={C.purple} />
  )
}
