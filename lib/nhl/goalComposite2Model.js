// 🏒 LAMP GOAL COMPOSITE v2 -- lamp-goal-comp-v2. HIDDEN SHADOW (2026-10-18). v1 (lib/nhl/goalCompositeModel.js) is untouched and keeps writing its own
// rows; v2 is a NEW model_version with NEW rows, one version from its first night. Same one-score design (percentile ranks, no probability), with
// the four ingredients v1 said the feeds did not carry. Donovan: "these are available to better research".
//
// WEIGHTS (unchanged from v1 -- the new ingredients only replace what they improve INSIDE a group, nothing is re-fitted):
//   OWN        0.35  mean of his percentile on  XG/GP (replaces shots/GP where he has shots on file), goals/GP, TOI/GP
//   MATCHUP    0.30  percentile of his goal rate as tonight's opponent changes it (v1's shots-allowed and net factors), where the base rate is now
//                    base = (goals/GP + xG/GP) / 2   -- finishing counted at HALF weight: the goals he really scored, pulled halfway to what his shots
//                    were worth. No xG for him: v1's base, (goals/GP + shots/GP x league goals-per-shot) / 2.
//   FORM       0.10  as v1 (last-5 / last-10 goals per game minus his season rate)
//   ROLE_PP    0.15  mean of his percentile on PP TOI/GP and on PP SHARE (his PP minutes as a share of his club's PP minutes), each x the opponent's
//                    penalty factor (times shorthanded x PK%). REPLACES v1's PP-goals proxy. No PP ice time for him: neutral 50.
//   SITUATION  0.10  home (+0.5), his club on a back-to-back (-1), the OPPONENT on a back-to-back (+0.75). Opponent rest unknown: adds 0.
// A group with no data for him is NEUTRAL (50); missing data never lowers a score (a rank among the others, never below the middle for lack of a feed).
//
// SHOT QUALITY: xG per shot on goal is lamp-xg-v1 (lib/nhl/xg.js) summed over HIS shots in lamp_shots (this season, games before the date, empty
// net left off). It is shrunk toward the night's league xG per shot with XG_K shots of prior: q = (xG + K x league) / (shots + K), so a man with
// 3 shots on file is read nearly at the league average and a man with 100 at his own. xG/GP = q x his shots on goal per game (the board's own
// shots/GP leg), so an incomplete shot archive can lower neither the volume nor the rate. Nobody with shots/GP but no archive rows falls back to
// plain shots (q = league). Finishing (goals - xG on the archive's own shots) is logged in context, and enters only through the half-weight base.
// The score is a rank; no probability is computed or printed. xG is a measured rate on many shots, never shown as a per-shot figure.
// LINE MATES: left out. The feeds this site reads carry the dressed list (play-by-play rosterSpots) but no line, pair or shift combination.
// Pure: no fetch, no clock, no 'use client'.
import { percentiles } from './goalModel'
import { gradeCountRows, propRow } from './ptsModel'
import { CURRENT, versionsFor } from './versions'
import { LEGS, CLAMP, FORM_MIN_GP5 } from './goalCompositeModel'

export const MARKET = 'GOAL'                       // lamp_prop_log's market check already allows it: no SQL
export const MODEL_VERSION = CURRENT.comp2
export const BAR = 1
export { LEGS }
export const WEIGHTS = { own: 0.35, matchup: 0.30, form: 0.10, role: 0.15, situation: 0.10 }
export const XG_K = 20                             // shots of league-average prior
export const FINISH_W = 0.5                        // goals vs xG: half and half in the matchup base
export const OPP_B2B = 0.75                        // a tired opponent, in the situation group's units (home = 0.5, own back-to-back = -1)
const NEUTRAL = 50

const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v))
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null)
const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000)
const isD = (pos) => String(pos || '').toUpperCase().startsWith('D')

/** Percentile ranks of `raw` (Map id -> number) among `ids`; ids without a number get NEUTRAL. */
function rankGroup(ids, raw) {
  const have = ids.filter((id) => raw.has(id))
  const p = percentiles(have.map((id) => raw.get(id)))
  const out = new Map(ids.map((id) => [id, NEUTRAL]))
  have.forEach((id, i) => out.set(id, p[i]))
  return out
}
/** Mean of two optional group ranks: whichever he has; none = NEUTRAL. */
const meanHave = (ids, a, b, rawA, rawB) => new Map(ids.map((id) => {
  const v = [rawA.has(id) ? a.get(id) : null, rawB.has(id) ? b.get(id) : null].filter((x) => x != null)
  return [id, v.length ? mean(v) : NEUTRAL]
}))

