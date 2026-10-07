// BUCKETS' SIX MARKETS (BATCH-BUCKETS B3, 2026-10-02). The definition is
// .claude-notes/BUCKETS-DEFINITION.md -- this file is that definition in code,
// on the shared core (lib/model/core.js scoreSlate). Pure: no fetch, no clock.
//   pooled legs   this season and last, weighted by games (window 82, LAMP's rule)
//   min games     10 pooled games to be scored; otherwise "unscored", reason kept
//   calls         the top scorer on EACH team in a game; the game's higher one is
//                 TOP, the other BUCKET -- only while he is ON THE BOARD (top third)
import { scoreSlate, pooled } from '../model/core'

export const MIN_GAMES = 10
const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// market -> { version, bar, legs, label, target(box line) }
export const NBA_MARKETS = {
  pts: { version: 'buckets-pts-v1', label: 'PTS 25+', bar: 25, legs: ['ptsPg', 'minPg', 'fgaPg', 'ftaPg', 'oppPts'], tie: 'ptsPg', actual: (b) => b.pts },
  reb: { version: 'buckets-reb-v1', label: 'REB 10+', bar: 10, legs: ['rebPg', 'minPg', 'oppReb'], tie: 'rebPg', actual: (b) => b.reb },
  ast: { version: 'buckets-ast-v1', label: 'AST 8+', bar: 8, legs: ['astPg', 'minPg', 'fgaPg', 'oppAst'], tie: 'astPg', actual: (b) => b.ast },
  '3pm': { version: 'buckets-3pm-v1', label: '3PM 4+', bar: 4, legs: ['tpmPg', 'tpaPg', 'tpPct', 'oppTpm'], tie: 'tpmPg', actual: (b) => b.tpm },
  pra: { version: 'buckets-pra-v1', label: 'PRA 35+', bar: 35, legs: ['praPg', 'minPg', 'fgaPg', 'oppPts'], tie: 'praPg', actual: (b) => (b.pts == null ? null : b.pts + (b.reb || 0) + (b.ast || 0)) },
  first: { version: 'buckets-first-v1', label: 'FIRST BASKET', bar: null, legs: ['fgaShare', 'ptsPg', 'minPg'], tie: 'fgaShare', startersOnly: true, highVariance: true },
}

// LIVE VERSIONS: every reader of buckets_log reads these and nothing else, so a
// shadow's rows (NBA_SHADOWS) can sit in the same table without reaching a page.
export const LIVE_VERSIONS = Object.values(NBA_MARKETS).map((d) => d.version)

// SHADOW (BATCH-MODEL-V2 M2, 2026-10-03): PTS 25+ with this season's minutes
// (minCur) in place of the two-season pool (minPg). Locked beside the live
// board into buckets_log (same market, its own model_version), graded by the
// same tick, read by /admin/buckets only. Nothing public changes; it goes live
// only as a new version on a measured lead. Can't be backtested: no NBA
// minutes history is stored, so it starts recording on opening night.
export const NBA_SHADOWS = {
  pts: { version: 'buckets-pts-mincur-v1', market: 'pts', legs: ['ptsPg', 'minCur', 'fgaPg', 'ftaPg', 'oppPts'], tie: 'ptsPg' },
}
/** Score a shadow for the night, exactly as scoreMarket scores its market. */
export function scoreShadow(key, candidates) {
  const S = NBA_SHADOWS[key]
  return scoreSlate(candidates, S.legs, { roles: ['TOP', 'BUCKET'], secondNeedsBoard: true, tie: S.tie })
}

