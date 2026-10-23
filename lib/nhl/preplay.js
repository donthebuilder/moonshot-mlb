// 🏒 PREPLAY · LAMP · THE NHL SIMULATOR (2026-10-22). Donovan: "build the NHL simulator" (PREPLAY, posted before puck
// drop and graded after, like MOONSHOT's World Series one). Pure: no fetch, no clock, no DOM.
//
// WHAT IT RUNS ON. Nothing new is modelled here:
//   each club's expected goals and shots on goal tonight   LAMP's team model, lamp-team-v1 (lib/nhl/teamProj.js:
//                                                          shots x shot quality x the other defence x the other
//                                                          goalie, plus empty-net goals)
//   who shoots and who scores                              each skater's shots and goals a game over his last games,
//                                                          pulled toward his position's average (shrinkGames)
//   where each shot comes from                             one of that skater's own real shots, from the league's
//                                                          play-by-play (his goals for a goal, his shots on goal
//                                                          for a save); his club's when he has none
// What the simulator adds is the game around those numbers: goals and saves as timed events at each club's rate,
// three periods, overtime (3-on-3, five minutes, then a shootout; in the playoffs 20-minute sudden-death periods),
// and the measured home ice and overtime numbers in PREPLAY_NHL below (scripts/eval-lamp-preplay.mjs fits them on
// Oct-Jan 2025-26 and checks them on Feb-Apr; they are not tuned by hand).
//
// Deterministic: the same inputs and seed give the same game. 2,000 runs give the numbers a post needs.

import CAL from './preplayV1'

export const PREPLAY_NHL_VERSION = CAL.version
export const PREPLAY_NHL_RUNS = 2000
const SEED = 11
const SEED_STEP = 7919
const PERIOD_S = 1200

