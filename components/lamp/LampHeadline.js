'use client'
import HeadlinePicks from '../headline/HeadlinePicks'
import { fmtSec } from './ui'
import { goalWhy } from '../../lib/nhl/goalWhy'

// 🏒 LAMP'S HEADLINE PICKS (BATCH-HEADLINE-PICKS step 3, 2026-09-27): the
// same layout as MOONSHOT's The Four and TUDDY's The Six
// (components/headline/HeadlinePicks.js), one box per LAMP model that exists
// -- GOAL (lamp-goal-v1) and SHOTS (lamp-sog-v1, 3+ shots on goal). No
// invented lanes: POINTS / ASSISTS join when their models do.
//
// Each box: the night's top 3 CALLED skaters by the model's score, across
// every game (/api/lamp/board rows with status 'called'). Before a game locks
// its rows are the live PREVIEW, and a preview is not a call: flagged on the
// row, in capitals.
// FIELDS
//   GOAL   legs.goalsPg (goals / game, pooled), legs.shotsPg, legs.toi -- the
//          model's own three legs -- + team vs opp
//   SHOTS  legs.shotsPg, legs.toi, legs.oppSaPg (the opponent's goalies'
//          shots against / 60) -- its three legs -- + team vs opp
// RECORD  GOAL: the regular-season record (/api/lamp/record: called skaters
//         who scored, of those who dressed). SHOTS: not graded yet until its
//         first regular-season night -- said, never a number.
const f1 = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(1) : null)
const f2 = (v) => (Number.isFinite(Number(v)) ? Number(v).toFixed(2) : null)

function topCalled(board) {
  const rows = (board?.games || []).flatMap((g) => (g.rows || []).map((r) => ({ ...r, locked: g.locked })))
  return rows.filter((r) => r.status === 'called' && Number.isFinite(Number(r.score))).sort((a, b) => b.score - a.score).slice(0, 3)
}

const LANES = [
  {
    key: 'GOAL', label: 'GOAL', icon: '🚨', colorKey: 'lamp', blurb: 'scores a goal',
    lines: (r) => [[f2(r.legs?.goalsPg) && `${f2(r.legs.goalsPg)} G/g`, f1(r.legs?.shotsPg) && `${f1(r.legs.shotsPg)} SOG/g`].filter(Boolean).join(' · '), `${r.team} ${r.home ? 'vs' : '@'} ${r.opp}${Number.isFinite(Number(r.legs?.toi)) ? ` · TOI ${fmtSec(r.legs.toi)}` : ''}`],
    micro: (r) => f2(r.legs?.goalsPg) && `${f2(r.legs.goalsPg)} G/g`,
  },
  {
    key: 'SOG', label: 'SHOTS 3+', icon: '🎯', colorKey: 'teal', blurb: '3+ shots on goal',
    lines: (r) => [[f1(r.legs?.shotsPg) && `${f1(r.legs.shotsPg)} SOG/g`, f1(r.legs?.oppSaPg) && `opp allows ${f1(r.legs.oppSaPg)} SA/60`].filter(Boolean).join(' · '), `${r.team} ${r.home ? 'vs' : '@'} ${r.opp}${Number.isFinite(Number(r.legs?.toi)) ? ` · TOI ${fmtSec(r.legs.toi)}` : ''}`],
    micro: (r) => f1(r.legs?.shotsPg) && `${f1(r.legs.shotsPg)} SOG/g`,
  },
]

export default function LampHeadline({ theme: C, numFont, goalBoard, sogBoard, record, onOpenPlayer }) {
  const boards = { GOAL: goalBoard, SOG: sogBoard }
  const lanes = LANES.map((l) => ({
    key: l.key, label: l.label, icon: l.icon, color: C[l.colorKey], blurb: l.blurb,
    record: l.key === 'GOAL'
      ? (record?.calledN ? `${record.calledHits}/${record.calledN} called scored` : 'not graded yet')
      : 'not graded yet',
    empty: 'Waiting for tonight’s board.',
    picks: topCalled(boards[l.key]).map((r, i) => ({
      key: String(r.playerId), raw: r, name: r.name,
      score: Math.round(r.score),
      flag: r.preview ? { icon: '⏳', title: 'PREVIEW -- not a call until its game locks' } : null,
      lines: i === 0 ? [l.lines(r)[0], `${l.lines(r)[1]}${r.preview ? ' · PREVIEW' : ''}`] : [],
      team: i === 0 ? null : r.team,
      micro: i === 0 ? null : `${l.micro(r) || ''}${r.preview ? ' · preview' : ''}`,
      ...(i === 0 && l.key === 'GOAL' ? (goalWhy(r, boards.GOAL) || {}) : {}),
    })),
  })).filter((l) => l.picks.length)   // no empty boxes: a model with nothing called tonight sits out
  return (
    <HeadlinePicks sport="nhl"
      theme={C} numFont={numFont}
      title="🏒 Tonight's calls"
      subtitle="the called skaters in every game: one per team on goals, three per game on the other boards. Scores rank tonight's pool, 0–100 — not probabilities."
      lanes={lanes}
      collapsePhone
      onPick={(pick) => pick.raw?.playerId && onOpenPlayer?.(Number(pick.raw.playerId))}
    />
  )
}
