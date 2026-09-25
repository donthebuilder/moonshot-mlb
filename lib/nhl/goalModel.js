// 🏒 LAMP GOAL BOARD — lamp-goal-v1. The definition is the doc
// (claude/lamp-goal-board-v1-2026-09-25.md); this file IS that definition
// in code, and nothing here is not in the doc. Pure: no fetch, no clock,
// no 'use client'. The tick (app/api/lamp/tick) feeds it reduced payloads
// and stores what comes out; the board page renders the same rows.
//
//   legs        three per-game rates over the last ~82 NHL games
//   score       the mean of the three legs' percentile ranks in the
//               NIGHT's scored population, 0–100
//   rank        within the game, by score, ties by shots/GP
//   CALLED      top 3 in the game · ON THE BOARD = scored, 4th+ ·
//               NOT ON THE BOARD = on the roster, not scored (reason kept)
//
// A change to any leg, weight, window or K bumps MODEL_VERSION; rows in
// the log keep the version they were scored under.
export const MODEL_VERSION = 'lamp-goal-v1'
export const WINDOW_GAMES = 82
export const MIN_GAMES = 10
export const CALLED_K = 3
export const LEGS = ['shotsPg', 'goalsPg', 'toi']
export const LEG_LABEL = { shotsPg: 'SHOTS/GP', goalsPg: 'GOALS/GP', toi: 'TOI/GP' }

const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

/**
 * The pooled per-game rates for one skater from two season lines
 * (reduceClubStats rows: gp, shots, g, toi in seconds). `cur` is this
 * season's line (may be absent), `prev` last season's (may be absent).
 * Returns null when fewer than MIN_GAMES pooled games exist.
 */
export function pooledLegs(cur, prev) {
  const gpC = fin(cur?.gp) || 0
  const gpP = fin(prev?.gp) || 0
  const w = gpP > 0 ? Math.min(1, Math.max(0, WINDOW_GAMES - gpC) / gpP) : 0
  const gp = gpC + gpP * w
  if (gp < MIN_GAMES) return { ok: false, reason: `fewer than ${MIN_GAMES} NHL games on file (${Math.round(gp)})`, gpPooled: gp, gpCur: gpC, gpPrev: gpP, prevWeight: w }
  const shots = (fin(cur?.shots) || 0) + (fin(prev?.shots) || 0) * w
  const goals = (fin(cur?.g) || 0) + (fin(prev?.g) || 0) * w
  // TOI: this season's rate once it means something (5+ GP), else last season's.
  const toi = gpC >= 5 && fin(cur?.toi) != null ? cur.toi : (fin(prev?.toi) != null ? prev.toi : (fin(cur?.toi) ?? null))
  return {
    ok: true, gpPooled: gp, gpCur: gpC, gpPrev: gpP, prevWeight: w,
    shotsPg: shots / gp, goalsPg: goals / gp, toi,
  }
}

/** Percentile rank (0–100) of each value within `values`; ties share the mean rank. */
export function percentiles(values) {
  const idx = values.map((v, i) => [v, i]).filter(([v]) => fin(v) != null).sort((a, b) => a[0] - b[0])
  const out = new Array(values.length).fill(null)
  const n = idx.length
  if (!n) return out
  let i = 0
  while (i < n) {
    let j = i
    while (j + 1 < n && idx[j + 1][0] === idx[i][0]) j++
    const meanRank = (i + j) / 2                     // 0-based, ties averaged
    const pct = n === 1 ? 50 : (meanRank / (n - 1)) * 100
    for (let k = i; k <= j; k++) out[idx[k][1]] = pct
    i = j + 1
  }
  return out
}

/**
 * Score a night.
 * @param {Array} candidates  [{ gameId, playerId, name, pos, team, opp, home, legs: pooledLegs() result, context }]
 * @returns rows with pct per leg, score, rank (per game), status: 'called' | 'board' | 'off'
 */
export function scoreNight(candidates) {
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
  // rank within each game
  const byGame = new Map()
  for (const r of rows) { if (r.score == null) continue; if (!byGame.has(r.gameId)) byGame.set(r.gameId, []); byGame.get(r.gameId).push(r) }
  for (const list of byGame.values()) {
    list.sort((a, b) => (b.score - a.score) || ((b.legs.shotsPg || 0) - (a.legs.shotsPg || 0)) || String(a.name).localeCompare(String(b.name)))
    list.forEach((r, i) => { r.rank = i + 1; r.status = i < CALLED_K ? 'called' : 'board' })
  }
  return rows
}

/** "Why is he 87?" in one line, from a scored row. */
export function whyLine(row) {
  if (!row?.pct) return row?.reason || ''
  const ord = (p) => { const n = Math.round(p); const r = n % 100; return `${n}${r >= 11 && r <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}` }
  return `shots ${ord(row.pct.shotsPg)} · goals ${ord(row.pct.goalsPg)} · ice time ${ord(row.pct.toi)} percentile tonight`
}

/**
 * Grade locked rows against a final boxscore's playerByGameStats
 * (raw feed shape). dressed = present; goals = the goals column; hit =
 * goals >= 1; a man not dressed is void (hit null).
 */
export function gradeRows(rows, playerByGameStats) {
  const goalsById = new Map()
  for (const side of ['awayTeam', 'homeTeam']) {
    for (const grp of ['forwards', 'defense']) for (const s of playerByGameStats?.[side]?.[grp] || []) goalsById.set(Number(s.playerId), Number(s.goals) || 0)
  }
  return rows.map((r) => {
    const dressed = goalsById.has(Number(r.playerId))
    const goals = dressed ? goalsById.get(Number(r.playerId)) : null
    return { ...r, dressed, goals, hit: dressed ? goals >= 1 : null }
  })
}

/**
 * THE NUMBER for a set of graded rows (one night or a season):
 * of the skaters who scored, how many were called / on the board; the
 * called hit rate; hit rate by rank band.
 */
export function coverage(graded) {
  const g = graded.filter((r) => r.dressed)
  const scorers = g.filter((r) => r.hit)
  const called = g.filter((r) => r.status === 'called')
  const band = (lo, hi) => { const b = g.filter((r) => r.rank != null && r.rank >= lo && r.rank <= hi); return { n: b.length, hits: b.filter((r) => r.hit).length } }
  return {
    dressed: g.length, scorers: scorers.length,
    scorersCalled: scorers.filter((r) => r.status === 'called').length,
    scorersOnBoard: scorers.filter((r) => r.status === 'board').length,
    scorersOff: scorers.filter((r) => r.status === 'off').length,
    calledN: called.length, calledHits: called.filter((r) => r.hit).length,
    baseRate: g.length ? scorers.length / g.length : null,
    bands: { top3: band(1, 3), r4to8: band(4, 8), r9to15: band(9, 15), r16plus: band(16, 999) },
  }
}
