// ⚾ PREPLAY · MOONSHOT (2026-10-22). Donovan: "I would rather the simulator be posted pregame and then we can grade it
// ... for each sport." The World Series Game 1 is the first one.
//
// WHAT THIS IS. The game simulator (lib/gameSim.js, the same engine the Games tab's Simulator panel runs) played 2,000
// times off the bot's own board rows, and the numbers a pregame post needs out of those runs: who wins how often, the
// most common final, the total, and each hitter's chance to homer. Then ONE of those games to show: the first run (in
// seed order) that ends on the most common final with the favourite winning. That game is played back with its full
// play-by-play (simGame's log).
//
// WHAT IS REAL AND WHAT IS NOT. Real: every input rate (the board), the lineups and the starters the board carries, and
// every ball in play the video shows -- each one is one of that hitter's own 2026 batted balls with the same result
// (its spray spot, exit velo, launch angle), from the bot's detail file. Simulated: which result each plate appearance
// had, and so the score. The stage labels the whole thing SIMULATION.
//
// Pure: no fetch, no DOM. Deterministic: the same board gives the same numbers and the same game every time.
import { simGame } from '../gameSim'
import { surname } from '../format'
import { solveFlight } from '../trajectory'
// the five published wall anchors, interpolated across fair ground (lib/stadiumWorld.js lerp5; copied, not imported, so
// this file stays free of three.js and runs in the check script)
const lerp5 = (arr, ang) => {
  const t = (Math.max(-45, Math.min(45, ang)) + 45) / 90
  const i = Math.min(3, Math.max(0, Math.floor(t * 4)))
  return arr[i] + (arr[i + 1] - arr[i]) * (t * 4 - i)
}

export const PREPLAY_RUNS = 2000
export const PREPLAY_SEED = 7
const SEED_STEP = 7919   // simulate()'s own step, so these runs are exactly simulate()'s runs

/**
 * game (gameFrom's shape) -> the PREPLAY numbers and the game to show.
 *   { n, winPct {away, home}, fav ('away'|'home'), total {mean, p50}, extras (share past nine),
 *     modal { away, home, share } (the most common final the favourite wins), hr [{ id, name, team, p }],
 *     typical { seed, game (simGame's result), log (the halves, each with its events) } }
 */
export function preplayMlb(game, { n = PREPLAY_RUNS, seed = PREPLAY_SEED } = {}) {
  if (!game?.away?.lineup?.length || !game?.home?.lineup?.length) return null
  const wins = { away: 0, home: 0 }
  const totals = []
  const finals = new Map()       // "away-home" -> { n, first seed }
  const hr = new Map()           // player id -> { name, team, n }
  let extras = 0
  for (let i = 0; i < n; i += 1) {
    const s = seed + i * SEED_STEP
    const g = simGame(game, s)
    if (g.winner) wins[g.winner] += 1
    totals.push(g.away.runs + g.home.runs)
    if (g.inning > 9) extras += 1
    const key = `${g.away.runs}-${g.home.runs}`
    const f = finals.get(key)
    if (f) f.n += 1; else finals.set(key, { n: 1, seed: s, away: g.away.runs, home: g.home.runs })
    for (const side of ['away', 'home']) {
      for (const b of g[side].batters) {
        if (!(b.hr > 0)) continue
        const k = String(b.id ?? b.name)
        const m = hr.get(k)
        if (m) m.n += 1; else hr.set(k, { id: b.id ?? null, name: b.name, team: game[side].team, n: 1 })
      }
    }
  }
  totals.sort((a, b) => a - b)
  const fav = wins.home >= wins.away ? 'home' : 'away'
  // the most common final the favourite wins (a tie of counts goes to the earlier seed, so the pick never moves)
  let modal = null
  for (const f of finals.values()) {
    const favWon = fav === 'home' ? f.home > f.away : f.away > f.home
    if (favWon && (!modal || f.n > modal.n)) modal = f
  }
  const log = []
  const shown = modal ? simGame(game, modal.seed, log) : null
  return {
    n,
    winPct: { away: wins.away / n, home: wins.home / n },
    fav,
    total: { mean: totals.reduce((a, b) => a + b, 0) / n, p50: totals[Math.floor(0.5 * (n - 1))] },
    extras: extras / n,
    modal: modal ? { away: modal.away, home: modal.home, share: modal.n / n } : null,
    hr: [...hr.values()].map((m) => ({ id: m.id, name: m.name, team: m.team, p: m.n / n })).sort((a, b) => b.p - a.p),
    typical: shown ? { seed: modal.seed, game: shown, log } : null,
  }
}

// ── THE BALLS ───────────────────────────────────────────────────────────────

/** A spray spot (Statcast hc_x / hc_y) -> feet from the plate and degrees off centre (+ = right field side of the
 *  frame the 3D park uses). The same transform as components/SprayField.js toPolar. */