/** One player's pooled legs for every market, from the two season lines + his opponent's allowed. */
export function legsFor(cur, prev, opp, { leagueTpPct = null, teamFga = null } = {}) {
  const P = pooled(cur, prev)
  if (P.gp < MIN_GAMES) return { ok: false, reason: `fewer than ${MIN_GAMES} NBA games on file (${Math.round(P.gp)})`, gp: P.gp }
  const pts = P.rate('pts'), reb = P.rate('reb'), ast = P.rate('ast')
  // 3P%: pooled makes / attempts, his own once he has 30 attempts, else the league's (said so)
  const tpMade = (fin(cur?.tpTot) || 0) + (fin(prev?.tpTot) || 0) * P.w
  const tpAtt = (fin(cur?.tpaTot) || 0) + (fin(prev?.tpaTot) || 0) * P.w
  const ownPct = tpAtt >= 30 ? tpMade / tpAtt : null
  return {
    ok: true, gp: P.gp, gpCur: P.gpCur, gpPrev: P.gpPrev, prevWeight: P.w,
    ptsPg: pts, rebPg: reb, astPg: ast, minPg: P.rate('min'), fgaPg: P.rate('fga'), ftaPg: P.rate('fta'),
    tpmPg: P.rate('tpm'), tpaPg: P.rate('tpa'), tpPct: ownPct ?? leagueTpPct, tpPctSource: ownPct != null ? 'his own (30+ attempts)' : 'the league average (under 30 attempts)',
    praPg: pts == null ? null : pts + (reb || 0) + (ast || 0),
    // PLAYING TIME NOW (BATCH-MODEL-V2 M2, 2026-10-03): this season's minutes
    // once he has 3 games, else the pooled number -- a role change shows here
    // weeks before the two-season pool moves. Only the shadow reads it.
    minCur: P.gpCur >= 3 && fin(cur?.min) != null ? fin(cur.min) : P.rate('min'),
    fgaShare: teamFga && P.rate('fga') != null ? P.rate('fga') / teamFga : null,
    oppPts: fin(opp?.oppPts), oppReb: fin(opp?.oppReb), oppAst: fin(opp?.oppAst), oppTpm: fin(opp?.oppTpm),
  }
}

/** Score one market for the night: candidates carry `legs` = legsFor(...) (all markets' legs at once). */
export function scoreMarket(market, candidates) {
  const M = NBA_MARKETS[market]
  const pool = M.startersOnly
    ? candidates.map((c) => (c.starter ? c : { ...c, legs: { ok: false, reason: 'not a listed starter (first basket is the ten starters only)' } }))
    : candidates
  return scoreSlate(pool, M.legs, { roles: ['TOP', 'BUCKET'], secondNeedsBoard: true, tie: M.tie })
}

/** "Why is he 87?" in the market's own legs. */
export function whyNba(market, row) {
  if (!row?.pct) return row?.reason || ''
  const ord = (p) => { const n = Math.round(p); const r = n % 100; return `${n}${r >= 11 && r <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th'}` }
  const WORD = { ptsPg: 'points', rebPg: 'rebounds', astPg: 'assists', minPg: 'minutes', fgaPg: 'shots', ftaPg: 'free throws', tpmPg: 'threes made', tpaPg: 'threes tried', tpPct: '3P%', praPg: 'PRA', fgaShare: 'shot share', oppPts: 'opponent points allowed', oppReb: 'opponent rebounds allowed', oppAst: 'opponent assists allowed', oppTpm: 'opponent threes allowed' }
  return NBA_MARKETS[market].legs.filter((l) => row.pct[l] != null).map((l) => `${WORD[l]} ${ord(row.pct[l])}`).join(' · ') + ' percentile tonight'
}

/** A finished box line -> the grade for one market row. */
export function gradeNba(market, row, box, firsts = null) {
  const M = NBA_MARKETS[market]
  // FIRST BASKET (Donovan, 2026-10-06): graded by who actually scored first,
  // whatever his minutes -- a starter who scores it and is hurt at minute 8 is
  // a hit, and a scorer with no box line is too. `row.firstKey` picks the feed
  // field: firstFieldGoal (first_fg, default) or firstPoints (first_pts).
  // Every other market keeps the under-10-minutes void below.
  if (market === 'first') {
    const scorer = firsts?.[row.firstKey || 'firstFieldGoal']?.player_id
    const mine = scorer != null && String(scorer) === String(row.playerId)
    const minutes = box && !box.dnp && box.min != null ? box.min : null
    if (mine) return { played: true, minutes, actual: 1, hit: true, void_reason: null }
    if (!box || box.dnp || box.min == null) return { played: false, hit: null, actual: null, void_reason: 'did not play' }
    if (box.min < 10) return { played: true, minutes: box.min, hit: null, actual: null, void_reason: `played ${box.min} minutes (under 10)` }
    if (!box.starter) return { played: true, minutes: box.min, hit: null, actual: null, void_reason: 'did not start' }
    if (scorer == null) return { played: true, minutes: box.min, hit: null, actual: null, void_reason: 'no made basket in the feed' }
    return { played: true, minutes: box.min, actual: 0, hit: false, void_reason: null }
  }
  if (!box || box.dnp || box.min == null) return { played: false, hit: null, actual: null, void_reason: 'did not play' }
  if (box.min < 10) return { played: true, minutes: box.min, hit: null, actual: null, void_reason: `played ${box.min} minutes (under 10)` }
  const actual = M.actual(box)
  return { played: true, minutes: box.min, actual, hit: actual != null ? actual >= M.bar : null, void_reason: actual == null ? 'no box line' : null }
}
