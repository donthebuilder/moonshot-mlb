// PREPLAY · MOONSHOT checks (2026-10-22). TEST DATA ONLY: two made-up nine-man lineups with league-like rates and a
// handful of made-up batted balls. Proves:
//   1. writing the play-by-play log changes nothing about the game (same box, same score, every seed tried)
//   2. the log adds up: the runs scored in each half = that half's runs; the halves' scores = the final; 3 outs a half
//      (except a home half that ends the game)
//   3. preplayMlb's win shares are simulate()'s own (the same 2,000 seeds), and the shown game ends on the most common
//      final with the favourite winning
//   4. placeBalls only ever gives a play a real ball of the same result; a homer gets one that clears this wall, a hit
//      one that stays in; a man with no ball of that kind gets none (counted missing), never a made-up one
//   node --import ./scripts/_esm-resolve.mjs scripts/check-preplay-mlb.mjs
import { simGame, simulate } from '../lib/gameSim.js'
import { preplayMlb, placeBalls, playWords, sprayPolar, beatsOf, PACE } from '../lib/preplay/mlb.js'

let fails = 0
const ok = (cond, msg) => { if (cond) console.log(`ok   ${msg}`); else { fails += 1; console.log(`FAIL ${msg}`) } }

// ── TEST lineups ────────────────────────────────────────────────────────────
const bat = (team, spot, over = {}) => ({
  player_id: (team === 'AAA' ? 1000 : 2000) + spot, name: `TEST ${team} ${spot}`, team, lineup_spot: spot, bats: spot % 2 ? 'R' : 'L', jersey_number: spot,
  season_pa: 600, season_ab: 540, season_hits: 140, season_avg: 0.259, season_obp: 0.33, season_slg: 0.42, season_hr: 20, season_doubles: 28, season_triples: 2,
  season_k_rate: 0.22, season_bb_rate: 0.085, season_babip: 0.295, season_sb: 8, season_cs: 3, season_sb_attempt_rate: 0.07,
  pitcher_name: team === 'AAA' ? 'TEST ARM B' : 'TEST ARM A', pitcher_throws: 'R', pitcher_k_rate: 0.24, pitcher_bb_pct: 0.08, pitcher_hr9: 1.1,
  pitcher_babip: 0.29, pitcher_gb_rate: 0.44, pitcher_era: 3.9, pitcher_whip: 1.22, pitcher_wp9: 0.3, bullpen_era: 4.0, bullpen_whip: 1.3, bullpen_hr9: 1.1,
  park_hr_factor: 1, park_hits_factor: 1, weather_hr_effect_pct: 0, opp_def_success_rate: 79, ...over,
})
const lineup = (team, over) => Array.from({ length: 9 }, (_, i) => bat(team, i + 1, over))
const game = {
  away: { team: 'AAA', lineup: lineup('AAA'), starter: 'TEST ARM B', pitcherRow: bat('AAA', 1), ctx: { park_hr_factor: 1, isHome: false } },
  home: { team: 'BBB', lineup: lineup('BBB', { season_hr: 30 }), starter: 'TEST ARM A', pitcherRow: bat('BBB', 1), ctx: { park_hr_factor: 1, isHome: true } },
}

// 1 + 2 ──────────────────────────────────────────────────────────────────────
let same = true, adds = true, outsOk = true
for (let s = 1; s <= 400; s += 1) {
  const a = simGame(game, s)
  const log = []
  const b = simGame(game, s, log)
  const line = (g) => JSON.stringify([g.away.runs, g.home.runs, g.inning, g.away.batters.map((x) => [x.ab, x.h, x.hr, x.r, x.rbi, x.bb, x.k, x.sb]), g.home.batters.map((x) => [x.ab, x.h, x.hr, x.r, x.rbi, x.bb, x.k, x.sb])])
  if (line(a) !== line(b)) same = false
  let sc = { away: 0, home: 0 }
  for (const h of log) {
    const r = h.events.reduce((n, e) => n + (e.scored?.length || 0), 0)
    if (r !== h.runs) adds = false
    sc = { ...sc, [h.side]: sc[h.side] + h.runs }
    if (sc.away !== h.score.away || sc.home !== h.score.home) adds = false
    const lastOuts = h.events.length ? h.events[h.events.length - 1].outs : 0
    const endsGame = h === log[log.length - 1]
    if (lastOuts !== 3 && !(endsGame && h.side === 'home')) outsOk = false
  }
  if (sc.away !== b.away.runs || sc.home !== b.home.runs) adds = false
}
ok(same, 'the log changes nothing: 400 seeds, identical box scores with and without it')
ok(adds, 'the log adds up: runs per half = the plays that scored; the halves sum to the final')
ok(outsOk, 'every half ends on its third out (a game-ending home half excepted)')

