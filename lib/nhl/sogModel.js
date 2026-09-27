// 🏒 LAMP SHOTS BOARD — lamp-sog-v1. The definition is the doc
// (docs/lamp/lamp-sog-v1-2026-09-27.md); this file IS that definition in
// code, and nothing here is not in the doc. Pure: no fetch, no clock, no
// 'use client'. lib/nhl/goalBoard.js buildNight feeds it the same
// candidates and club-stats lines the goal board already reads (no new
// call), app/api/lamp/tick locks and grades what comes out.
//
//   target  3+ shots on goal (boxscore `sog`)
//   legs    shotsPg (pooledLegs, ~82 games) · toi · oppSaPg (the opponent's
//           shots against per 60 minutes of its goalies' ice time)
//   score   mean of the legs' percentile ranks in the NIGHT's scored pool
//   rank    within the game, by score, ties by shots/GP (byScore)
//   CALLED  top 3 per game · ON THE BOARD 4th+ · NOT ON THE BOARD unscored
//
// A change to any leg, bar, window or K bumps MODEL_VERSION.
import { percentiles, byScore } from './goalModel'

export const MARKET = 'SOG'
export const MODEL_VERSION = 'lamp-sog-v1'
export const BAR = 3
export const CALLED_K = 3
export const LEGS = ['shotsPg', 'toi', 'oppSaPg']
export const LEG_LABEL = { shotsPg: 'SHOTS/GP', toi: 'TOI/GP', oppSaPg: 'OPP SA/60' }
const MIN_GOALIE_SECONDS = 5 * 3600   // "5+ games" of goalie ice time before this season's rate is used

const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * A club's shots against per 60 minutes, from its goalies' club-stats lines
 * (reduceClubStats goalies: sa, toi in seconds, season totals). This
 * season's once its goalies have 5 games of ice time, else last season's;
 * null when neither exists.
 */
export function saPer60(curGoalies = [], prevGoalies = []) {
  const rate = (gs) => {
    const sa = gs.reduce((a, g) => a + (fin(g.sa) || 0), 0)
    const secs = gs.reduce((a, g) => a + (fin(g.toi) || 0), 0)
    return secs > 0 ? { v: (sa * 3600) / secs, secs } : null
  }
  const cur = rate(curGoalies)
  if (cur && cur.secs >= MIN_GOALIE_SECONDS) return cur.v
  const prev = rate(prevGoalies)
  return prev ? prev.v : cur ? cur.v : null
}

/** A goal-board candidate's pooledLegs() result + the opponent's SA/60 → this model's legs. */
export function sogLegs(pooled, oppSaPg) {
  if (!pooled?.ok) return pooled || { ok: false, reason: 'no line' }
  return { ok: true, shotsPg: pooled.shotsPg, toi: pooled.toi, oppSaPg: fin(oppSaPg), gpPooled: pooled.gpPooled, gpCur: pooled.gpCur, gpPrev: pooled.gpPrev, prevWeight: pooled.prevWeight }
}

/**
 * Score a night. candidates: [{ gameId, playerId, name, pos, team, opp,
 * home, legs: sogLegs() result, context }]. A leg with no value (e.g. the
 * opponent's SA/60 missing) is left out of that man's mean, as in
 * lamp-goal-v1.
 */
export function scoreSogNight(candidates) {
  const scored = candidates.filter((c) => c.legs?.ok)
  const pct = {}
  for (const leg of LEGS) {
    const p = percentiles(scored.map((c) => c.legs[leg]))
    scored.forEach((c, i) => { pct[c.playerId] = pct[c.playerId] || {}; pct[c.playerId][leg] = p[i] })
  }
  const rows = candidates.map((c) => {
    if (!c.legs?.ok) return { ...c, pct: null, score: null, rank: null, status: 'off', reason: c.legs?.reason || 'no line' }
    const ps = pct[c.playerId]
    const present = LEGS.filter((l) => ps[l] != null)
    const score = present.length ? Math.round(present.reduce((s, l) => s + ps[l], 0) / present.length) : null
    return { ...c, pct: ps, score, rank: null, status: score == null ? 'off' : 'board', reason: score == null ? 'no leg could be ranked' : null }
  })
  const byGame = new Map()
  for (const r of rows) { if (r.score == null) continue; if (!byGame.has(r.gameId)) byGame.set(r.gameId, []); byGame.get(r.gameId).push(r) }
  for (const list of byGame.values()) {
    list.sort(byScore)
    list.forEach((r, i) => { r.rank = i + 1; r.status = i < CALLED_K ? 'called' : 'board' })
  }
  return rows
}

/**
 * Grade against a final boxscore's playerByGameStats (raw feed shape).
 * value = his sog; hit = value >= BAR; not dressed = void (hit null).
 */
export function gradeSogRows(rows, playerByGameStats) {
  const sogById = new Map()
  for (const side of ['awayTeam', 'homeTeam']) {
    for (const grp of ['forwards', 'defense']) for (const s of playerByGameStats?.[side]?.[grp] || []) sogById.set(Number(s.playerId), Number(s.sog) || 0)
  }
  return rows.map((r) => {
    const dressed = sogById.has(Number(r.player_id ?? r.playerId))
    const value = dressed ? sogById.get(Number(r.player_id ?? r.playerId)) : null
    return { ...r, dressed, value, hit: dressed ? value >= BAR : null }
  })
}

/** A scored row → the lamp_prop_log column shape. */
export function toPropRow(r, g, day, lockedAtIso) {
  return {
    game_id: g.id, player_id: r.playerId, market: MARKET, model_version: MODEL_VERSION,
    game_date: day.date, season: g.season, game_type: g.gameType, start_utc: g.startUtc,
    team: r.team, opp: r.opp, home: r.home, name: r.name, pos: r.pos, bar: BAR,
    legs: r.legs?.ok ? { shotsPg: r.legs.shotsPg, toi: r.legs.toi, oppSaPg: r.legs.oppSaPg, gpPooled: r.legs.gpPooled, gpCur: r.legs.gpCur, gpPrev: r.legs.gpPrev, prevWeight: r.legs.prevWeight } : null,
    pct: r.pct, score: r.score, rank_in_game: r.rank, status: r.status, reason: r.reason || null,
    context: r.context, locked_at: lockedAtIso,
  }
}
