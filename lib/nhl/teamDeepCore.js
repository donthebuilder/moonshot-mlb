// 🏒 THE TEAM PAGE'S LEAGUE NUMBERS, PURE (2026-10-10). No fetch, no clock. lib/nhl/teamDeep.js reads; this shapes.
//
//   summary   api.nhle.com/stats team/summary (one row a club: per-game goals, shots, faceoffs, PP%, PK%, points %)
//   specials  lib/nhl/spots.js readSpecialTeams rows (PP opportunities a game, times shorthanded a game)
//   xg        lamp_team_game_xg rows (one per club per game: lib/nhl/teamXg.js), summed per club
//
// Each stat is a row { key, group, label, unit, higherBetter, dp, lg, byClub: { [abbrev]: value } } over EVERY club, so
// a club's rank and percentile are against the league on that stat (lib/team/contract.js leagueRank). A stat a source
// did not give for a club is null for it and the rank leaves that club out; nothing is filled in.
import { clubLines } from '../team/statLines'
import { NHL_TEAMS } from './teams'

const ABBREV_BY_ID = new Map(NHL_TEAMS.map(([abbrev, id]) => [Number(id), abbrev]))
const n = (v) => (v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)

/** team/summary rows -> { [abbrev]: line } (per-game numbers as the league publishes them). */
export function summaryByClub(raw) {
  const out = {}
  for (const r of raw?.data || []) {
    const a = ABBREV_BY_ID.get(Number(r.teamId))
    if (!a) continue
    out[a] = {
      gp: n(r.gamesPlayed), gfPg: n(r.goalsForPerGame), gaPg: n(r.goalsAgainstPerGame), sfPg: n(r.shotsForPerGame), saPg: n(r.shotsAgainstPerGame),
      foPct: n(r.faceoffWinPct), ppPct: n(r.powerPlayPct), pkPct: n(r.penaltyKillPct), pPct: n(r.pointPct), pts: n(r.points),
      w: n(r.wins), l: n(r.losses), otl: n(r.otLosses),
    }
  }
  return out
}

/** lamp_team_game_xg rows -> { [abbrev]: { gp, gf, ga, sog, xg, sogA, xgA, goalies: { id: [shots faced, goals allowed, xG faced] } } }. */
export function xgByClub(rows) {
  const out = {}
  for (const r of rows || []) {
    const t = out[r.team] || (out[r.team] = { gp: 0, gf: 0, ga: 0, sog: 0, xg: 0, sogA: 0, xgA: 0, goalies: {} })
    t.gp += 1; t.gf += n(r.gf) || 0; t.ga += n(r.ga) || 0
    t.sog += n(r.sog) || 0; t.xg += n(r.xg) || 0; t.sogA += n(r.sog_a) || 0; t.xgA += n(r.xg_a) || 0
    for (const [id, a] of Object.entries(r.goalies || {})) {
      const g = t.goalies[id] || (t.goalies[id] = [0, 0, 0])
      g[0] += n(a?.[0]) || 0; g[1] += n(a?.[1]) || 0; g[2] += n(a?.[2]) || 0
    }
  }
  return out
}

const per = (num, den) => (den > 0 ? num / den : null)

/**
 * Every stat row, every club. `xg` may be {} (the table missing or empty): those rows then have no club values and are
 * left out of the returned list, which is how the page knows to say "needs the xG table".
 */
export function statRows({ summary = {}, specials = {}, xg = {} }) {
  const clubs = NHL_TEAMS.map((t) => t[0])
  const from = (fn) => Object.fromEntries(clubs.map((c) => [c, fn(c)]))
  const S = (c) => summary[c] || {}
  const P = (c) => specials[c] || {}
  const X = (c) => xg[c]
  const rows = [
    { key: 'gfPg', group: 'Offense', label: 'Goals for / game', dp: 2, higherBetter: true, byClub: from((c) => S(c).gfPg ?? null) },
    { key: 'sfPg', group: 'Offense', label: 'Shots for / game', dp: 1, higherBetter: true, byClub: from((c) => S(c).sfPg ?? null) },
    { key: 'xgPg', group: 'Offense', label: 'xG for / game', dp: 2, higherBetter: true, src: 'xg', byClub: from((c) => (X(c) ? per(X(c).xg, X(c).gp) : null)) },
    { key: 'ppPct', group: 'Offense', label: 'Power play %', dp: 1, pct: true, higherBetter: true, byClub: from((c) => S(c).ppPct ?? null) },
    { key: 'ppGpg', group: 'Offense', label: 'PP goals / game', dp: 2, higherBetter: true, byClub: from((c) => P(c).ppGpg ?? null) },
    { key: 'ppOpp', group: 'Offense', label: 'PP chances / game', dp: 2, higherBetter: true, byClub: from((c) => P(c).ppOppPg ?? null) },
    { key: 'foPct', group: 'Offense', label: 'Faceoff win %', dp: 1, pct: true, higherBetter: true, byClub: from((c) => S(c).foPct ?? null) },
    { key: 'gaPg', group: 'Defense', label: 'Goals against / game', dp: 2, higherBetter: false, byClub: from((c) => S(c).gaPg ?? null) },
    { key: 'saPg', group: 'Defense', label: 'Shots against / game', dp: 1, higherBetter: false, byClub: from((c) => S(c).saPg ?? null) },
    { key: 'xgaPg', group: 'Defense', label: 'xG against / game', dp: 2, higherBetter: false, src: 'xg', byClub: from((c) => (X(c) ? per(X(c).xgA, X(c).gp) : null)) },
    { key: 'pkPct', group: 'Defense', label: 'Penalty kill %', dp: 1, pct: true, higherBetter: true, byClub: from((c) => S(c).pkPct ?? null) },
    { key: 'shPg', group: 'Defense', label: 'Times shorthanded / game', dp: 2, higherBetter: false, byClub: from((c) => P(c).shPg ?? null) },
    { key: 'pPct', group: 'Overall', label: 'Points %', dp: 1, pct: true, higherBetter: true, byClub: from((c) => S(c).pPct ?? null) },
    { key: 'diffPg', group: 'Overall', label: 'Goal difference / game', dp: 2, higherBetter: true, signed: true, byClub: from((c) => (S(c).gfPg != null && S(c).gaPg != null ? S(c).gfPg - S(c).gaPg : null)) },
  ]
  return rows.filter((r) => Object.values(r.byClub).some((v) => v != null))
}

export { clubLines }

/**
 * A goalie's expected-goals line from the club-game rows: shots faced, goals allowed, xG faced, and goals saved above
 * expected (xG faced minus goals allowed). Positive = fewer goals than the shots' quality gave.
 */
export function goalieGsax(xgClub, goalieId) {
  const a = xgClub?.goalies?.[String(goalieId)]
  if (!a || !(a[0] > 0)) return null
  return { sa: a[0], ga: a[1], xga: a[2], gsax: a[2] - a[1] }
}
