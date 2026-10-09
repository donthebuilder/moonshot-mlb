// TUDDY'S TEAM TOUCHDOWN MODEL (2026-10-08, fix9-nfldial-1008).
//
// ONE source for "expected touchdowns" in a game. Before this the slate dial,
// the game header, the Games tile and the headline pick each summed the
// players' xTD themselves (a roster sum: it moves with who the bot happens to
// score, and an injured star's missing xTD lowers the game). The owner's rule:
// the projection of a game comes from a TEAM model, in every sport.
//
// WHAT IT IS. For each club, from the game logs the site already loads
// (nfl_logs.json: every tracked player's touchdowns, game by game, last season
// and this one):
//   offence  = the club's touchdowns a game, recent games weighted, shrunk
//              toward the league average while the sample is small
//   defence  = the touchdowns the club's opponents scored against it, the same way
//   expected = COVER * (league + A * (offence - league) + B * (opposing defence - league))
// and a game's total is both clubs. Home field and rest days were tested and
// left out: both made the held-out score worse (see the backtest, --extras). A count, not a probability: it is never
// printed as a chance (scripts/check-no-printed-probability.mjs).
//
// WHAT "TOUCHDOWN" MEANS HERE. The logs carry the touchdowns of the tracked
// skill players (rushing + receiving, 85-90% of a club's offensive scores).
// The model is fit and read in that same unit, so the dial and the game it
// is compared with count the same thing. The coefficients below were chosen by
// held-out games (scripts/backtest-nfl-team-td.mjs): fit on 2025 weeks 5-18
// one week at a time, then scored untouched on 2026 weeks 1-4.
//
// Pure functions, no I/O. Tests: scripts/check-nfl-team-td.mjs (TEST data).

export const TD_WORD = 'expected touchdowns'
export const TD_WORD_SHORT = 'Expected TDs'
export const TD_UNIT = 'expected TD'   // the unit on a small pill: "5.9 expected TD"

// Tuned by held-out games (see the backtest). Plain numbers on purpose.
export const PARAMS = {
  carry: 0.4,     // weight of last season's games next to this season's (each game)
  k: 6,           // games of league-average pulled into every rate (shrink early season)
  a: 0.65,        // how much a club's own offence moves its number
  b: 0.35,        // how much the opposing defence moves it
  cover: 1.242,   // tracked skill-player touchdowns -> all of a club's offensive touchdowns:
                  // 2025 REG, nflverse team stats (rushing + passing TDs) / the logs' tracked TDs
}

const ord = (s, w) => s * 100 + w

/** teamGames(logs) -> [{ s, w, tm, opp, td, d, h }] one row per club per game, oldest first.
 *  A club's touchdowns are the sum over its tracked players' g_td that game. */
export function teamGames(logs) {
  const map = new Map()
  const src = logs?.logs || logs || {}
  for (const pid of Object.keys(src)) {
    for (const e of src[pid]?.log || []) {
      if (!e || !e.tm || !e.opp || !Number.isFinite(e.s) || !Number.isFinite(e.w)) continue
      const key = `${e.s}|${e.w}|${e.tm}`
      let r = map.get(key)
      if (!r) { r = { s: e.s, w: e.w, tm: e.tm, opp: e.opp, td: 0, d: e.d || null, h: e.h === 1 ? 1 : e.h === 0 ? 0 : null }; map.set(key, r) }
      r.td += Number(e.g_td) || 0
    }
  }
  return [...map.values()].sort((x, y) => ord(x.s, x.w) - ord(y.s, y.w))
}

