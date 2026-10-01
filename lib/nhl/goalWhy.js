// WHY / WATCH FOR A GOAL-BOARD ROW (2026-09-30, BATCH-SIGNAL-WHY S2/S3a):
// the goal model's own three legs (lib/nhl/goalModel.js -- goals / game,
// shots / game, TOI), each ranked among every skater on tonight's GOAL
// board. Why = his strongest leg; watch = his weakest, only when it sits in
// tonight's bottom quarter. No invented lane: a leg with no number is
// skipped. Shared by LAMP's headline GOAL box and the player page.
import { fmtSec } from './format'

const GOAL_LEGS = [
  { key: 'goalsPg', words: 'Goals a game', fmt: (v) => v.toFixed(2) },
  { key: 'shotsPg', words: 'Shots on goal a game', fmt: (v) => v.toFixed(1) },
  { key: 'toi', words: 'Ice time', fmt: (v) => fmtSec(v) },
]
const ordinal = (k) => `${k}${[11, 12, 13].includes(k % 100) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[k % 10] || 'th')}`
export function goalWhy(r, board) {
  const pool = (board?.games || []).flatMap((g) => g.rows || [])
  const placed = []
  for (const leg of GOAL_LEGS) {
    const v = Number(r?.legs?.[leg.key])
    if (!Number.isFinite(v)) continue
    const vals = pool.map((x) => Number(x?.legs?.[leg.key])).filter(Number.isFinite)
    if (vals.length < 2) continue
    const better = vals.filter((x) => x > v).length
    const worse = vals.filter((x) => x < v).length
    placed.push({ leg, v, n: vals.length, rank: better + 1, worseRank: worse + 1, pct: (100 * (worse + 0.5 * (vals.length - better - worse))) / vals.length })
  }
  if (!placed.length) return null
  const top = [...placed].sort((a, b) => b.pct - a.pct)[0]
  const low = [...placed].sort((a, b) => a.pct - b.pct)[0]
  const why = `${top.leg.words} ${top.leg.fmt(top.v)} · ${ordinal(top.rank)} of ${top.n} skaters tonight`
  const watch = low !== top && low.pct <= 25 ? `${low.leg.words} ${low.leg.fmt(low.v)} · ${low.worseRank === 1 ? 'lowest' : `${ordinal(low.worseRank)}-lowest`} of ${low.n} tonight` : null
  const all = placed.map((p) => `${p.leg.words} ${p.leg.fmt(p.v)} · ${ordinal(p.rank)} of ${p.n} skaters tonight.`).join('  ')
  return { why, watch, explain: { label: `Why ${r.name}`, text: `The goal model's three legs: ${all}` } }
}

