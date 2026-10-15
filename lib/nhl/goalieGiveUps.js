// 🥅 WHO SCORES ON A GOALIE, AND FROM WHICH SIDE (2026-10-13, Donovan: "the goalie gives it up to C / W / D, and even
// specific sides"). PURE and browser-safe: no fetch, no clock. The numbers are the one SQL answer in
// supabase/migrations/202610131200_lamp_goalie_giveups.sql (read by lib/nhl/goalieZones.js readGoalieGiveUps), cut here
// into shares of the goals each goalie has allowed -- by the scorer's position (C / W / D) and by the side of the ice
// the shot came from (left / middle / right) -- with the league's share of the same goals beside every one.
//
// WHAT THE DATA CAN SAY. The scorer's position (lamp_goal_log.pos, his latest logged one; a skater with none is
// counted as "unknown" and left out of the shares, with the coverage printed) and the shot's place on the ice
// (x, y -> side). It does NOT carry which way the shooter shoots (left- or right-handed): no table stores it, so
// there is no handedness cut and never a guess at one. Side is the side of the ice, the shooter's own left and right.
//
// THE RULES (each one printed where it matters):
//   · LISTED   a goalie is listed at GIVEUP_FLOOR.shots shots on goal against this season.
//   · A SHARE  is printed at GIVEUP_FLOOR.goals goals against. Under it the row says how many he has and prints a dash:
//              "not enough yet". A share of 8 goals is a coin's wobble, not a tendency.
//   · A LEAN   one position (and one side) can be named: the one furthest above the league's share of goals, only when it
//              is at least GIVEUP_FLOOR.pts points above AND at least GIVEUP_FLOOR.z standard errors of that many goals.
//              Otherwise "none": a goalie whose split looks like the league's has no lean.
//   · THE SEASON  one season per table, always named. This season's table is used once GIVEUP_FLOOR.rows goalies clear
//              the goals floor; until then the last full season's, labelled, never two seasons added into one number.
//   · INFORMATION  where goals have gone in. It says nothing about what a shooter will do tonight.

export const GIVEUP_FLOOR = Object.freeze({ shots: 100, goals: 20, pts: 5, z: 2, rows: 5 })
export const POS_KEYS = Object.freeze(['C', 'W', 'D'])
export const SIDE_KEYS = Object.freeze(['left', 'mid', 'right'])
export const POS_WORD = Object.freeze({ C: 'Centers', W: 'Wings', D: 'Defensemen' })
export const SIDE_WORD = Object.freeze({ left: 'Left side', mid: 'Middle', right: 'Right side' })
export const SIDE_SHORT = Object.freeze({ left: 'Left', mid: 'Mid', right: 'Right' })

const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? 0 : Number(v))
const cutOf = (cuts, kind, key) => ({ sa: num(cuts?.[`${kind}:${key}`]?.sa), ga: num(cuts?.[`${kind}:${key}`]?.ga) })

/** One cut (pos or side) of a `cuts` block -> { total, byKey: { key: { ga, sa, share } } }. Shares are of the goals with a known key. */
function splitOf(cuts, kind, keys) {
  const byKey = {}
  let total = 0
  for (const k of keys) { const c = cutOf(cuts, kind, k); byKey[k] = { ga: c.ga, sa: c.sa, share: null }; total += c.ga }
  for (const k of keys) byKey[k].share = total > 0 ? byKey[k].ga / total : null
  return { total, byKey }
}

/** The furthest-above-the-league key, or null. `obs` and `lg` are splitOf() results. */
export function leanOf(obs, lg, keys) {
  if (!(obs.total > 0)) return null
  let best = null
  for (const k of keys) {
    const p = lg.byKey[k]?.share
    const o = obs.byKey[k].share
    if (p == null || o == null || !(p > 0) || !(p < 1)) continue
    const pts = (o - p) * 100
    const z = (o - p) / Math.sqrt((p * (1 - p)) / obs.total)
    if (pts >= GIVEUP_FLOOR.pts && z >= GIVEUP_FLOOR.z && (!best || z > best.z)) best = { key: k, pts, z }
  }
  return best
}

/**
 * The table for one season.
 * @param answer  { available, season, league: { sa, ga, cuts }, goalies: [{ goalie, sa, ga, cuts }] } as readGoalieGiveUps returns it
 * @param who     (id) => { name, team } | null -- a goalie with no name on a current roster is left out (counted in `unnamed`), never named by guess
 * @returns { state: 'unavailable'|'ok', season, league: { ga, pos, side, posKnown }, rows, unnamed, enough }
 *   rows (most goals against first): { id, name, team, sa, ga, enough, pos: {C,W,D: { ga, share }}, side: {...}, leanPos, leanSide }
 *   `share` is null (not 0) whenever `enough` is false.
 */