// 3 ──────────────────────────────────────────────────────────────────────────
const pp = preplayMlb(game, { n: 500 })
const s = simulate(game, 500)
ok(Math.abs(pp.winPct.home - s.winPct.home) < 1e-12 && Math.abs(pp.winPct.away - s.winPct.away) < 1e-12, `win shares are simulate()'s own (home ${pp.winPct.home.toFixed(3)})`)
ok(Math.abs(pp.total.mean - s.total.mean) < 1e-9, `the total is simulate()'s own (${pp.total.mean.toFixed(2)})`)
const tg = pp.typical.game
ok(tg.away.runs === pp.modal.away && tg.home.runs === pp.modal.home, `the shown game ends on the most common final (${pp.modal.away}-${pp.modal.home}, ${(pp.modal.share * 100).toFixed(1)}% of runs)`)
ok((pp.fav === 'home' ? tg.home.runs > tg.away.runs : tg.away.runs > tg.home.runs), `and the favourite (${pp.fav}) wins it`)
ok(JSON.stringify(preplayMlb(game, { n: 500 }).modal) === JSON.stringify(pp.modal), 'deterministic: the same board gives the same numbers and the same game')

// 4 ──────────────────────────────────────────────────────────────────────────
// TEST balls on the Statcast grid: hc_y 198.27 - r/2.5 straight away to centre (ang 0)
const at = (r, ang) => ({ hc_x: 125.42 + (r / 2.5) * Math.sin(ang * Math.PI / 180), hc_y: 198.27 - (r / 2.5) * Math.cos(ang * Math.PI / 180) })
const DIMS = [330, 375, 400, 375, 330]
const tb = (event, bb, r, ang, extra = {}) => ({ event, bb_type: bb, ev: 100, la: bb === 'ground_ball' ? -5 : 25, distance: r, arm: 'R', ...at(r, ang), ...extra })
const balls = {}
for (const team of ['AAA', 'BBB']) {
  for (let spot = 1; spot <= 9; spot += 1) {
    balls[(team === 'AAA' ? 1000 : 2000) + spot] = spot === 9 ? [] : [
      tb('home_run', 'fly_ball', 380, 0), tb('home_run', 'fly_ball', 420, 10), tb('single', 'line_drive', 220, -20), tb('single', 'line_drive', 450, 0),
      tb('double', 'line_drive', 300, 30), tb('triple', 'fly_ball', 380, 20), tb('field_out', 'ground_ball', 110, 15), tb('field_out', 'fly_ball', 310, -5),
      tb('grounded_into_double_play', 'ground_ball', 120, 0), tb('sac_fly', 'fly_ball', 300, 10), tb('field_error', 'ground_ball', 100, -10),
    ]
  }
}
let fitsAll = true, wallOk = true, noneForNine = true, placedAny = 0
for (let sd = 1; sd <= 60; sd += 1) {
  const log = []
  simGame(game, sd, log)
  placeBalls(log, game, balls, DIMS)
  for (const h of log) for (const e of h.events) {
    if (!['HR', 'T', 'D', 'S', 'OUT', 'E'].includes(e.kind)) continue
    const spot = e.bi + 1
    if (spot === 9) { if (e.ball) noneForNine = false; continue }
    if (!e.ball) { fitsAll = false; continue }
    placedAny += 1
    const want = { HR: ['home_run'], T: ['triple'], D: ['double'], S: ['single'], E: ['field_error'], OUT: e.how === 'dp' ? ['grounded_into_double_play'] : e.how === 'sf' ? ['sac_fly'] : ['field_out', 'grounded_into_double_play', 'sac_fly'] }[e.kind]
    if (!want.includes(e.ball.event)) fitsAll = false
    if (e.kind === 'HR' && e.ball.r < 400 - 2 && e.ball.dist < 400) wallOk = false   // the 380 ft straightaway ball does not clear a 400 ft centre wall
    if (e.kind === 'S' && e.ball.r > 400) wallOk = false                                // the 450 ft "single" is never used
  }
}
ok(placedAny > 100 && fitsAll, `every placed ball has the play's own result (${placedAny} plays)`)
ok(wallOk, 'a homer clears this wall where it flew; a hit stays in the park')
ok(noneForNine, 'a man with no batted balls on file gets none (never a made-up flight)')
const p = sprayPolar(at(400, 0))
ok(Math.abs(p.r - 400) < 0.01 && Math.abs(p.ang) < 0.01, 'the spray transform puts 400 ft straightaway at 400 ft, 0°')
ok(playWords({ kind: 'HR', bi: 2, ball: { dist: 412, ev: 108 } }, game.home.lineup) === 'HOME RUN · 3 · 412 ft · 108 mph', 'the ticker words')

// 5 the video: a walk-off ends on the winning run; a nine-inning game runs about a minute
{
  let walkOk = true, longest = 0
  for (let sd = 1; sd <= 200; sd += 1) {
    const log = []
    simGame(game, sd, log)
    placeBalls(log, game, balls, DIMS)
    const { beats, total, final } = beatsOf(log)
    longest = Math.max(longest, (total + PACE.INTRO_MS) / 1000)
    const lastPlay = [...beats].reverse().find((x) => x.type === 'play')
    if (final.home > final.away && lastPlay.half.side === 'home' && lastPlay.half.inning >= 9) {
      // the last play shown is the one that put the home side ahead
      if (!(lastPlay.before.score.home <= lastPlay.before.score.away)) walkOk = false
    }
  }
  ok(walkOk, 'a walk-off ends the video on the winning run')
  ok(longest < 150, `the longest of 200 TEST games runs ${longest.toFixed(0)} s of video (under 150)`)
}

console.log(fails ? `\n${fails} FAILED` : '\nall PREPLAY checks pass')
process.exit(fails ? 1 : 0)
