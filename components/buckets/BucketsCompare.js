'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/nba/theme'
import { LEG_LABEL, fmtLeg } from '../../lib/nba/legs'
import { STATUS_WORD } from '../../lib/callStatus'
import CompareTwo from '../compare/CompareTwo'

// COMPARE TWO PLAYERS (2026-10-17, the player-card mirror): MOONSHOT's compare shell (components/compare/CompareTwo.js, the one LAMP's GoalCompare
// and TUDDY's TdCompare also wear), BUCKETS' content. Every number is a field on tonight's points-board row (lib/nba/boardRead.js): the score
// (a 0-100 rank among tonight's players, never a chance), its rank in his game and the night, and the legs it is built from, each with the
// board's own percentile. The signals are the board's facts, not a new model: called, and each leg in the top fifth tonight. BUCKETS' board carries
// no price here, so the verdict rule is score, then signals, then a coin flip -- said as such.
const TOP = 80
const SIGNALS = [
  ['called', 'Called', 'one of the players the board called', (p) => p.status === 'called'],
  ['scorer', 'Scorer', `points a game in the top fifth tonight (${TOP}th percentile+)`, (p) => (p.pct?.ptsPg ?? 0) >= TOP],
  ['minutes', 'Big minutes', `minutes in the top fifth tonight (${TOP}th percentile+)`, (p) => (p.pct?.minPg ?? 0) >= TOP],
  ['shots', 'Volume shooter', `shots a game in the top fifth tonight (${TOP}th percentile+)`, (p) => (p.pct?.fgaPg ?? 0) >= TOP],
]
const pctTag = (v) => (Number.isFinite(v) ? ` · ${Math.round(v)}th` : '')
const leg = (k) => [LEG_LABEL[k] || k, (p) => (Number.isFinite(p.legs?.[k]) ? `${fmtLeg(k, p.legs[k])}${pctTag(p.pct?.[k])}` : '—'), false]
const ROWS = [
  ['Status', (p) => STATUS_WORD[p.status] || '—', false],
  ['PTS score', (p) => (Number.isFinite(p.score) ? Math.round(p.score) : '—'), true],
  ['Rank in his game', (p) => (p.rank ? `#${p.rank}` : '—'), false],
  ['Rank tonight', (p) => (Number.isFinite(p.nightRank) && Number.isFinite(p.nightOf) ? `#${p.nightRank} of ${p.nightOf}` : '—'), false],
  leg('ptsPg'), leg('minPg'), leg('fgaPg'), leg('ftaPg'), leg('oppPts'),
]

function verdictFor(a, b, qa, qb, ca, cb) {
  const sa = Number(a.score) || 0
  const sb = Number(b.score) || 0
  const gap = sa - sb
  if (Math.abs(gap) >= 8) {
    return { who: gap > 0 ? a : b, why: `${Math.abs(gap).toFixed(0)} points clear on the PTS score, outside the noise between two players.` }
  }
  if (ca !== cb) {
    return { who: ca > cb ? a : b, why: `scores are within ${Math.abs(gap).toFixed(0)} points, so the signals decide: ${Math.max(ca, cb)} of ${SIGNALS.length} agree on him against ${Math.min(ca, cb)}.` }
  }
  return { who: null, why: `coin flip: ${Math.abs(gap).toFixed(0)} points apart, ${ca} signal${ca === 1 ? '' : 's'} each. Nothing here separates them.` }
}

export default function BucketsCompare({ rows = [], onOpenPlayer }) {
  const players = useMemo(() => {
    const seen = new Set()
    return rows.filter((r) => r.playerId && r.score != null && !seen.has(r.playerId) && seen.add(r.playerId)).map((r) => ({ ...r, player_id: r.playerId }))
  }, [rows])
  return (
    <CompareTwo
      players={players} nameOf={(p) => p.name || ''} teamOf={(p) => p.team || ''}
      metaSel={(p) => `${p.team} ${p.home ? 'vs' : '@'} ${p.opp}`} metaHit={(p) => `${p.team} ${p.home ? 'vs' : '@'} ${p.opp}${p.pos ? ` · ${p.pos}` : ''}`}
      rows={ROWS} signals={SIGNALS} quoteOf={() => null} verdictFor={verdictFor}
      onPlayerClick={onOpenPlayer ? (p) => onOpenPlayer(p.playerId) : null}
      title="⚖️ Compare two players" sub="what differs between two points-board players tonight, side by side, and a verdict that says why"
      placeholders={['first player…', 'second player…']} signalsTitle="The board’s own facts for a points pick: called, and each leg in the top fifth tonight."
      accent={C.purple} accentBg={`${C.purple}14`} bgTint={`${C.purple}0a`} winInk={C.purple}
      theme={C} numFont={NUM_FONT} gridClass="bc-grid" />
  )
}
