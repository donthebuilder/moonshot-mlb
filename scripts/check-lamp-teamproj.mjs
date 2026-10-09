#!/usr/bin/env node
// lamp-team-v1 checks (2026-10-08): the club-game line and the team projection. Offline. Every shot, game
// and club below is TEST data made up for the check, never a real shot or a real club's record.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-lamp-teamproj.mjs
import { teamGameRows } from '../lib/nhl/teamXg.js'
import { windowOf, projectTeam, projectGame, projectGameFromStandings, rateOppProject, clubGoalieFactor, TEAM_PROJ_VERSION } from '../lib/nhl/teamProj.js'
import MODEL from '../lib/nhl/teamProjV1.js'
import { xgShot } from '../lib/nhl/xg.js'

let failed = 0
const check = (ok, msg) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${msg}`); if (!ok) failed++ }
const near = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol
// TEST shots: club AAA (home) and BBB. A slot shot is worth more than a point shot.
const S = (o) => ({ game_id: 1, game_date: '2099-01-01', season: 20992100, game_type: 2, result: 'sog', zone: 'O', strength: 'ev', shot_type: 'wrist', situation_code: '1551', period_type: 'REG', goalie_id: 11, x: 80, y: 3, ...o })

// ── the club-game line ──
const shots = [
  S({ team: 'AAA', goalie_id: 22 }), S({ team: 'AAA', result: 'goal', goalie_id: 22 }), S({ team: 'AAA', x: 40, y: 10, goalie_id: 22 }),
  S({ team: 'AAA', result: 'goal', goalie_id: null }),            // an empty-net goal: counts as a goal, not a shot at a goalie
  S({ team: 'AAA', result: 'miss', goalie_id: 22 }),               // a miss adds nothing
  S({ team: 'BBB', goalie_id: 11 }), S({ team: 'BBB', result: 'goal', goalie_id: 11 }),
]
const rows = teamGameRows(shots)
const A = rows.find((r) => r.team === 'AAA'); const B = rows.find((r) => r.team === 'BBB')
check(rows.length === 2 && A.opp === 'BBB' && B.opp === 'AAA', 'two rows per game, each naming its opponent')
check(A.gf === 2 && A.ga === 1 && B.gf === 1 && B.ga === 2, 'goals for and against, the empty-net goal counted')
check(A.sog === 3 && A.en === 1 && B.sog === 2, 'shots at a goalie exclude the empty net and the miss; the empty-net goal is kept apart')
check(near(A.xg, 2 * xgShot(S({})) + xgShot(S({ x: 40, y: 10 }))), 'xG sums over the shots at a goalie, lamp-xg-v1')
check(A.sog_a === B.sog && near(A.xg_a, B.xg) && B.sog_a === A.sog, 'what a club allowed is what the other took')
check(B.goalies['22'] && B.goalies['22'][0] === 3 && B.goalies['22'][1] === 1, "BBB's goalie 22 faced AAA's 3 shots and let in 1")
check(A.goalies['11'] && A.goalies['11'][0] === 2 && A.goalies['11'][1] === 1, "AAA's goalie 11 faced BBB's 2 shots and let in 1")
check(teamGameRows([S({ team: 'AAA' })]).length === 0, 'a game with shots from one club only makes no rows')

// ── the window ──
const R = (d, o = {}) => ({ game_id: Number(d.replace(/-/g, '')), game_date: d, game_type: 2, gf: 3, ga: 3, sog: 28, xg: 2.9, sog_a: 28, xg_a: 2.9, goalies: {}, ...o })
const many = Array.from({ length: 100 }, (_, i) => R(`2098-${String(1 + Math.floor(i / 28)).padStart(2, '0')}-${String(1 + (i % 28)).padStart(2, '0')}`))
const w = windowOf([...many, R('2098-12-01', { game_type: 1 })], '2099-01-01')
check(w.length === MODEL.windowGames && w[w.length - 1].game_date > w[0].game_date, `the newest ${MODEL.windowGames} regular-season games, oldest first (preseason left out)`)
check(windowOf(many, '2098-01-02').length === 1, "only games dated BEFORE the game's own date (a finished game never reads itself)")

// ── the projection ──
const L = MODEL.league
const empty = projectTeam([], [])
check(near(empty.goals, L.sog * L.xgPerSog + L.emptyNet, 1e-6) && empty.goalieFactor === 1, 'a club with no history is the league mean')
const shooter = Array.from({ length: 40 }, (_, i) => R(`2098-02-${String(1 + (i % 28)).padStart(2, '0')}`, { game_id: 5000 + i, sog: 38, xg: 38 * L.xgPerSog }))
const normal = Array.from({ length: 40 }, (_, i) => R(`2098-02-${String(1 + (i % 28)).padStart(2, '0')}`, { game_id: 6000 + i, sog: L.sog, xg: L.sog * L.xgPerSog, sog_a: L.sog, xg_a: L.sog * L.xgPerSog }))
check(projectTeam(shooter, normal).goals > projectTeam(normal, normal).goals, 'a club that shoots more is projected to score more')
const leaky = normal.map((r) => ({ ...r, sog_a: 36, xg_a: 36 * L.xgPerSog }))
check(projectTeam(normal, leaky).goals > projectTeam(normal, normal).goals, 'a defence that gives up more shots raises the projection')
const goalieRow = (ga, xga, id = '7') => normal.map((r, i) => ({ ...r, goalies: { [id]: [30, ga, xga] }, game_id: 7000 + i }))
check(clubGoalieFactor(goalieRow(2, 3)) < 1 && clubGoalieFactor(goalieRow(4, 3)) > 1 && clubGoalieFactor(normal) === 1, 'a goalie who stops more than the shots are worth lowers the projection; one who stops fewer raises it; no goalie data is neutral')
check(projectTeam(normal, goalieRow(2, 3)).goals < projectTeam(normal, goalieRow(4, 3)).goals, 'the opposing goalie moves the number the right way')
const rowsBy = { HHH: shooter, AAA: normal }
const pg = projectGame({ home: 'HHH', away: 'AAA' }, rowsBy, '2099-01-01')
check(near(pg.total, pg.home.goals + pg.away.goals) && pg.source === 'xg' && pg.version === TEAM_PROJ_VERSION, 'the game total is home + away, with its source and version')
check(pg.home.goals > pg.away.goals, 'the higher-volume home club projects more')
check([pg.home.goals, pg.away.goals].every((v) => v > 2 && v < 5), 'a club projection is a believable count of goals')

// ── the fallback: a plain rate from standings ──
const tab = { HHH: { gp: 80, gf: 300, ga: 240 }, AAA: { gp: 80, gf: 230, ga: 280 } }
const fb = projectGameFromStandings({ home: 'HHH', away: 'AAA' }, tab)
check(fb.source === 'rate' && near(fb.total, fb.home.goals + fb.away.goals) && fb.home.goals > fb.away.goals, 'the rate fallback: scores more and faces the weaker defence -> projects more')
check(projectGameFromStandings({ home: 'HHH', away: 'ZZZ' }, tab) === null, 'a club with no standings row: no number, never a guess')
check(near(rateOppProject({ gf: 0, n: 0 }, { ga: 0, n: 0 }), L.gf), 'the rate fallback with no games is the league mean')

// ── what the shipped model said on games it never saw ──
const ev = MODEL.eval.heldOut
for (const [k, v] of Object.entries(ev)) check(v.team.nll <= v.rate.nll + 1e-9 || v.games < 100, `held out ${k}: team NLL ${v.team.nll.toFixed(4)} vs the club's own goals a game ${v.rate.nll.toFixed(4)} (${v.games} games)`)
check(MODEL.eval.siteVsEval.maxAbsDiffTeam < 1e-9, 'the code the site runs equals the model that was evaluated (max difference < 1e-9)')
check(MODEL.dist.xg.p10 < MODEL.dist.xg.p25 && MODEL.dist.xg.p25 < MODEL.dist.xg.p50 && MODEL.dist.xg.p50 < MODEL.dist.xg.p75 && MODEL.dist.xg.p75 < MODEL.dist.xg.p90, "the league's spread of game totals is ordered")

console.log(failed ? `\n${failed} FAILED` : '\nall passed')
process.exit(failed ? 1 : 0)
