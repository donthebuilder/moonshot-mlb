// 🏒 LAMP POINTS — lamp-pts-v1. SHADOW MODEL: written to the record
// (lamp_prop_log, market 'PTS') at the same lock as lamp-goal-v1 and graded
// off the same boxscore, but NOTHING on the site reads it (it is not in
// boardRead's BOARD_MARKETS). The definition is the doc
// (docs/lamp/lamp-pts-ast-v1-2026-10-01.md); this file is that definition in
// code. Pure: no fetch, no clock, no 'use client'. lib/nhl/goalBoard.js
// buildNight feeds it the same candidates and club-stats lines the goal
// board already reads (no new call). No claim of accuracy is made: it exists
// to be measured.
//
//   target  1+ points (boxscore `points` = goals + assists)
//   legs    ptsPg   points per game over his last ~82 NHL games, pooled with
//                   lamp-goal-v1's weighting -- the target's own rate, the
//                   most direct thing the feed has.
//           toi     average ice time -- more minutes, more shifts on the ice
//                   when his team scores (same TOI rule as lamp-goal-v1).
//           oppGaPg the opponent's goals against per game (standings, already
//                   on every candidate's context) -- a point needs his team
//                   to score; shared by teammates, so it only moves one side
//                   of a game against the other and the rest of the night.
//           Not used: power-play points. The club-stats feed carries PP
//           GOALS only (no PP assists / PPP), and no new call is added.
//   score   mean of the legs' percentile ranks in the NIGHT's scored pool
//   rank    within the game, by score, ties by points/GP then name
//   CALLED  top 3 per game · ON THE BOARD 4th+ · NOT ON THE BOARD unscored
//
// A change to any leg, bar, window or K bumps MODEL_VERSION.
import { percentiles } from './goalModel'

export const MARKET = 'PTS'
export const MODEL_VERSION = 'lamp-pts-v1'
export const BAR = 1
export const CALLED_K = 3
export const LEGS = ['ptsPg', 'toi', 'oppGaPg']
export const LEG_LABEL = { ptsPg: 'PTS/GP', toi: 'TOI/GP', oppGaPg: 'OPP GA/GP' }

const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * Points and assists per game over the same pooled window pooledLegs() used
 * (its gpPooled and prevWeight), from the two club-stats lines
 * (reduceClubStats rows: pts, a). Returns null when the pooled line is not ok.
 */
export function pointRates(pooled, cur, prev) {
  if (!pooled?.ok || !(pooled.gpPooled > 0)) return null
  const w = fin(pooled.prevWeight) || 0
  const pts = (fin(cur?.pts) || 0) + (fin(prev?.pts) || 0) * w
  const a = (fin(cur?.a) || 0) + (fin(prev?.a) || 0) * w
  return { ptsPg: pts / pooled.gpPooled, astPg: a / pooled.gpPooled }
}

/** A goal-board candidate's pooledLegs() result + pointRates() + opp GA/GP → this model's legs. */
export function ptsLegs(pooled, rates, oppGaPg) {
  if (!pooled?.ok) return pooled || { ok: false, reason: 'no line' }
  if (!rates) return { ok: false, reason: 'no points line' }
  return { ok: true, ptsPg: rates.ptsPg, toi: pooled.toi, oppGaPg: fin(oppGaPg), gpPooled: pooled.gpPooled, gpCur: pooled.gpCur, gpPrev: pooled.gpPrev, prevWeight: pooled.prevWeight }
}

/**
 * The shared scorer for the shadow prop models: percentile rank each leg in
 * the night's scored pool, mean the present legs, rank within the game by
 * score then `tieLeg`, top K CALLED. A leg with no value is left out of that
 * man's mean (as in lamp-goal-v1 / lamp-sog-v1).
 */
export function scoreLegsNight(candidates, legs, tieLeg, k = CALLED_K) {
  const scored = candidates.filter((c) => c.legs?.ok)
  const pct = {}
  for (const leg of legs) {
    const p = percentiles(scored.map((c) => c.legs[leg]))
    scored.forEach((c, i) => { pct[c.playerId] = pct[c.playerId] || {}; pct[c.playerId][leg] = p[i] })
  }
  const rows = candidates.map((c) => {
    if (!c.legs?.ok) return { ...c, pct: null, score: null, rank: null, status: 'off', reason: c.legs?.reason || 'no line' }
    const ps = pct[c.playerId]
    const present = legs.filter((l) => ps[l] != null)
    const score = present.length ? Math.round(present.reduce((s, l) => s + ps[l], 0) / present.length) : null
    return { ...c, pct: ps, score, rank: null, status: score == null ? 'off' : 'board', reason: score == null ? 'no leg could be ranked' : null }
  })
  const cmp = (a, b) => (b.score - a.score) || ((b.legs?.[tieLeg] || 0) - (a.legs?.[tieLeg] || 0)) || String(a.name).localeCompare(String(b.name))
  const byGame = new Map()
  for (const r of rows) { if (r.score == null) continue; if (!byGame.has(r.gameId)) byGame.set(r.gameId, []); byGame.get(r.gameId).push(r) }
  for (const list of byGame.values()) {
    list.sort(cmp)
    list.forEach((r, i) => { r.rank = i + 1; r.status = i < k ? 'called' : 'board' })
  }
  return rows
}

export const scorePtsNight = (candidates) => scoreLegsNight(candidates, LEGS, 'ptsPg')

/**
 * Grade against a final boxscore's playerByGameStats (raw feed shape):
 * value = his `field` count; hit = value >= bar; not dressed = void (hit null).
 */
export function gradeCountRows(rows, playerByGameStats, field, bar) {
  const byId = new Map()
  for (const side of ['awayTeam', 'homeTeam']) {
    for (const grp of ['forwards', 'defense']) for (const s of playerByGameStats?.[side]?.[grp] || []) byId.set(Number(s.playerId), Number(s[field]) || 0)
  }
  return rows.map((r) => {
    const dressed = byId.has(Number(r.player_id ?? r.playerId))
    const value = dressed ? byId.get(Number(r.player_id ?? r.playerId)) : null
    return { ...r, dressed, value, hit: dressed ? value >= bar : null }
  })
}

export const gradePtsRows = (rows, pbgs) => gradeCountRows(rows, pbgs, 'points', BAR)

/** The lamp_prop_log column shape for any shadow market. */
export function propRow(r, g, day, lockedAtIso, { market, version, bar, legs }) {
  return {
    game_id: g.id, player_id: r.playerId, market, model_version: version,
    game_date: day.date, season: g.season, game_type: g.gameType, start_utc: g.startUtc,
    team: r.team, opp: r.opp, home: r.home, name: r.name, pos: r.pos, bar,
    legs: r.legs?.ok ? Object.fromEntries([...legs, 'gpPooled', 'gpCur', 'gpPrev', 'prevWeight'].map((k) => [k, r.legs[k] ?? null])) : null,
    pct: r.pct, score: r.score, rank_in_game: r.rank, status: r.status, reason: r.reason || null,
    context: r.context, locked_at: lockedAtIso,
  }
}

export const toPtsRow = (r, g, day, lockedAtIso) => propRow(r, g, day, lockedAtIso, { market: MARKET, version: MODEL_VERSION, bar: BAR, legs: LEGS })
