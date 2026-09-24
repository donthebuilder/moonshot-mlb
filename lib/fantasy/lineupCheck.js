// LINEUP CHECK (2026-09-24). A healthy bench player projected clearly above a
// starter he could replace -- the 3zzz case, Jalen Hurts (22.4) on the bench
// behind Trevor Lawrence (17.1). Pure: the page passes its own projector.
import { isUnavailable } from './injury'
import { isOnBye } from './bye'

// A point and a half: under that, two projections are the same guess.
export const CHECK_MARGIN = 1.5

const fits = (player, slot) =>
  slot === 'FLEX' ? ['RB', 'WR', 'TE'].includes(player?.position) : player?.position === slot

/** @returns {{ slot, starter, starterValue, bench, benchValue }[]} biggest gap first */
export function lineupCheck({ starters, roster, project, byeTeams }) {
  const startingIds = new Set(starters.map((row) => row.player_id))
  const healthy = (p) => p && !isUnavailable(p) && !isOnBye(p, byeTeams)
  const bench = roster.filter((p) => p && !startingIds.has(p.id) && healthy(p))
  const used = new Set()
  const out = []
  for (const row of starters) {
    const starter = row.player
    if (!starter) continue
    const starterValue = healthy(starter) ? Number(project(starter)) || 0 : 0
    const best = bench
      .filter((p) => !used.has(p.id) && fits(p, row.slot))
      .map((p) => ({ p, v: Number(project(p)) || 0 }))
      .sort((a, b) => b.v - a.v)[0]
    if (best && best.v - starterValue >= CHECK_MARGIN) {
      used.add(best.p.id)
      out.push({ slot: `${row.slot}${row.slot_index > 1 ? row.slot_index : ''}`, starter, starterValue, bench: best.p, benchValue: best.v })
    }
  }
  return out.sort((a, b) => (b.benchValue - b.starterValue) - (a.benchValue - a.starterValue))
}
