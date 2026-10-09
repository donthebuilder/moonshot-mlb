// 🏒 LAMP's TEAM MODEL, lamp-team-v1 (2026-10-08, Donovan: every game projection's expected number comes
// from a TEAM model, for all sports). What one club is projected to score in one game, and the game's
// total = home + away. Pure: no fetch, no clock.
//
//   the model     expected shot volume x shot quality x the opposing club's defence x the opposing goalie,
//                 each shrunk toward the league's mean, plus the empty-net goals a club scores a game
//                 (lib/nhl/xgGame.js projectClub, on the club-game rows of lib/nhl/teamXg.js)
//   the fallback  until lamp_team_game_xg has history, a plain rate: the club's goals a game plus the
//                 opposing club's goals allowed, each shrunk toward the league mean (standings GF / GA)
//   the numbers   lib/nhl/teamProjV1.js: the shrink strengths tuned on 2025-12-01..2026-02-01, the league
//                 means, the held-out results, and the league's spread of game totals (the dial's heat)
//
// A projected COUNT of goals, measured from shots; never a printed probability.
import MODEL from './teamProjV1'
import { projectClub } from './xgGame'
import { goalieFactor } from './xg'

export const TEAM_PROJ_VERSION = MODEL.version

const byDate = (a, b) => (a.game_date < b.game_date ? -1 : a.game_date > b.game_date ? 1 : a.game_id - b.game_id)
const sum = (a, f) => a.reduce((s, x) => s + f(x), 0)
const shrink = (s, n, mean, k) => (s + k * mean) / (n + k)

/** a club's regular-season rows dated BEFORE `date`, oldest first, the newest `windowGames` of them */
export function windowOf(rows, date, model = MODEL) {
  return (rows || []).filter((r) => r.game_type === 2 && r.game_date < date).sort(byDate).slice(-model.windowGames)
}

/**
 * The opposing goalie factor: the club's last `goalieGames` games' goalies, weighted by shots faced, each
 * goalie's (GA + k) / (xGA + k) read from the games in the club's own window (1 = a league-average goalie).
 */
export function clubGoalieFactor(win, model = MODEL) {
  const tab = {}
  for (const r of win) for (const [id, v] of Object.entries(r.goalies || {})) { const a = tab[id] || (tab[id] = { ga: 0, xga: 0 }); a.ga += v[1]; a.xga += v[2] }
  const faced = {}
  for (const r of win.slice(-model.goalieGames)) for (const [id, v] of Object.entries(r.goalies || {})) faced[id] = (faced[id] || 0) + v[0]
  const tot = Object.values(faced).reduce((a, b) => a + b, 0)
  if (!tot) return 1
  let f = 0
  for (const [id, sa] of Object.entries(faced)) f += (sa / tot) * (tab[id] ? goalieFactor(tab[id].ga, tab[id].xga, model.k.goalie) : 1)
  return f
}

/** One club's projected goals against one opponent, from both clubs' windows (club-game rows, oldest first). */
export function projectTeam(ownWin, oppWin, model = MODEL) {
  const own = { n: ownWin.length, sog: sum(ownWin, (x) => x.sog), xg: sum(ownWin, (x) => x.xg) }
  const against = { n: oppWin.length, sog: sum(oppWin, (x) => x.sog_a), xg: sum(oppWin, (x) => x.xg_a) }
  const gf = clubGoalieFactor(oppWin, model)
  const p = projectClub({
    own, against, league: { sog: model.league.sog, xgPerSog: model.league.xgPerSog },
    k: { sog: model.k.sog, q: model.k.q }, goalieFactor: gf, emptyNet: model.league.emptyNet,
  })
  return { goals: p.goals, shots: p.shots, xgPerShot: p.xgPerShot, goalieFactor: gf, n: own.n, nOpp: against.n }
}

/** The plain-rate fallback: a club's goals a game plus the opposing club's goals allowed, each shrunk to the league mean. */
export function rateOppProject(own, opp, model = MODEL) {
  const L = model.league.gf; const k = model.k.rate
  const rate = shrink(own.gf, own.n, L, k); const gaOpp = shrink(opp.ga, opp.n, L, k)
  return L + (rate - L) + (gaOpp - L)
}

/**
 * A game: { home, away, total, source, version }. `rows` is { [abbrev]: club-game rows } (any dates);
 * `date` is the GAME's own date, so a finished game never reads itself. null for a club with no rows at
 * all is fine: it is the league mean (a new club). `source: 'xg'`.
 */
export function projectGame({ home, away }, rows, date, model = MODEL) {
  const wh = windowOf(rows[home], date, model); const wa = windowOf(rows[away], date, model)
  const h = projectTeam(wh, wa, model); const a = projectTeam(wa, wh, model)
  return { home: { team: home, ...h }, away: { team: away, ...a }, total: h.goals + a.goals, source: 'xg', version: model.version }
}

/** Fallback from the standings rows { gp, gf, ga }; null when either club has no row. */
export function projectGameFromStandings({ home, away }, table, model = MODEL) {
  const H = table[home]; const A = table[away]
  if (!H || !A) return null
  const side = (me, op, team) => ({ team, goals: rateOppProject({ gf: me.gf, n: me.gp }, { ga: op.ga, n: op.gp }, model), n: me.gp, nOpp: op.gp })
  const h = side(H, A, home); const a = side(A, H, away)
  return { home: h, away: a, total: h.goals + a.goals, source: 'rate', version: `${model.version}-rate` }
}
