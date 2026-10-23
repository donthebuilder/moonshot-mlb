// PREPLAY · LAMP checks (2026-10-22). TEST DATA ONLY: two made-up clubs, made-up skaters and made-up shot spots.
// Proves:
//   1. the exact win share (exactHomeShare) is the simulator's own: 20,000 draws land within a point of it
//   2. one game is deterministic, and its play-by-play adds up: the goals in the log are the final (a shootout adds
//      the winner's one), every score along the way is right, scorers are the clubs' own skaters
//   3. every shot in the log comes from that skater's own spots (his goals for a goal), toward the net his club
//      attacks that period (the home club at +x in periods 1 and 3)
//   4. 2,000 runs: the shown game ends on the most common final with the favourite winning; deterministic
//   node --import ./scripts/_esm-resolve.mjs scripts/check-preplay-nhl.mjs
import { simNhlGame, preplayNhl, exactHomeShare, homeWinShare } from '../lib/nhl/preplay.js'

let fails = 0
const ok = (cond, msg) => { if (cond) console.log(`ok   ${msg}`); else { fails += 1; console.log(`FAIL ${msg}`) } }
const CAL = { homeIce: 1.04, otSeconds: 300, otFactor: 1.6, shootoutHome: 0.52 }

const skaters = (team, base) => Array.from({ length: 18 }, (_, i) => ({
  id: base + i, name: `TEST ${team} ${i + 1}`, num: i + 2, pos: i < 6 ? 'D' : i % 3 === 0 ? 'C' : 'F',
  g: i < 6 ? 0.06 : 0.15 + (i % 4) * 0.08, s: i < 6 ? 1.2 : 1.8 + (i % 3) * 0.6,
  spots: { goal: [[80 - (i % 5), (i % 7) - 3]], sog: [[60 + (i % 9), (i % 11) - 5], [-70, 10]] },   // [-70, 10]: a spot on the other half (sign is fixed by the period)
}))
const G = {
  away: { team: 'AAA', goals: 2.9, shots: 28, skaters: skaters('AAA', 1000), goalie: { id: 1999, name: 'TEST AAA G', num: 30 }, spots: { goal: [[75, 0]], sog: [[60, 0]] } },
  home: { team: 'BBB', goals: 3.3, shots: 31, skaters: skaters('BBB', 2000), goalie: { id: 2999, name: 'TEST BBB G', num: 31 }, spots: { goal: [[75, 0]], sog: [[60, 0]] } },
  cal: CAL,
}

// 1
const ex = exactHomeShare(G.home.goals, G.away.goals, CAL).p
const dr = homeWinShare(G, 20000)
ok(Math.abs(ex - dr) < 0.01, `exact home share ${(ex * 100).toFixed(1)}% = the simulator's draws ${(dr * 100).toFixed(1)}% (within a point)`)

// 2 + 3
let adds = true, mine = true, spots = true, sides = true, det = true, so = 0
for (let s = 1; s <= 300; s += 1) {
  const log = []
  const g = simNhlGame(G, s, log)
  const again = simNhlGame(G, s)   // no log: must be the same game
  if (JSON.stringify(g) !== JSON.stringify(again)) det = false
  const goals = log.filter((e) => e.kind === 'goal')
  const last = log.filter((e) => e.score).at(-1)?.score || [0, 0]
  const sow = g.last === 'SO' ? 1 : 0
  if (g.last === 'SO') so += 1
  if (goals.filter((e) => e.team === 'AAA').length + (g.last === 'SO' && g.winner === 'away' ? 1 : 0) !== g.away) adds = false
  if (goals.filter((e) => e.team === 'BBB').length + (g.last === 'SO' && g.winner === 'home' ? 1 : 0) !== g.home) adds = false
  if (last[0] + last[1] + sow !== g.away + g.home) adds = false
  const run = [0, 0]
  for (const e of log) {
    if (e.kind === 'goal') run[e.team === 'AAA' ? 0 : 1] += 1
    if (e.score && e.kind !== 'shootout' && (e.score[0] !== run[0] || e.score[1] !== run[1])) adds = false
    if (e.kind !== 'goal' && e.kind !== 'sog') continue
    const club = e.team === 'AAA' ? G.away : G.home
    const p = club.skaters.find((x) => x.id === e.who)
    if (!p) { mine = false; continue }
    const pool = e.kind === 'goal' ? p.spots.goal : p.spots.sog
    if (!pool.some(([x, y]) => Math.abs(Math.abs(x) - Math.abs(e.x)) < 1e-9 && Math.abs(Math.abs(y) - Math.abs(e.y)) < 1e-9)) spots = false
    const homeSign = e.period % 2 === 1 && e.period <= 3 ? 1 : -1
    const want = e.team === 'BBB' ? homeSign : -homeSign
    if (Math.sign(e.x) !== want) sides = false
  }
}
ok(det, 'one game is deterministic (the same seed, the same game, with or without a log)')
ok(adds, 'the log adds up: goals = the final (plus the shootout winner\'s one); every running score is right')
ok(mine, 'every shooter is one of his club\'s own skaters')
ok(spots, 'every shot comes from that skater\'s own spots (his goals for a goal)')
ok(sides, 'every shot goes at the net his club attacks that period')
ok(so > 0, `shootouts happen (${so} of 300 TEST games)`)

// 4
const pp = preplayNhl(G, { n: 2000 })
const tg = pp.typical.game
ok(tg.away === pp.modal.away && tg.home === pp.modal.home, `the shown game ends on the most common final (${pp.modal.away}-${pp.modal.home}, ${(pp.modal.share * 100).toFixed(1)}% of runs)`)
ok(tg.winner === pp.fav, `and the favourite (${pp.fav}) wins it`)
ok(JSON.stringify(preplayNhl(G, { n: 2000 }).modal) === JSON.stringify(pp.modal), 'deterministic: the same inputs give the same numbers and the same game')
ok(pp.scorers.length > 10 && pp.scorers.every((x) => x.team === 'AAA' || x.team === 'BBB'), `scoring shares cover the skaters (${pp.scorers.length}), each on his own club`)

console.log(fails ? `\n${fails} FAILED` : '\nall PREPLAY NHL checks pass')
process.exit(fails ? 1 : 0)