const mulberry = (seed) => {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
// a Poisson count (Knuth; the rates here are single digits to the low thirties)
const poisson = (lam, rng) => { if (!(lam > 0)) return 0; const L = Math.exp(-lam); let k = 0, p = 1; do { k += 1; p *= rng() } while (p > L); return k - 1 }
const pickWeighted = (items, w, rng) => {
  let tot = 0; for (const x of items) tot += Math.max(0, w(x))
  if (!(tot > 0)) return items.length ? items[Math.floor(rng() * items.length)] : null
  let u = rng() * tot
  for (const x of items) { u -= Math.max(0, w(x)); if (u <= 0) return x }
  return items[items.length - 1]
}
const hash = (...xs) => { let h = 2166136261 >>> 0; for (const c of xs.join('|')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 } return h }

/**
 * One club's skaters for the simulator, from its shot rows and its games (scripts/fetch-lamp-shots-feed.mjs or
 * lamp_shots): each skater's goals and shots on goal a game over the games he dressed in, pulled toward his
 * position's average by `shrinkGames` games, and his real shot spots.
 *   dressed   [{ id, name, num, pos }] tonight's skaters (the projected lineup: his club's last game)
 *   history   { [id]: { gp, goals, sog, spots: { goal: [[x, y]], sog: [[x, y]] } } }
 *   posMean   { F: { g, s }, D: { g, s } } per-game league means by position
 */
export function skaterWeights(dressed, history, posMean, shrinkGames = CAL.shrinkGames) {
  return dressed.map((p) => {
    const h = history[p.id] || { gp: 0, goals: 0, sog: 0, spots: { goal: [], sog: [] } }
    const m = posMean[p.pos === 'D' ? 'D' : 'F']
    return { ...p, g: (h.goals + shrinkGames * m.g) / (h.gp + shrinkGames), s: (h.sog + shrinkGames * m.s) / (h.gp + shrinkGames), spots: h.spots }
  })
}

/**
 * One simulated game.
 *   G = { away, home, playoff, cal } with each side { team, goals (expected, regulation), shots (expected shots on
 *       goal), skaters (skaterWeights rows), goalie: { id, name, num } | null, spots (the club's own real shots, the
 *       fallback) }
 *   log (optional array): filled with the game's events in lib/nhl/events.js's shape, so the LAMP stage plays it
 * Returns { away, home, last ('REG' | 'OT' | 'SO'), winner, scorers: { [id]: goals } }.
 */
export function simNhlGame(G, seed = 1, log = null) {
  const rng = mulberry(seed)
  const cal = G.cal || CAL
  const R = rates(G.home.goals, G.away.goals, cal)
  const lam = { away: R.a, home: R.h }
  const sogRest = { away: Math.max(0, G.away.shots - G.away.goals), home: Math.max(0, G.home.shots - G.home.goals) }
  const scorers = {}
  const evs = []
  for (const side of ['away', 'home']) {
    const n = poisson(lam[side] - R.c, rng)
    for (let k = 0; k < n; k += 1) evs.push({ side, kind: 'goal', at: rng() * 3 * PERIOD_S })
    // the saves are always drawn (not only when a log is asked for), so a game replayed with its log is the same game
    const s = poisson(sogRest[side], rng); for (let k = 0; k < s; k += 1) evs.push({ side, kind: 'sog', at: rng() * 3 * PERIOD_S })
  }
  // the shared goals: one each way (a game that opens up opens up for both clubs; it is why real games end level after
  // 60 minutes more often than two independent counts would)
  const shared = poisson(R.c, rng)
  for (let k = 0; k < shared; k += 1) for (const side of ['away', 'home']) evs.push({ side, kind: 'goal', at: rng() * 3 * PERIOD_S })
  evs.sort((a, b) => a.at - b.at)
  const score = { away: 0, home: 0 }
  for (const e of evs) if (e.kind === 'goal') score[e.side] += 1
  let last = 'REG'
  if (score.away === score.home) {
    // overtime: sudden death at each club's rate (x the measured 3-on-3 factor); then the shootout
    const ot = G.playoff ? { len: Infinity, k: 1 } : { len: cal.otSeconds, k: cal.otFactor }
    const rate = { away: lam.away / (3 * PERIOD_S) * ot.k, home: lam.home / (3 * PERIOD_S) * ot.k }
    const tot = rate.away + rate.home
    const at = tot > 0 ? -Math.log(1 - rng()) / tot : Infinity
    if (at < ot.len) {
      const side = rng() < rate.home / tot ? 'home' : 'away'
      evs.push({ side, kind: 'goal', at: 3 * PERIOD_S + at, ot: true }); score[side] += 1; last = 'OT'
    } else {
      last = 'SO'
      score[rng() < cal.shootoutHome ? 'home' : 'away'] += 1
    }
  }
  // who scored each goal (and, for the stage, who took each shot)
  for (const e of evs) {
    const club = G[e.side]
    const p = pickWeighted(club.skaters, (x) => (e.kind === 'goal' ? x.g : x.s), rng)
    e.who = p?.id ?? null
    if (e.kind === 'goal' && e.who != null) scorers[e.who] = (scorers[e.who] || 0) + 1
  }
  const winner = score.home > score.away ? 'home' : 'away'
  if (log) writeLog(G, evs, last, winner, seed, log)
  return { away: score.away, home: score.home, last, winner, scorers }
}

// the events, in lib/nhl/events.js's shape (what components/lamp/GameReplay.js plays): faceoffs at centre to start
// each period and after each goal; every shot from one of the shooter's real spots, toward the net his club attacks
// that period (the home club attacks +x in periods 1 and 3, -x in 2 and overtime; clubs switch ends each period)
function writeLog(G, evs, last, winner, seed, log) {
  const sc = [0, 0]
  const sideOf = (s) => (s === 'away' ? 0 : 1)
  const attack = (side, period) => { const homeSign = period % 2 === 1 && period <= 3 ? 1 : -1; return side === 'home' ? homeSign : -homeSign }
  const centre = (period, side) => {
    const club = G[side]
    const cs = club.skaters.filter((p) => p.pos === 'C')
    const c = (cs.length ? cs : club.skaters)[hash(seed, 'fo', period, log.length) % Math.max(1, (cs.length ? cs : club.skaters).length)]
    return c?.id ?? null
  }
  const push = (e) => log.push({ n: log.length, a1: null, a2: null, shotType: null, reason: null, total: null, sit: '1551', dur: null, ptype: null, fresh: false, ...e })
  let period = 0
  const faceoff = (p, t, side) => push({ period: p, pt: p > 3 ? 'OT' : 'REG', t, kind: 'faceoff', x: 0, y: 0, team: G[side].team, who: centre(p, side), vs: null, score: [...sc], fresh: true })
  for (const e of evs) {
    const p = Math.min(4, Math.floor(e.at / PERIOD_S) + 1)
    const t = Math.round(e.at - (p - 1) * PERIOD_S)
    while (period < p) { period += 1; faceoff(period, 0, hash(seed, period) % 2 ? 'home' : 'away') }
    const club = G[e.side]
    const me = club.skaters.find((x) => x.id === e.who)
    const pool = (me?.spots?.[e.kind]?.length ? me.spots[e.kind] : me?.spots?.sog?.length ? me.spots.sog : club.spots?.[e.kind]?.length ? club.spots[e.kind] : club.spots?.sog) || [[60, 0]]
    const [x0, y0] = pool[hash(seed, e.at.toFixed(3), e.who) % pool.length]
    const sgn = attack(e.side, p)
    if (e.kind === 'goal') sc[sideOf(e.side)] += 1
    const other = G[e.side === 'home' ? 'away' : 'home']
    push({ period: p, pt: p > 3 ? 'OT' : 'REG', t, kind: e.kind, x: sgn * Math.abs(x0), y: sgn * Math.sign(x0 || 1) * y0, team: club.team, who: e.who, vs: other.goalie?.id ?? null, score: [...sc] })
    if (e.kind === 'goal' && p <= 3) faceoff(p, Math.min(PERIOD_S, t + 1), e.side === 'home' ? 'away' : 'home')
  }
  while (period < 3) { period += 1; faceoff(period, 0, hash(seed, period) % 2 ? 'home' : 'away') }
  if (last !== 'REG' && period < 4) faceoff(4, 0, hash(seed, 4) % 2 ? 'home' : 'away')
  if (last === 'SO') log.push({ n: log.length, period: 5, pt: 'SO', t: 0, kind: 'shootout', team: G[winner].team, score: [...sc] })
}

/**
 * 2,000 runs -> the PREPLAY numbers and the game to show.
 *   { n, winPct { away, home }, fav, total { mean }, ot (share past regulation), modal { away, home, share },
 *     scorers [{ id, team, p }] (the share of runs he scores in), typical { seed, game, log } }
 */
export function preplayNhl(G, { n = PREPLAY_NHL_RUNS, seed = SEED } = {}) {
  if (!G?.away?.skaters?.length || !G?.home?.skaters?.length) return null
  const wins = { away: 0, home: 0 }
  let tot = 0, ot = 0
  const finals = new Map(), sc = new Map()
  for (let i = 0; i < n; i += 1) {
    const s = seed + i * SEED_STEP
    const g = simNhlGame(G, s)
    wins[g.winner] += 1
    tot += g.away + g.home
    if (g.last !== 'REG') ot += 1
    const key = `${g.away}-${g.home}`
    const f = finals.get(key)
    if (f) f.n += 1; else finals.set(key, { n: 1, seed: s, away: g.away, home: g.home })
    for (const id of Object.keys(g.scorers)) sc.set(id, (sc.get(id) || 0) + 1)
  }
  const fav = wins.home >= wins.away ? 'home' : 'away'
  let modal = null
  for (const f of finals.values()) {
    const favWon = fav === 'home' ? f.home > f.away : f.away > f.home
    if (favWon && (!modal || f.n > modal.n)) modal = f
  }
  const teamOf = (id) => (G.home.skaters.some((p) => String(p.id) === String(id)) ? G.home.team : G.away.team)
  const log = []
  const shown = modal ? simNhlGame(G, modal.seed, log) : null
  return {
    n, fav,
    winPct: { away: wins.away / n, home: wins.home / n },
    total: { mean: tot / n }, ot: ot / n,
    modal: modal ? { away: modal.away, home: modal.home, share: modal.n / n } : null,
    scorers: [...sc.entries()].map(([id, c]) => ({ id: Number(id), team: teamOf(id), p: c / n })).sort((a, b) => b.p - a.p),
    typical: shown ? { seed: modal.seed, game: shown, log } : null,
  }
}

/**
 * Tonight's regulation rates: the team model's goals for each club, the gap between them widened by the measured
 * spread (the team model is shrunk hard toward the league, and last season's favourites won more than it said), home
 * ice, and the shared goals (c). home goals = A + C, away = B + C with A ~ Pois(h - c), B ~ Pois(a - c), C ~ Pois(c).
 */
export function rates(lh, la, cal = CAL) {
  const m = (lh + la) / 2, s = cal.spread ?? 1
  const h = Math.max(0.3, m + s * (lh - m)) * cal.homeIce, a = Math.max(0.3, m + s * (la - m)) / cal.homeIce
  return { h, a, c: Math.min(cal.shared ?? 0, 0.8 * Math.min(h, a)) }
}

/**
 * The simulator's own distribution, computed exactly instead of drawn: the home club's share of wins, the share of
 * games tied after 60 minutes, and the share of those decided in overtime. scripts/eval-lamp-preplay.mjs measures the
 * simulator with this on every game of a season; scripts/check-preplay-nhl.mjs proves it matches 20,000 draws.
 */
export function exactHomeShare(lh, la, cal = CAL) {
  const pois = (lam, k) => { let p = Math.exp(-lam); for (let i = 1; i <= k; i += 1) p *= lam / i; return p }
  const { h, a, c } = rates(lh, la, cal)
  let win = 0, tie = 0
  const N = 14, pA = [], pB = [], pC = []
  for (let k = 0; k <= N; k += 1) { pA.push(pois(h - c, k)); pB.push(pois(a - c, k)); pC.push(pois(c, k)) }
  // home = A + C, away = B + C: the margin is A - B whatever C is, and a tie is A = B
  for (let i = 0; i <= N; i += 1) for (let j = 0; j <= N; j += 1) { const p = pA[i] * pB[j]; if (i > j) win += p; else if (i === j) tie += p }
  const ot = 1 - Math.exp(-(h + a) / (3 * PERIOD_S) * cal.otFactor * cal.otSeconds)
  return { p: win + tie * (ot * (h / (h + a)) + (1 - ot) * cal.shootoutHome), tie, ot }
}

/** The home club's chance in one game without the event detail, by draws (the check compares it to exactHomeShare). */
export function homeWinShare(G, n = 600, seed = SEED) {
  let h = 0
  for (let i = 0; i < n; i += 1) if (simNhlGame(G, seed + i * SEED_STEP).winner === 'home') h += 1
  return h / n
}
