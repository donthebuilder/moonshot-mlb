// THE FIVE (Friday's series, claude/CALLED-IT-PLAYBOOK-2026-10-20.txt: "five names for the weekend, all sports"). PROTOTYPE STAGE
// (Donovan, 2026-10-20: "lets build proto types"): both versions are here so the winner is wired, the other deleted. Pure; nothing posts yet.
//
// The candidates are THE SLATE's (lib/posts/slateLoad.js -> each sport's adapter: lib/posts/mlb.js, nfl.js, nhl.js, nba.js): CALLED men only,
// each with his place on his own board (`rank` of `of`) and one real proof line. A board's own score is not comparable across sports, so
// "best" across sports is the place on his own board, as a share of the board (rank / of): #6 of 405 beats #2 of 85.
//
//   A  pickFiveA  ONE CALL PER SPORT, then THE BEST OF THE REST: each sport's top CALLED man (the sports in registry order), then the
//                 best remaining by share until five. Every active sport is in it.
//   B  pickFiveB  THE FIVE BEST BY OUR BOARD: the five best shares, whatever the sport (a big NFL week can fill it).
// A man is in once. Ties keep the board's order.
import { BRAND, ALL_SPORT_KEYS } from '../routes'
import { HARD_LIMIT } from '../dash/postLimit'
import { xLen } from './slate'

const share = (c) => (c.rank > 0 && c.of > 0 ? c.rank / c.of : Infinity)
const byShare = (a, b) => share(a) - share(b) || a.rank - b.rank
const order = (s) => { const i = ALL_SPORT_KEYS.indexOf(s); return i < 0 ? 99 : i }
const keyOf = (c) => `${c.sport}:${c.id}`
const usable = (cands) => (cands || []).filter((c) => c && c.name && c.rank > 0 && c.of > 0 && !c.problem)

/** A: one per sport (its best), then the best of the rest. `sports` = the adapters' outputs ([{ sport, cands }]). */
export function pickFiveA(sports, n = 5) {
  const all = (sports || []).flatMap((s) => usable(s.cands).map((c) => ({ ...c, sport: c.sport || s.sport })))
  const out = []
  const seen = new Set()
  for (const s of [...new Set(all.map((c) => c.sport))].sort((a, b) => order(a) - order(b))) {
    const top = all.filter((c) => c.sport === s).sort(byShare)[0]
    if (top && out.length < n) { out.push({ ...top, why5: 'top' }); seen.add(keyOf(top)) }
  }
  for (const c of all.slice().sort(byShare)) { if (out.length >= n) break; if (!seen.has(keyOf(c))) { out.push({ ...c, why5: 'rest' }); seen.add(keyOf(c)) } }
  return out.sort(byShare)
}

/** B: the five best shares, any sport. */
export function pickFiveB(sports, n = 5) {
  const seen = new Set()
  return (sports || []).flatMap((s) => usable(s.cands).map((c) => ({ ...c, sport: c.sport || s.sport }))).sort(byShare)
    .filter((c) => (seen.has(keyOf(c)) ? false : (seen.add(keyOf(c)), true))).slice(0, n)
}

const ICON = (s) => BRAND[s]?.icon || ''
/** One row: "1. 🏈 Jahmyr Gibbs (DET) · #1 of 307 · 7.7 red-zone touches a game". */
export const fiveLine = (c, i) => `${i + 1}. ${ICON(c.sport)} ${c.name}${c.team ? ` (${c.team})` : ''} · #${c.rank} of ${c.of}${c.proof && !/^#\d+ of/.test(c.proof) ? ` · ${c.proof}` : ''}`

/**
 * THE POST. `picks` = pickFiveA / pickFiveB, `dayWords` = "Weekend of Oct 24". The long post first, then without the proof lines (280).
 * '' with fewer than three names (three is not five, but under three is not a list).
 */
export function fiveText({ picks, dayWords, variant = 'A', limit = HARD_LIMIT }) {
  if (!picks || picks.length < 3) return ''
  const head = `\u{1F590}\u{FE0F} THE FIVE · ${String(dayWords || '').toUpperCase()}`
  const hook = variant === 'A' ? 'One from every board, then the best of the rest \u{1F447}' : 'The five best spots on our boards this weekend \u{1F447}'
  const ask = "Who's your #1 of the five, network?"
  const full = picks.map(fiveLine)
  const bare = picks.map((c, i) => fiveLine({ ...c, proof: null }, i))
  for (const lines of [full, bare]) for (const withHook of [true, false]) {
    const t = [head, '', ...(withHook ? [hook, ''] : []), ...lines, '', ask].join('\n')
    if (xLen(t) <= limit) return t
  }
  return ''
}
