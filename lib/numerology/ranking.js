// THE NUMEROLOGY RANKING (2026-10-28, Donovan: "a numerology ranking, ranking everybody by most aligned ... maybe we even make a numerology
// score"). Pure. Every player on a slate in the shared all-sports shape (lib/numerology/allSports.js shapeRow) in, one ranked list out, using the
// SAME lanes everything else reads (lib/numerology/lanes.js matchLanes, date lanes only: the Fibonacci lanes are about the man, not the day).
//
//   n        how many lane families he is on (the same count lanePlayers and the Ledgers use): "3 align"
//   score    0-100, a RANK not a chance: HOW MANY lanes he is on comes first, and how RARE they are breaks ties among men on the same
//            count (each family is worth -ln(the share of his sport's slate on it that day)). So "3 align" always out-scores "2 align",
//            and of two men on 3 the one on the rarer numbers is higher; the day's most aligned man is 100 and a man on nothing is 0.
//            A player missing a field (no birth date, no jersey) sits out the lanes that need it, as everywhere else: never a 0 for a
//            lane, never a guess.
//   shown    the numbers his lanes landed on ("8 · 8 · 3"), the shared chip text (lanePlayers alignChip)
// FOR FUN. The score is never graded, never part of a pick or any other score, and says so where it is shown.
import { matchLanes, displayLanes } from './lanes'
import { isDateLane, alignChip } from './lanePlayers'

/** rows: the all-sports rows ({ sport, pid, name, team, game, gameDate, jersey, birthDate, next }). Returns ranked rows, best first, with `rank` within the sport. */
export function rankNumerology(rows) {
  const items = []
  for (const r of rows || []) {
    if (!r?.pid || !r.name || !r.gameDate) continue
    const ms = displayLanes(matchLanes({ name: r.name, jersey: r.jersey, birthDate: r.birthDate, next: r.next }, { date: r.gameDate }).filter(isDateLane))
    items.push({ r, ms, fam: [...new Set(ms.map((m) => m.family || m.lane))] })
  }
  // how common each family is on each sport's slate: the share of that slate's players on it
  const pool = new Map(), onFam = new Map()
  for (const { r, fam } of items) {
    pool.set(r.sport, (pool.get(r.sport) || 0) + 1)
    for (const f of fam) onFam.set(`${r.sport}|${f}`, (onFam.get(`${r.sport}|${f}`) || 0) + 1)
  }
  const weight = (sport, f) => { const n = pool.get(sport) || 1; return -Math.log(Math.max(onFam.get(`${sport}|${f}`) || 1, 1) / n) }
  const out = items.map(({ r, ms, fam }) => {
    const chip = alignChip(ms)[0] || null
    return { sport: r.sport, pid: r.pid, name: r.name, team: r.team, game: r.game, n: fam.length, raw: fam.reduce((a, f) => a + weight(r.sport, f), 0),
      shown: chip ? chip.label.split(' — ')[0] : '', explain: chip ? chip.explain : '' }
  })
  const bestRaw = new Map(), bestN = new Map()
  for (const o of out) { bestRaw.set(o.sport, Math.max(bestRaw.get(o.sport) || 0, o.raw)); bestN.set(o.sport, Math.max(bestN.get(o.sport) || 0, o.n)) }
  // count first, rarity as the fraction under it (0.99 keeps one more lane always ahead of any rarity)
  for (const o of out) o.score = o.n && bestRaw.get(o.sport) > 0 ? Math.round((100 * (o.n + (0.99 * o.raw) / bestRaw.get(o.sport))) / (bestN.get(o.sport) + 1)) : 0
  out.sort((a, b) => b.score - a.score || b.n - a.n || a.name.localeCompare(b.name))
  const seen = new Map()
  for (const o of out) { const k = (seen.get(o.sport) || 0) + 1; seen.set(o.sport, k); o.rank = k }
  return out
}
