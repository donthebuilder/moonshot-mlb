'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/nhl/theme'
import CompareTwo from '../compare/CompareTwo'
import { STATUS, fmtSec } from './ui'

// ⚖️ COMPARE TWO SKATERS (2026-10-03, parity) -- MOONSHOT's compare shell
// (components/compare/CompareTwo.js), LAMP's content. Every number is a field
// on tonight's goal board row (lib/nhl/goalModel.js): the score, its rank in
// his game, and the three legs it is built from, each with its percentile.
// The signals are the board's own facts, not a new model: called, and each
// leg in the top fifth tonight. LAMP's board carries no price, so the verdict
// rule is score, then signals, then a coin flip -- said as such.

const TOP = 80
const SIGNALS = [
  ['called', 'Called', 'one of the two the board called in his game', (p) => p.status === 'called'],
  ['shots', 'Shooter', `shots per game in the top fifth tonight (${TOP}th percentile+)`, (p) => (p.pct?.shotsPg ?? 0) >= TOP],
  ['goals', 'Finisher', `goals per game in the top fifth tonight (${TOP}th percentile+)`, (p) => (p.pct?.goalsPg ?? 0) >= TOP],
  ['toi', 'Big minutes', `ice time in the top fifth tonight (${TOP}th percentile+)`, (p) => (p.pct?.toi ?? 0) >= TOP],
]
const pctTag = (v) => (Number.isFinite(v) ? ` · ${Math.round(v)}th` : '')

const ROWS = [
  ['Status', (p) => STATUS[p.status] || '—', false],
  ['Goal score', (p) => (Number.isFinite(p.score) ? Math.round(p.score) : '—'), true],
  ['Rank in his game', (p) => (p.rank ? `#${p.rank}` : '—'), false],
  ['Shots / game', (p) => (Number.isFinite(p.legs?.shotsPg) ? `${p.legs.shotsPg.toFixed(2)}${pctTag(p.pct?.shotsPg)}` : '—'), false],
  ['Goals / game', (p) => (Number.isFinite(p.legs?.goalsPg) ? `${p.legs.goalsPg.toFixed(2)}${pctTag(p.pct?.goalsPg)}` : '—'), false],
  ['Ice time', (p) => (Number.isFinite(p.legs?.toi) ? `${fmtSec(p.legs.toi)}${pctTag(p.pct?.toi)}` : '—'), false],
  ['Opp goals allowed / game', (p) => (Number.isFinite(p.context?.oppGaPg) ? p.context.oppGaPg.toFixed(2) : '—'), false],
]

function verdictFor(a, b, qa, qb, ca, cb) {
  const sa = Number(a.score) || 0, sb = Number(b.score) || 0
  const gap = sa - sb
  if (Math.abs(gap) >= 8) {
    const w = gap > 0 ? a : b
    return { who: w, why: `${Math.abs(gap).toFixed(0)} points clear on the goal score — outside the noise between two skaters.` }
  }
  if (ca !== cb) {
    const w = ca > cb ? a : b
    return { who: w, why: `scores are within ${Math.abs(gap).toFixed(0)} points, so the signals decide: ${Math.max(ca, cb)} of ${SIGNALS.length} agree on him against ${Math.min(ca, cb)}.` }
  }
  return { who: null, why: `coin flip — ${Math.abs(gap).toFixed(0)} points apart, ${ca} signal${ca === 1 ? '' : 's'} each. Nothing here separates them.` }
}

export default function GoalCompare({ rows = [], onOpenPlayer }) {
  // Board rows are keyed playerId; one row per skater even across a doubleheader day.
  const players = useMemo(() => {
    const seen = new Set()
    return rows.filter((r) => r.playerId && !seen.has(r.playerId) && seen.add(r.playerId)).map((r) => ({ ...r, player_id: r.playerId }))
  }, [rows])
  return (
    <CompareTwo
      players={players} nameOf={(p) => p.name || ''} teamOf={(p) => p.team || ''}
      metaSel={(p) => `${p.team} vs ${p.opp}`} metaHit={(p) => `${p.team} vs ${p.opp} · ${p.pos}`}
      rows={ROWS} signals={SIGNALS} quoteOf={() => null} verdictFor={verdictFor}
      onPlayerClick={onOpenPlayer ? (p) => onOpenPlayer(p.playerId) : null}
      title="⚖️ Compare two skaters" sub="the things that differ between two goal picks, side by side, and a verdict that says why"
      placeholders={['first skater…', 'second skater…']} signalsTitle="The board's own facts for a goal pick: called, and each leg in the top fifth tonight."
      accent={C.ice} accentBg={`${C.ice}14`} bgTint={`${C.ice}0a`} winInk={C.ice}
      theme={C} numFont={NUM_FONT} gridClass="gc-grid" />
  )
}
