// 🏒 LAMP GOAL COMPOSITE -- lamp-goal-comp-v1. HIDDEN SHADOW (2026-10-18). Donovan: "the angle pick IS the top pick: the best ALL-AROUND person to
// score a goal ... MLB's model harness should be the base for all the other sports ... the odds will come naturally when this does not pick the
// same 3 people every night". So: NOT five angle picks, NOT value-first. ONE composite score per skater per game, matchup built in the way the
// MLB HR score builds it (a weighted blend of normalised components: the batter's own power, the pitcher's damage allowed, recent form, role,
// park/situation), not a separate matchup pick.
//
// SCORE (0-100, a rank-based score in the live board's style: the weighted mean of percentile ranks among tonight's scored skaters):
//   OWN        0.35  mean of his percentile on shots/GP, goals/GP, TOI/GP (the live board's three legs, this season only under v4)
//   MATCHUP    0.30  percentile of HIS goal rate as tonight's opponent changes it: base x shots-allowed factor x net factor, where
//                    base = (goals/GP + shots/GP x the position's league goals-per-shot) / 2   (volume and finishing, finishing pulled to the league)
//                    shots-allowed factor = opp shots against per 60 / tonight's mean, clamped 0.7-1.4
//                    net factor = opp goals-let-in per shot / tonight's mean, clamped 0.6-1.6; the CONFIRMED starter's own line when he has
//                    MIN_GOALIE_SA shots against, else the club's goalies together (the MLB pitcher_damage term)
//   FORM       0.10  percentile of (mean of last-5 and last-10 goals per game) minus his season goals/GP; signed, a cold man falls. Needs 4+ games
//   ROLE_PP    0.15  percentile of (his power-play goals per game) x (opp times shorthanded per game / mean) x ((1 - opp PK%) / (1 - mean PK%));
//                    PP goals stand in for PP role (the feeds carry no PP ice time)
//   SITUATION  0.10  percentile of home (+0.5) and his club's back-to-back (-1)
// A group with no data for him is NEUTRAL (50); nothing is invented. Weights sum to 1.00 and are plain, not fitted: the harness decides later.
// Per game the top composite on EACH TEAM is the 'composite pick' (status 'called' in this hidden log; the live one-per-team rule), every other
// scored skater is 'board', and EVERY scored skater's score is logged so the harness can grade top-N, best-in-game and the live score on the
// SAME games. No probability is computed or printed anywhere here; the score is a rank.
// NOT AVAILABLE with the feeds the tick reads (said, not guessed): shot quality / xG per skater, PP ice time, the opponent's rest, line mates.
// Pure: no fetch, no clock, no 'use client'.
import { percentiles } from './goalModel'
import { gradeCountRows, propRow } from './ptsModel'
import { CURRENT, versionsFor } from './versions'

export const MARKET = 'GOAL'                       // lamp_prop_log's market check already allows it (goalpos / goalw / goal2 write it): no SQL
export const MODEL_VERSION = CURRENT.comp
export const BAR = 1
export const LEGS = ['shotsPg', 'goalsPg', 'toi']
export const WEIGHTS = { own: 0.35, matchup: 0.30, form: 0.10, role: 0.15, situation: 0.10 }
export const MIN_GOALIE_SA = 100
export const FORM_MIN_GP5 = 4
export const CLAMP = { vol: [0.7, 1.4], qual: [0.6, 1.6], pp: [0.4, 2.5] }
const NEUTRAL = 50

const fin = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const clamp = (v, [lo, hi]) => Math.min(hi, Math.max(lo, v))
const mean = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null)
const r3 = (v) => (v == null ? null : Math.round(v * 1000) / 1000)
const isD = (pos) => String(pos || '').toUpperCase().startsWith('D')

/** A goalie's save rate from a club-stats goalie line, or null under MIN_GOALIE_SA shots against. */
export function goalieSv(g) {
  const sa = fin(g?.sa), sv = fin(g?.sv)
  return sa != null && sa >= MIN_GOALIE_SA && sv != null ? sv / sa : null
}
/** The save rate tonight's net is read at: { sv, basis } -- the confirmed starter's, else the club's goalies together, else null. */
export function netSave(goalies, starterId) {
  const list = Array.isArray(goalies) ? goalies : []
  const s = starterId == null ? null : list.find((g) => Number(g.id) === Number(starterId))
  const own = goalieSv(s)
  if (own != null) return { sv: own, basis: 'starter' }
  const sa = list.reduce((t, g) => t + (fin(g.sa) || 0), 0), sv = list.reduce((t, g) => t + (fin(g.sv) || 0), 0)
  return sa >= MIN_GOALIE_SA ? { sv: sv / sa, basis: 'club' } : { sv: null, basis: null }
}

/** Percentile ranks of `raw` (Map id -> number) among `ids`; ids without a number get NEUTRAL. */
function rankGroup(ids, raw) {
  const have = ids.filter((id) => raw.has(id))
  const p = percentiles(have.map((id) => raw.get(id)))
  const out = new Map(ids.map((id) => [id, NEUTRAL]))
  have.forEach((id, i) => out.set(id, p[i]))
  return out
}

