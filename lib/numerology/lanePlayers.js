// TONIGHT'S PLAYERS ON THESE LANES (2026-10-07). The Lane scoreboard scores LANES, not players -- it says
// how a number lane has done over graded nights. This is the other half of the question, answered with the
// SAME lane list (lib/numerology/lanes.js matchLanes): which of tonight's players are on a lane right now.
// Pure. `items` = [{ id, name, team, a }] where `a` is the sport's adapter shape (lib/numerology/adapters.js:
// fromMlb / fromNfl / fromNhl); a player whose fields are missing sits out of the lanes that need them, exactly
// as everywhere else. Fibonacci lanes are left out -- they are about the man, not the date (the rule the NHL and
// NFL Ledgers already use). Ranked by how many lanes he is on, then by the sport's own score if one is handed
// in, then by name -- so the list is stable and nothing is invented.
import { matchLanes } from './lanes'

export const isDateLane = (m) => !/fibonacci/i.test(m.label)

/**
 * @param items   [{ id, name, team, a, score? }]
 * @param date    the GAME's own date (YYYY-MM-DD)
 * @returns       [{ id, name, team, labels: string[], n, score }] best first, at most `limit`
 */
export function lanePlayers(items, date, { limit = 8 } = {}) {
  if (!date) return []
  const out = []
  for (const it of items || []) {
    if (!it?.a || it.id == null || it.id === '' || !it.name) continue
    const ms = matchLanes(it.a, { date }).filter(isDateLane)
    const labels = [...new Set(ms.map((m) => m.short || m.label))]
    const fullLabels = [...new Set(ms.map((m) => m.label))]
    if (labels.length) out.push({ id: String(it.id), name: it.name, team: it.team || null, labels, fullLabels, n: labels.length, score: Number.isFinite(Number(it.score)) ? Number(it.score) : null })
  }
  return out
    .sort((a, b) => (b.n - a.n) || ((b.score ?? -1) - (a.score ?? -1)) || a.name.localeCompare(b.name))
    .slice(0, limit)
}