export function giveUps(answer, who) {
  if (!answer?.available || !answer.league) return { state: 'unavailable', season: answer?.season ?? null, league: null, rows: [], unnamed: 0, enough: 0 }
  const lgPos = splitOf(answer.league.cuts, 'pos', POS_KEYS)
  const lgSide = splitOf(answer.league.cuts, 'side', SIDE_KEYS)
  const lgAll = num(answer.league.ga)
  const league = {
    ga: lgAll, sa: num(answer.league.sa), pos: lgPos.byKey, side: lgSide.byKey,
    posKnown: lgAll > 0 ? lgPos.total / lgAll : null,   // the share of the league's goals whose scorer has a position on file
  }
  const rows = []
  let unnamed = 0
  for (const g of answer.goalies || []) {
    const sa = num(g.sa)
    if (sa < GIVEUP_FLOOR.shots) continue
    const id = String(g.goalie)
    const w = who?.(id)
    if (!w?.name) { unnamed += 1; continue }
    const ga = num(g.ga)
    const enough = ga >= GIVEUP_FLOOR.goals
    const p = splitOf(g.cuts, 'pos', POS_KEYS)
    const s = splitOf(g.cuts, 'side', SIDE_KEYS)
    const cell = (sp, k) => ({ ga: sp.byKey[k].ga, share: enough ? sp.byKey[k].share : null })
    rows.push({
      id, name: w.name, team: w.team || '', photo: w.photo || null, sa, ga, enough,
      pos: Object.fromEntries(POS_KEYS.map((k) => [k, cell(p, k)])),
      side: Object.fromEntries(SIDE_KEYS.map((k) => [k, cell(s, k)])),
      leanPos: enough ? leanOf(p, lgPos, POS_KEYS) : null,
      leanSide: enough ? leanOf(s, lgSide, SIDE_KEYS) : null,
    })
  }
  rows.sort((a, b) => b.ga - a.ga || b.sa - a.sa || a.name.localeCompare(b.name))
  return { state: 'ok', season: answer.season ?? null, league, rows, unnamed, enough: rows.filter((r) => r.enough).length }
}

/**
 * This season's table once enough goalies clear the goals floor, else the last full season's -- named, never merged.
 * @returns the chosen giveUps() result plus { fallback: boolean, current: { season, enough } }
 */
export function chooseGiveUps(cur, prev) {
  const curOk = cur?.state === 'ok'
  if (curOk && cur.enough >= GIVEUP_FLOOR.rows) return { ...cur, fallback: false, current: { season: cur.season, enough: cur.enough } }
  if (prev?.state === 'ok' && prev.enough > (curOk ? cur.enough : -1)) return { ...prev, fallback: true, current: { season: cur?.season ?? null, enough: curOk ? cur.enough : 0 } }
  if (curOk) return { ...cur, fallback: false, current: { season: cur.season, enough: cur.enough } }
  return { state: 'unavailable', season: null, league: null, rows: [], unnamed: 0, enough: 0, fallback: false, current: null }
}

const pct0 = (x) => (x == null ? '—' : `${Math.round(x * 100)}%`)
/** "C 39% · W 47% · D 14%" for a league split. */
export const splitLine = (by, keys, word = (k) => k) => keys.map((k) => `${word(k)} ${pct0(by[k]?.share)}`).join(' · ')
export { pct0 }

/** A lean as a table cell: "W +9". Null when none. */
export const leanText = (lean, word = (k) => k) => (lean ? `${word(lean.key)} +${Math.round(lean.pts)}` : null)

/** Wording lint for any sentence built from this view: no outcome claim, no probability word. Returns the problems (empty = clean). */
export function lintGiveUps(text) {
  const t = String(text || '')
  const bad = []
  if (/\b(will|would|going to|guaranteed?|lock|sure thing|should score|bound to|expect(?:ed)? to score)\b/i.test(t)) bad.push('claims an outcome')
  if (/\bprobab|\bchance|\bodds\b|\blikel(?:y|ihood)\b/i.test(t)) bad.push('a probability word') // allow-probability: the lint's own list of the words it bans, never printed
  return bad
}
