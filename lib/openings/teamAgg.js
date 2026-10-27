// THE OPENINGS, COUNTED, TEAM LEVEL -- ONE FOR LAMP AND TUDDY (2026-10-26, Donovan: "just build an openings tab ... shared"). Pure: the
// stored opening rows (opening_games, sport 'nhl' or 'nfl': lib/nhl/openings.js, lib/nfl/openings.js) in, the research tables out.
// BUCKETS' and MOONSHOT's own aggregators (lib/nba/openingsAgg.js, lib/mlb/openingsAgg.js) also read player rows; hockey and football
// have none, so this one is the club half plus a list of who scores first. Nothing here is a chance: what happened, and how often.
//
//   teams    gp; AFTER THE JUMP (2026-10-27): `firstWhenJumpPct` / `afterJump` [n, of] scored first after winning the jump, `firstWhenLostPct` / `afterLost` after losing it, and the league's `league` rate;
//            JUMP % (the club that won the opening faceoff / got the ball first); SCORES FIRST % (the game's first goal / first
//            touchdown); scored first after winning the jump; shots to the first score (own count, that one counting); points for /
//            against in each window the sport stores (NHL first 5 and 10 minutes and the period, NFL the first quarter); what the club's
//            own first scores were and what its defense ALLOWED, by type (opening_games.first_score_type); the game log
//            [scored first 1|0|null, won the jump 1|0|null, the man who scored it when it was this club's] for the face wall
//   scorers  who scored the game's first goal / touchdown most, with his club and his share of that club's games
//
// `where`: 'all' | 'home' | 'away'. `last`: only each club's newest N games.
import { bump, shares } from './shares'

const r1 = (v) => (Number.isFinite(v) ? Math.round(v * 10) / 10 : null)
const pct = (a, b) => (b ? Math.round((1000 * a) / b) / 10 : null)
const newestFirst = (a, b) => String(b.game_date).localeCompare(String(a.game_date)) || String(b.game_id).localeCompare(String(a.game_id))
const WINDOWS = [['w1', 'win1'], ['w2', 'win2'], ['p1', 'p1']]   // the three windows opening_games stores; a sport that leaves one null shows none

export function aggregateTeamOpenings(games, { where = 'all', last = null } = {}) {
  const side = (team, g) => (team === g.home ? 'home' : team === g.away ? 'away' : null)
  const keep = (team, g) => where === 'all' || side(team, g) === where
  const byTeam = new Map()
  for (const g of games) for (const t of [g.home, g.away]) if (t && keep(t, g)) { if (!byTeam.has(t)) byTeam.set(t, []); byTeam.get(t).push(g) }

  const teams = []
  const scorerN = new Map()   // `${team}|${playerId}` -> count
  for (const [t, list0] of byTeam) {
    const list = [...list0].sort(newestFirst).slice(0, last || undefined)
    let jump = 0, jumpKnown = 0, first = 0, firstKnown = 0, firstWhenJump = 0, preSum = 0, preN = 0
    let wonN = 0, lostN = 0, firstWhenLost = 0   // games with the jump AND the first score on file: scored first after winning / after losing the jump
    const win = Object.fromEntries(WINDOWS.map(([k]) => [k, { f: 0, a: 0, n: 0 }]))
    const ownTypes = {}, allowTypes = {}
    let allowN = 0
    const log = []
    for (const g of list) {
      const home = t === g.home
      log.push([g.first_score_team ? (g.first_score_team === t ? 1 : 0) : null, g.jump_win_team ? (g.jump_win_team === t ? 1 : 0) : null,
        g.first_score_team === t && g.first_score_player ? String(g.first_score_player) : null])
      if (g.jump_win_team) { jumpKnown++; if (g.jump_win_team === t) jump++ }
      if (g.jump_win_team && g.first_score_team) { if (g.jump_win_team === t) wonN++; else { lostN++; if (g.first_score_team === t) firstWhenLost++ } }
      if (g.first_score_team) {
        firstKnown++
        if (g.first_score_team === t) {
          first++; if (g.jump_win_team === t) firstWhenJump++
          bump(ownTypes, g.first_score_type)
          if (g.first_score_player) { const k = `${t}|${g.first_score_player}`; scorerN.set(k, (scorerN.get(k) || 0) + 1) }
        } else { allowN++; bump(allowTypes, g.first_score_type) }
      }
      const pre = home ? g.pre_first_att_home : g.pre_first_att_away
      if (Number.isFinite(pre)) { preSum += pre; preN++ }
      for (const [k, col] of WINDOWS) {
        const f = home ? g[`${col}_home_pts`] : g[`${col}_away_pts`], a = home ? g[`${col}_away_pts`] : g[`${col}_home_pts`]
        if (Number.isFinite(f) && Number.isFinite(a)) { win[k].f += f; win[k].a += a; win[k].n++ }
      }
    }
    const n = list.length
    const row = {
      team: t, gp: n, jumpPct: pct(jump, jumpKnown), firstPct: pct(first, firstKnown), firstWhenJumpPct: pct(firstWhenJump, wonN), afterJump: [firstWhenJump, wonN], firstWhenLostPct: pct(firstWhenLost, lostN), afterLost: [firstWhenLost, lostN],
      shotsToFirst: preN ? r1(preSum / preN) : null, firstTypes: shares(ownTypes), allows: { n: allowN, types: shares(allowTypes) }, log,
    }
    for (const [k] of WINDOWS) { row[`${k}For`] = win[k].n ? r1(win[k].f / win[k].n) : null; row[`${k}Ag`] = win[k].n ? r1(win[k].a / win[k].n) : null }
    teams.push(row)
  }

  const gpOf = new Map(teams.map((x) => [x.team, x.gp]))
  const scorers = [...scorerN.entries()].map(([k, c]) => { const [team, playerId] = k.split('|'); return { playerId, team, n: c, pct: pct(c, gpOf.get(team)) } })
    .sort((a, b) => b.n - a.n || (b.pct ?? 0) - (a.pct ?? 0)).slice(0, 40)
  // the league's: how often the club that won the jump (the opening faceoff, the first possession) scored first
  let lgN = 0, lgW = 0
  for (const g of games) if (g.jump_win_team && g.first_score_team) { lgN++; if (g.jump_win_team === g.first_score_team) lgW++ }
  return { teams, scorers, games: games.length, league: { n: lgN, w: lgW, pct: pct(lgW, lgN) } }
}