/** Fit every club's rates from the games BEFORE (season, week). Never reads (season, week) or later. */
export function fitTeams(rows, season, week, params = PARAMS) {
  const cut = ord(season, week)
  const { carry, k } = params
  const wOf = (r) => (r.s === season ? 1 : carry)
  let sw = 0; let swt = 0
  const off = new Map(); const def = new Map()
  const bump = (m, t, w, td) => { const o = m.get(t) || { w: 0, t: 0, n: 0 }; o.w += w; o.t += w * td; o.n += 1; m.set(t, o) }
  for (const r of rows) {
    if (ord(r.s, r.w) >= cut) continue
    const w = wOf(r)
    sw += w; swt += w * r.td
    bump(off, r.tm, w, r.td); bump(def, r.opp, w, r.td)
  }
  const mu = sw > 0 ? swt / sw : null
  const fin = (m) => {
    const out = new Map()
    for (const [t, o] of m) out.set(t, { rate: mu == null ? null : (o.t + k * mu) / (o.w + k), games: o.n })
    return out
  }
  return { mu, off: fin(off), def: fin(def), season, week, rows, params }
}

/** One club's expected touchdowns against `opp`. */
export function teamExpected(model, tm, opp) {
  const { mu } = model
  if (mu == null) return null
  const P = model.params
  const o = model.off.get(tm)?.rate ?? mu
  const d = model.def.get(opp)?.rate ?? mu
  let e = mu + P.a * (o - mu) + P.b * (d - mu)
  return Math.max(0.2, e) * (P.cover || 1)
}

/** A game: { away, home, total, awayTd, homeTd } or null when there is nothing to fit from. */
export function projectGame(model, away, home) {
  const a = teamExpected(model, away, home)
  const h = teamExpected(model, home, away)
  if (a == null || h == null) return null
  return { away, home, awayTd: a, homeTd: h, total: a + h }
}

const CACHE = new WeakMap()   // logs payload -> Map('season|week|mode' -> result): one fit per payload, not one per component

/** Every game on a week file: { [game_id]: { away, home, awayTd, homeTd, total, heat } }.
 *  `week` is the nfl_week.json payload, `logs` the nfl_logs.json payload. `heat` is the game's place (0..1) in the
 *  league distribution of the number (every club pairing), not in whichever games a filter happens to show.
 *  Null-safe: with no logs the result is {} and callers show no dial rather than a made-up one. */
export function slateTotals(week, logs) {
  const out = {}
  const games = week?.games || []
  if (!games.length || !logs || typeof logs !== 'object') return out
  const season = Number(week?.season) || 0
  const wk = week?.mode === 'preseason' ? 0 : Number(week?.week) || 1
  if (!season) return out
  const ck = `${season}|${wk}|${games.map((g) => g.game_id).join(',')}`
  let byKey = CACHE.get(logs)
  if (!byKey) { byKey = new Map(); CACHE.set(logs, byKey) }
  if (byKey.has(ck)) return byKey.get(ck)
  const rows = teamGames(logs)
  if (rows.length) {
    const model = fitTeams(rows, season, wk)
    const league = leagueTotals(model)
    for (const g of games) {
      const p = projectGame(model, g.away, g.home)
      if (p) out[g.game_id] = { ...p, heat: placeIn(league, p.total) }
    }
  }
  byKey.set(ck, out)
  return out
}

/** A slate's total: the sum of its games' totals (the header tile). */
export const sumTotals = (totals) => Object.values(totals || {}).reduce((a, g) => a + (g?.total || 0), 0)

/** The league distribution of the number: a game total for every club pair (A at B), sorted.
 *  The heat lights read a game's place in THIS, not in whichever games a filter happens to show. */
export function leagueTotals(model) {
  const teams = [...new Set([...model.off.keys(), ...model.def.keys()])]
  const out = []
  for (const a of teams) for (const h of teams) if (a !== h) { const p = projectGame(model, a, h); if (p) out.push(p.total) }
  return out.sort((x, y) => x - y)
}

/** Place of `v` in the sorted distribution, 0..1 (share of league pairings at or below it). */
export function placeIn(sorted, v) {
  if (!sorted.length || !Number.isFinite(v)) return 0
  let lo = 0; let hi = sorted.length
  while (lo < hi) { const m = (lo + hi) >> 1; if (sorted[m] <= v) lo = m + 1; else hi = m }
  return lo / sorted.length
}