export function sprayPolar(h) {
  const x = Number(h?.hc_x), y = Number(h?.hc_y)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null
  const dx = x - 125.42, dy = 198.27 - y
  return { r: Math.sqrt(dx * dx + dy * dy) * 2.5, ang: Math.atan2(dx, dy) * (180 / Math.PI) }
}

const OUT_GB = new Set(['field_out', 'force_out', 'grounded_into_double_play', 'double_play', 'fielders_choice', 'fielders_choice_out'])
const OUT_AIR = new Set(['field_out', 'sac_fly', 'double_play'])
/** Does this real batted ball fit this simulated result? kind: HR / T / D / S / OUT / E; how: gb / air / dp / sf. */
function fits(ball, kind, how) {
  const ev = String(ball.event || ''), bb = String(ball.bb_type || '')
  switch (kind) {
    case 'HR': return ev === 'home_run'
    case 'T': return ev === 'triple'
    case 'D': return ev === 'double'
    case 'S': return ev === 'single'
    case 'E': return ev === 'field_error'
    case 'OUT':
      if (how === 'dp') return ev === 'grounded_into_double_play'
      if (how === 'sf') return ev === 'sac_fly'
      if (how === 'gb') return OUT_GB.has(ev) && bb === 'ground_ball'
      return OUT_AIR.has(ev) && (bb === 'fly_ball' || bb === 'line_drive' || bb === 'popup')
    default: return false
  }
}
// the looser fallback when a man has no ball of the exact kind (a DP with no GIDP on file: any ground-ball out)
const looser = { E: (b) => b.bb_type === 'ground_ball' && OUT_GB.has(b.event) }
const outByHow = { dp: 'gb', sf: 'air' }

// a small stable hash, so the same game always draws the same ball
const hash = (...xs) => { let h = 2166136261 >>> 0; for (const c of xs.join('|')) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619) >>> 0 } return h }

/**
 * Give every ball in play of the shown game one of that hitter's real 2026 batted balls with the same result.
 *   log: preplayMlb().typical.log; game: gameFrom's shape; balls: { [player id]: spray_chart rows };
 *   dims: the park's five wall distances (LF, LC, CF, RC, RF).
 * Picks, in order: the hand of the starter he faces when the starter is in (else either hand); for a homer, one that
 * clears THIS park's wall where it flew; for anything else, one that stays in the park. Sets e.ball = { r, ang, ev, la,
 * dist, date, pitcher, event } on each event it can; an event with no ball on file keeps none (the stage then shows
 * only the words, never a made-up flight). Returns the count { placed, missing }.
 */
export function placeBalls(log, game, balls, dims, seed = PREPLAY_SEED) {
  let placed = 0, missing = 0
  for (const half of log || []) {
    const side = half.side
    const lineup = game[side]?.lineup || []
    const starterIn = !/^BULLPEN/.test(String(half.arm || ''))
    const hand = starterIn ? String(game[side]?.pitcherRow?.pitcher_throws || '').toUpperCase() : ''
    ;(half.events || []).forEach((e, k) => {
      if (!['HR', 'T', 'D', 'S', 'OUT', 'E'].includes(e.kind)) return
      const row = lineup[e.bi]
      const pid = row?.player_id ?? row?.id
      const all = (balls?.[pid] || []).map((b) => ({ b, p: sprayPolar(b) })).filter((x) => x.p && x.p.r > 20 && Math.abs(x.p.ang) <= 45)
      const wallAt = (ang) => (dims ? lerp5(dims, ang) : 400)
      const parkOk = (x) => (e.kind === 'HR' ? x.p.r >= wallAt(x.p.ang) - 2 || Number(x.b.distance) >= wallAt(x.p.ang) : x.p.r < wallAt(x.p.ang) - 8)
      const tiers = [
        (x) => fits(x.b, e.kind, e.how) && parkOk(x) && (!hand || x.b.arm === hand),
        (x) => fits(x.b, e.kind, e.how) && parkOk(x),
        (x) => fits(x.b, e.kind, e.how),
        (x) => (looser[e.kind] ? looser[e.kind](x.b) : e.kind === 'OUT' && outByHow[e.how] ? fits(x.b, 'OUT', outByHow[e.how]) : false),
      ]
      let pool = []
      for (const t of tiers) { pool = all.filter(t); if (pool.length) break }
      if (!pool.length) { missing += 1; return }
      const x = pool[hash(seed, half.inning, side, k, pid) % pool.length]
      const ev = Number(x.b.ev), la = Number(x.b.la ?? x.b.launch_angle)
      e.ball = {
        r: x.p.r, ang: x.p.ang, ev: Number.isFinite(ev) ? ev : null, la: Number.isFinite(la) ? la : null,
        dist: Number(x.b.distance) || null, hang: Number(x.b.hang_time_s) || null, apex: Number(x.b.apex_ft) || null,
        date: x.b.date || null, pitcher: x.b.pitcher || null, event: x.b.event || null, bb: x.b.bb_type || null,
      }
      placed += 1
    })
  }
  return { placed, missing }
}

// ── THE WORDS ───────────────────────────────────────────────────────────────