/** His shot quality: xG per shot on goal shrunk toward the league's. { q, n } -- q null when there is no league figure to shrink to. */
export function shrinkQuality(xg, n, lg, k = XG_K) {
  if (lg == null) return null
  const nn = fin(n) || 0, x = fin(xg) || 0
  return (x + k * lg) / (nn + k)
}

/**
 * Score one night. candidates: v1's shape, and ang adds { xgN, xg, xgG (his shots on goal on file, their xG, their goals) | null,
 *   ppToiPg (seconds), ppShare (0-1) | null, oppRest (days off, 0 = back-to-back) | null }.
 * @returns {{ refs, rows, byGame: Map(gameId -> rows), picks: Map(gameId -> [one per team]) }}
 */
export function scoreComposite2Night(candidates) {
  const live = (candidates || []).filter((c) => c.legs?.ok)
  const once = (keyOf, valOf) => { const m = new Map(); for (const c of live) { const v = fin(valOf(c)); if (v != null && !m.has(keyOf(c))) m.set(keyOf(c), v) } return mean([...m.values()]) }
  const refs = {
    sa60: once((c) => c.opp, (c) => c.ang?.oppSa60), sv: once((c) => `${c.gameId}|${c.opp}`, (c) => c.ang?.oppSv),
    shPg: once((c) => c.opp, (c) => c.ang?.oppShPg), pk: once((c) => c.opp, (c) => c.ang?.oppPkPct),
  }
  // the night's league xG per shot on goal, from the men who have shots on file
  let xs = 0, ns = 0
  for (const c of live) { const n = fin(c.ang?.xgN), x = fin(c.ang?.xg); if (n > 0 && x != null) { xs += x; ns += n } }
  refs.xgPerShot = ns > 0 ? xs / ns : null
  const acc = { F: { g: 0, s: 0 }, D: { g: 0, s: 0 } }
  for (const c of live) { const a = acc[isD(c.pos) ? 'D' : 'F']; const w = fin(c.legs.gpPooled) || 0; a.g += (fin(c.legs.goalsPg) || 0) * w; a.s += (fin(c.legs.shotsPg) || 0) * w }
  refs.gps = { F: acc.F.s > 0 ? acc.F.g / acc.F.s : null, D: acc.D.s > 0 ? acc.D.g / acc.D.s : null }

  const matchupF = (c) => {
    const a = c.ang || {}
    const vol = fin(a.oppSa60) != null && refs.sa60 > 0 ? clamp(a.oppSa60 / refs.sa60, CLAMP.vol) : null
    const qual = fin(a.oppSv) != null && refs.sv != null && refs.sv < 1 ? clamp((1 - a.oppSv) / (1 - refs.sv), CLAMP.qual) : null
    return vol == null && qual == null ? null : { vol: vol ?? 1, qual: qual ?? 1 }
  }
  const ppF = (c) => {
    const a = c.ang || {}
    const sh = fin(a.oppShPg) != null && refs.shPg > 0 ? a.oppShPg / refs.shPg : null
    const pk = fin(a.oppPkPct) != null && refs.pk != null && refs.pk < 1 ? (1 - a.oppPkPct) / (1 - refs.pk) : null
    return sh == null && pk == null ? null : clamp((sh ?? 1) * (pk ?? 1), CLAMP.pp)
  }

  const idOf = (c) => `${c.gameId}|${c.playerId}`
  const ids = live.map(idOf)
  const raw = { xg: new Map(), goals: new Map(), toi: new Map(), matchup: new Map(), form: new Map(), ppToi: new Map(), ppShare: new Map(), situation: new Map() }
  const note = new Map()
  for (const c of live) {
    const id = idOf(c), L = c.legs, a = c.ang || {}
    const shots = fin(L.shotsPg), goals = fin(L.goalsPg), gps = refs.gps[isD(c.pos) ? 'D' : 'F']
    const q = shrinkQuality(a.xg, a.xgN, refs.xgPerShot)
    const xgPg = q != null && shots != null ? q * shots : null
    if (xgPg != null) raw.xg.set(id, xgPg); else if (shots != null) raw.xg.set(id, shots)   // plain shots only when the whole night has no xG
    if (goals != null) raw.goals.set(id, goals)
    if (fin(L.toi) != null) raw.toi.set(id, L.toi)
    const mf = matchupF(c)
    const base = goals != null && xgPg != null ? goals * FINISH_W + xgPg * (1 - FINISH_W)
      : goals != null && shots != null && gps != null ? (goals + shots * gps) / 2 : goals
    if (base != null) raw.matchup.set(id, base * (mf ? mf.vol * mf.qual : 1))
    const f = a.form
    if (f && goals != null && (fin(f.gp5) || 0) >= FORM_MIN_GP5) {
      const r5 = f.l5 / f.gp5, r10 = (fin(f.gp10) || 0) >= 6 ? f.l10 / f.gp10 : r5
      raw.form.set(id, (r5 + r10) / 2 - goals)
    }
    const pf = ppF(c)
    if (fin(a.ppToiPg) != null) raw.ppToi.set(id, a.ppToiPg * (pf ?? 1))
    if (fin(a.ppShare) != null) raw.ppShare.set(id, a.ppShare * (pf ?? 1))
    raw.situation.set(id, (c.home ? 0.5 : 0) + (c.context?.b2b ? -1 : 0) + (fin(a.oppRest) === 0 ? OPP_B2B : 0))
    note.set(id, { mf, pf, base, xgPg, q })
  }
  const pToi = rankGroup(ids, raw.ppToi), pShare = rankGroup(ids, raw.ppShare)
  const g = {
    own: (() => { const s = rankGroup(ids, raw.xg), gl = rankGroup(ids, raw.goals), t = rankGroup(ids, raw.toi); return new Map(ids.map((id) => [id, (s.get(id) + gl.get(id) + t.get(id)) / 3])) })(),
    matchup: rankGroup(ids, raw.matchup), form: rankGroup(ids, raw.form), role: meanHave(ids, pToi, pShare, raw.ppToi, raw.ppShare), situation: rankGroup(ids, raw.situation),
  }
  const scoreOf = (id) => Object.keys(WEIGHTS).reduce((t, k) => t + WEIGHTS[k] * g[k].get(id), 0)

  const rows = live.map((c) => {
    const id = idOf(c), x = note.get(id), score = Math.round(scoreOf(id)), a = c.ang || {}
    const pct = { score, own: Math.round(g.own.get(id)), matchup: Math.round(g.matchup.get(id)), form: Math.round(g.form.get(id)), role: Math.round(g.role.get(id)), situation: Math.round(g.situation.get(id)) }
    const hasXg = fin(a.xgN) > 0
    return {
      gameId: c.gameId, playerId: c.playerId, name: c.name, pos: c.pos, team: c.team, opp: c.opp, home: c.home, legs: c.legs, pct, score, rank: null, status: 'board', reason: null,
      context: {
        model: MODEL_VERSION, groups: pct, weights: WEIGHTS, matchupRate: r3(raw.matchup.get(id) ?? null), oppSa60: r3(fin(a.oppSa60)), oppSv: r3(fin(a.oppSv)), netBasis: a.oppSvBasis ?? null,
        oppShPg: r3(fin(a.oppShPg)), oppPkPct: r3(fin(a.oppPkPct)), formDelta: r3(raw.form.get(id) ?? null), b2b: Boolean(c.context?.b2b),
        mf: x.mf ? { vol: r3(x.mf.vol), qual: r3(x.mf.qual) } : null, pf: r3(x.pf),
        // the v2 ingredients (every one null when its feed had nothing for him)
        xgShots: hasXg ? a.xgN : null, xgPerShot: r3(x.q), xgPg: r3(x.xgPg), finishing: hasXg && fin(a.xg) != null ? r3((fin(a.xgG) || 0) - a.xg) : null,
        ppToiPg: r3(fin(a.ppToiPg)), ppShare: r3(fin(a.ppShare)), oppRest: fin(a.oppRest),
      },
      _tie: raw.matchup.get(id) || 0, _sh: fin(c.legs.shotsPg) || 0,
    }
  })
  const cmp = (p, q) => (q.score - p.score) || (q._tie - p._tie) || (q._sh - p._sh) || String(p.name).localeCompare(String(q.name))
  const sorted = [...rows].sort(cmp)
  sorted.forEach((r, i) => { r.context.nightRank = i + 1; r.context.nightOf = sorted.length })
  const byGame = new Map(), picks = new Map()
  for (const r of sorted) { if (!byGame.has(r.gameId)) byGame.set(r.gameId, []); byGame.get(r.gameId).push(r) }
  for (const [gid, list] of byGame) {
    const seen = new Set(), chosen = []
    list.forEach((r, i) => {
      r.rank = i + 1
      if (!seen.has(r.team)) { seen.add(r.team); r.status = 'called'; r.context.pick = true; chosen.push(r) }   // ONE composite pick per team per game
    })
    picks.set(gid, chosen)
  }
  for (const r of rows) { delete r._tie; delete r._sh }
  return { refs, rows: sorted, byGame, picks }
}

export const gradeComposite2Rows = (rows, pbgs) => gradeCountRows(rows, pbgs, 'goals', BAR)
/** A scored skater -> the lamp_prop_log column shape (market GOAL, its own model_version: the primary key carries the version). */
export const toComposite2Row = (r, g, day, lockedAtIso) => propRow(r, g, day, lockedAtIso, { market: MARKET, version: versionsFor(day.date).comp2, bar: BAR, legs: LEGS })
