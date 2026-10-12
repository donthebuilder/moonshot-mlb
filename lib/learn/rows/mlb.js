// MLB: por_rows (the board as it stood at each game's lock) + outcome_log -> LearnRows (2026-10-12, accuracy loop).
// Pure. The script fetches the files; this joins them with the SAME rules the locked record uses
// (lib/record/mlbLocked.js: finalOutcomes, played, lockedBeforeFirstPitch) and labels with lib/callStatus.
//
// One analysis per LANE, each on its own bar (lib/pickJob PICK_JOBS):
//   HR       called = TOP or HR role (HR_CALL_ROLES)        produced = 1+ HR
//   HIT      called = HIT role                              produced = 1+ hit
//   HRR      called = HRR role                              produced = 2+ H+R+RBI
//   CONTACT  called = CONTACT role                          produced = 2+ total bases
// A hitter without the lane's role is ON THE BOARD or NOT ON THE BOARD by his rank on THAT lane's score against
// the night's board, through callStatus's own top-third cut (boardCut) -- the label is never typed here.
import { callStatus, hasRoleIn, CALL_ROLES, HR_CALL_ROLES } from '../../callStatus'
import { PICK_JOBS } from '../../pickJob'
import { played, lockedBeforeFirstPitch } from '../../record/mlbLocked'
import { numericFeatures } from '../features'

export const MLB_LANE = {
  HR: { roles: HR_CALL_ROLES, score: 'hr' },
  HIT: { roles: ['HIT'], score: 'hit' },
  HRR: { roles: ['HRR'], score: 'hrr' },
  CONTACT: { roles: ['CONTACT'], score: 'contact' },
}
const n0 = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }
const lineOf = (o) => ({ gotHr: o.went_yard === true || n0(o.home_runs) > 0, hits: n0(o.hits), runs: n0(o.runs), rbi: n0(o.rbi), tb: n0(o.total_bases) })

/**
 * @param date      the por file's date
 * @param por       parsed por_rows
 * @param outcomes  Map 'pk|pid' -> latest FINAL outcome (finalOutcomes)
 * @param games     Map pk -> { start (ms), type, date }
 * @param season    'R' (regular, default) or 'post'
 */
export function mlbRows({ date, por, outcomes, games, lane = 'HR', season = 'R' }) {
  const L = MLB_LANE[lane]
  const test = PICK_JOBS[lane].test
  const seen = new Set()
  const rated = []
  for (const r of por || []) {
    const pk = String(r?.game_pk ?? ''), pid = String(r?.player_id ?? '')
    if (!pk || !pid || seen.has(`${pk}|${pid}`)) continue
    seen.add(`${pk}|${pid}`)
    const g = games.get(pk)
    if (!g) continue
    if (season === 'R' ? g.type !== 'R' : !['F', 'D', 'L', 'W'].includes(g.type)) continue
    const sc = Number(r.scores?.[L.score])
    rated.push({ r, pk, pid, g, sc: Number.isFinite(sc) ? sc : null })
  }
  // board rank on the lane's score, one rank per hitter-game (highest first), and the board's size
  const ranked = rated.filter((x) => x.sc != null).sort((a, b) => b.sc - a.sc)
  const rank = new Map(ranked.map((x, i) => [`${x.pk}|${x.pid}`, i + 1]))
  const of = new Set(ranked.map((x) => x.pid)).size
  return rated.map(({ r, pk, pid, g, sc }) => {
    const called = hasRoleIn(r.game_pick_role, L.roles)
    // a ranking-band role (WATCH, TOP15) keeps its ON THE BOARD reading; another lane's call does not count here
    const tokens = String(r.game_pick_role || '').toUpperCase().split(/[^A-Z0-9]+/).filter((t) => t && !CALL_ROLES.includes(t))
    const status = called ? 'called' : callStatus({ role: tokens.join('/'), board_rank: rank.get(`${pk}|${pid}`), board_of: of })
    const o = outcomes.get(`${pk}|${pid}`)
    const features = numericFeatures([['components', r.components]])    // inputs only: the bot's model scores are its answers, not inputs
    return {
      sport: 'mlb', market: lane, unit: g.date || date, date: g.date || date, id: pid, name: r.player, team: r.team, opp: r.opp,
      version: r.model_versions?.picks || null, status, produced: o && played(o) ? Boolean(test(lineOf(o))) : null,
      score: sc, features, lockedAt: Date.parse(r.generated_at), startAt: g.start,
      lockedBeforeFirstPitch: lockedBeforeFirstPitch(r, g.start),
    }
  })
}