const RESULT = { K: 'STRIKEOUT', BB: 'WALK', HBP: 'HIT BY PITCH', HR: 'HOME RUN', T: 'TRIPLE', D: 'DOUBLE', S: 'SINGLE', E: 'REACHES ON AN ERROR', SB: 'STOLEN BASE', CS: 'CAUGHT STEALING', WP: 'WILD PITCH', ghost: 'RUNNER ON SECOND' }
const OUT_WORD = { gb: 'GROUNDS OUT', air: 'FLIES OUT', dp: 'DOUBLE PLAY', sf: 'SAC FLY' }
const last = surname

/** One play in a few words for the ticker: "HOME RUN · Caminero · 412 ft". */
export function playWords(e, lineup = []) {
  const who = e.bi != null ? last(lineup[e.bi]?.name || lineup[e.bi]?.player_name) : ''
  let head = e.kind === 'OUT' ? (e.ball?.bb === 'popup' && e.how === 'air' ? 'POPS OUT' : e.ball?.bb === 'line_drive' && e.how === 'air' ? 'LINES OUT' : OUT_WORD[e.how] || 'OUT') : RESULT[e.kind] || e.kind
  if (e.kind === 'OUT' && e.scored?.length && e.how !== 'sf') head += ', A RUN SCORES'
  const b = e.ball
  const tail = b && (e.kind === 'HR' || e.kind === 'D' || e.kind === 'T') ? [b.dist ? `${Math.round(b.dist)} ft` : null, b.ev ? `${Math.round(b.ev)} mph` : null].filter(Boolean).join(' · ') : ''
  return [head, who, tail].filter(Boolean).join(' · ')
}

// ── THE PACE ────────────────────────────────────────────────────────────────
// ms of video. A plate appearance is quick; a ball in play takes a share of its own real hang time; a homer holds for its
// moment card. Tuned so a nine-inning game runs about a minute: an X video people finish.
// HALF_MS is the defence jogging out; THROW_MS a grounder's throw to first; MOB_MS the walk-off pile at the plate.
export const PACE = { HALF_MS: 520, PITCH_MS: 120, K_MS: 300, BB_MS: 400, RUN_MS: 340, GHOST_MS: 340, HOLD_MS: 210, THROW_MS: 240, HR_HOLD_MS: 2500, MOB_MS: 2000, INTRO_MS: 7200, END_MS: 6500 }
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))

/** The beats: one per half-inning banner, one per play, the end card. A walk-off ends the game on the winning run. */
export function beatsOf(log, P = PACE) {
  const { HALF_MS, PITCH_MS, K_MS, BB_MS, RUN_MS, GHOST_MS, HOLD_MS, THROW_MS, HR_HOLD_MS, MOB_MS, END_MS } = P
  const beats = []
  let score = { away: 0, home: 0 }, over = false
  for (const half of log) {
    if (over) break
    beats.push({ type: 'half', half, score: { ...score }, outs: 0, bases: [null, null, null], dur: HALF_MS })
    let outs = 0
    for (const e of half.events) {
      const before = { score: { ...score }, outs }
      score = { ...score, [half.side]: score[half.side] + (e.scored?.length || 0) }
      outs = e.outs
      const inPlay = !!e.ball
      let dur = PITCH_MS
      let fly = 0
      if (e.kind === 'K') dur += K_MS
      else if (e.kind === 'BB' || e.kind === 'HBP') dur += BB_MS
      else if (e.kind === 'SB' || e.kind === 'CS' || e.kind === 'WP') dur = RUN_MS
      else if (e.kind === 'ghost') dur = GHOST_MS
      else if (inPlay) {
        const air = e.ball.la > 0.5 && e.ball.ev
        const f = air ? solveFlight(e.ball.ev, e.ball.la, e.ball.r) : null
        // a hit gets a little more of its hang time than an out (the eye follows what matters)
        const k = e.kind === 'HR' ? 0.46 : e.kind === 'OUT' ? 0.18 : 0.27
        fly = f ? clamp(f.hangS * 1000 * k, e.kind === 'HR' ? 1150 : 280, e.kind === 'HR' ? 1700 : 900) : clamp(e.ball.r * 2.1, 240, 560)
        dur += fly + (e.kind === 'HR' ? HR_HOLD_MS : HOLD_MS) + ((e.scored?.length || 0) ? 300 : 0) + (e.kind === 'OUT' && (e.how === 'gb' || e.how === 'dp') ? THROW_MS * (e.how === 'dp' ? 2 : 1) : 0)
      } else dur += 420   // a play with no ball on file: the words only
      beats.push({ type: 'play', half, e, before, score: { ...score }, outs, fly, dur })
      if (half.side === 'home' && half.inning >= 9 && score.home > score.away) { over = true; const w = beats[beats.length - 1]; w.walkoff = true; w.dur += MOB_MS; break }
    }
  }
  beats.push({ type: 'final', score: { ...score }, dur: END_MS })
  let t = 0
  for (const b of beats) { b.t0 = t; t += b.dur }
  return { beats, total: t, final: score }
}