/**
 * Score one night. candidates: [{ gameId, playerId, name, pos, team, opp, home, legs: pooledLegs() result, context: { b2b },
 *   ang: { oppSa60, oppSv, oppSvBasis, oppShPg, oppPkPct, form: {l5,gp5,l10,gp10}|null, ppGoals } }]
 * @returns {{ refs, rows, byGame: Map(gameId -> rows), picks: Map(gameId -> [one per team]) }} -- rows: score, pct (groups), rank, status 'called'|'board'.
 */
export function scoreCompositeNight(candidates) {
  const live = (candidates || []).filter((c) => c.legs?.ok)
  const once = (keyOf, valOf) => { const m = new Map(); for (const c of live) { const v = fin(valOf(c)); if (v != null && !m.has(keyOf(c))) m.set(keyOf(c), v) } return mean([...m.values()]) }
  const refs = {
    sa60: once((c) => c.opp, (c) => c.ang?.oppSa60), sv: once((c) => `${c.gameId}|${c.opp}`, (c) => c.ang?.oppSv),
    shPg: once((c) => c.opp, (c) => c.ang?.oppShPg), pk: once((c) => c.opp, (c) => c.ang?.oppPkPct),
  }
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
  const byId = new Map(live.map((c) => [idOf(c), c]))
  const raw = { shots: new Map(), goals: new Map(), toi: new Map(), matchup: new Map(), form: new Map(), role: new Map(), situation: new Map() }
  const note = new Map()
  for (const c of live) {
    const id = idOf(c), L = c.legs, a = c.ang || {}
    const shots = fin(L.shotsPg), goals = fin(L.goalsPg), gps = refs.gps[isD(c.pos) ? 'D' : 'F']
    if (shots != null) raw.shots.set(id, shots)
    if (goals != null) raw.goals.set(id, goals)
    if (fin(L.toi) != null) raw.toi.set(id, L.toi)
    const mf = matchupF(c)
    const base = goals != null && shots != null && gps != null ? (goals + shots * gps) / 2 : goals
    if (base != null) raw.matchup.set(id, base * (mf ? mf.vol * mf.qual : 1))
    const f = a.form
    if (f && goals != null && (fin(f.gp5) || 0) >= FORM_MIN_GP5) {
      const r5 = f.l5 / f.gp5, r10 = (fin(f.gp10) || 0) >= 6 ? f.l10 / f.gp10 : r5
      raw.form.set(id, (r5 + r10) / 2 - goals)
    }
    const ppg = fin(a.ppGoals), gp = fin(L.gpCur) ?? fin(L.gpPooled), pf = ppF(c)
    if (ppg != null && gp > 0) raw.role.set(id, (ppg / gp) * (pf ?? 1))
    raw.situation.set(id, (c.home ? 0.5 : 0) + (c.context?.b2b ? -1 : 0))
    note.set(id, { mf, pf, base })
  }
  const g = {
    own: (() => { const s = rankGroup(ids, raw.shots), gl = rankGroup(ids, raw.goals), t = rankGroup(ids, raw.toi); return new Map(ids.map((id) => [id, (s.get(id) + gl.get(id) + t.get(id)) / 3])) })(),
    matchup: rankGroup(ids, raw.matchup), form: rankGroup(ids, raw.form), role: rankGroup(ids, raw.role), situation: rankGroup(ids, raw.situation),
  }
  const scoreOf = (id) => Object.keys(WEIGHTS).reduce((t, k) => t + WEIGHTS[k] * g[k].get(id), 0)

  const rows = live.map((c) => {
    const id = idOf(c), x = note.get(id), score = Math.round(scoreOf(id))
    const pct = { score, own: Math.round(g.own.get(id)), matchup: Math.round(g.matchup.get(id)), form: Math.round(g.form.get(id)), role: Math.round(g.role.get(id)), situation: Math.round(g.situation.get(id)) }
    const L = c.legs
    return {
      gameId: c.gameId, playerId: c.playerId, name: c.name, pos: c.pos, team: c.team, opp: c.opp, home: c.home, legs: L, pct, score, rank: null, status: 'board', reason: null,
      context: {
        model: MODEL_VERSION, groups: pct, weights: WEIGHTS, matchupRate: r3(raw.matchup.get(id) ?? null), oppSa60: r3(fin(c.ang?.oppSa60)), oppSv: r3(fin(c.ang?.oppSv)), netBasis: c.ang?.oppSvBasis ?? null,
        oppShPg: r3(fin(c.ang?.oppShPg)), oppPkPct: r3(fin(c.ang?.oppPkPct)), formDelta: r3(raw.form.get(id) ?? null), ppGoals: fin(c.ang?.ppGoals), b2b: Boolean(c.context?.b2b),
        mf: x.mf ? { vol: r3(x.mf.vol), qual: r3(x.mf.qual) } : null, pf: r3(x.pf),
      },
      _tie: raw.matchup.get(id) || 0, _sh: fin(L.shotsPg) || 0,
    }
  })
  const cmp = (a, b) => (b.score - a.score) || (b._tie - a._tie) || (b._sh - a._sh) || String(a.name).localeCompare(String(b.name))
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

export const gradeCompositeRows = (rows, pbgs) => gradeCountRows(rows, pbgs, 'goals', BAR)
/** A scored skater -> the lamp_prop_log column shape (market GOAL, its own model_version: the primary key carries the version). */
export const toCompositeRow = (r, g, day, lockedAtIso) => propRow(r, g, day, lockedAtIso, { market: MARKET, version: versionsFor(day.date).comp, bar: BAR, legs: LEGS })
