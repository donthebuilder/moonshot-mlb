#!/usr/bin/env node
// THIS SEASON FIRST on the LAMP shot map (2026-10-10). Every row is TEST DATA (made-up ids, dates, shots).
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-lamp-shots-season.mjs
import { readShotMapWith, pickLeague, LEAGUE_MIN_GAMES } from '../lib/nhl/shotMap.js'
import { stampLine, leagueStamp } from '../lib/nhl/shotStamp.js'

let failed = 0
const check = (ok, what, extra = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}${ok ? '' : ` ${extra}`}`); if (!ok) failed += 1 }

const CUR = 20269999; const PREV = 20259998   // test season ids
const season = { id: CUR, current: CUR }

// a fake lamp_shots table: rows { game_id, event_id, game_date, season, game_type, player_id, team, x, y, result, ... }
let ev = 0
const rows = []
// a season's game days are in their own year, so a mixed response is visible in the dates
const day = (sn, g) => `${sn === CUR ? '2099' : '2098'}-${String(1 + Math.floor(g / 28)).padStart(2, '0')}-${String(1 + (g % 28)).padStart(2, '0')}`
const add = (sn, n, player, team) => {
  for (let g = 0; g < n; g += 1) {
    const gid = sn * 1000 + g * 10 + (player % 10)
    for (let k = 0; k < 3; k += 1) rows.push({ game_id: gid, event_id: (ev += 1), game_date: day(sn, g), season: sn, game_type: 2, player_id: player, team, x: 70 + k, y: k, result: k === 2 ? 'goal' : 'sog', strength: 'ev', shot_type: 'wrist', period: 1, period_type: 'REG', time_s: 100 + k, zone: 'O', situation_code: '1551', goalie_id: 5 })
  }
}
add(CUR, 4, 8000001, 'AAA')    // 4 games this season (small sample), 30 last
add(PREV, 30, 8000001, 'AAA')
add(PREV, 30, 8000002, 'AAA')  // 0 games this season, 30 last
add(CUR, 14, 8000003, 'BBB')   // enough this season
add(PREV, 40, 8000003, 'BBB')

const fakeDb = (leagueBySeason) => ({
  from() {
    const f = []
    const q = {
      select() { return q }, order() { return q },
      eq(k, v) { f.push((r) => r[k] === v); return q }, neq(k, v) { f.push((r) => r[k] !== v); return q },
      in(k, vs) { f.push((r) => vs.includes(r[k])); return q },
      range(a, b) { return Promise.resolve({ data: rows.filter((r) => f.every((t) => t(r))).sort((x, y) => (x.game_date < y.game_date ? -1 : x.game_date > y.game_date ? 1 : x.event_id - y.event_id)).slice(a, b + 1), error: null }) },
    }
    return q
  },
  rpc(name, args) {
    const lg = leagueBySeason[args.p_season]
    return Promise.resolve(lg ? { data: lg, error: null } : { data: null, error: { message: 'none' } })
  },
})
const leagueOf = (games) => ({ games, attempts: games * 100, sog: games * 50, slotSog: games * 18, cells: [{ r: 2, c: 3, att: games * 10, sog: games * 5, g: games }] })
const db = fakeDb({ [CUR]: leagueOf(70), [PREV]: leagueOf(1312) })   // this season: 70 league games; last: a full season
const yearsIn = (d) => new Set(d.all.recent.map((s) => s[8].slice(0, 4)))
const read = (key, id, opts) => readShotMapWith(db, season, key, id, opts)

// ── a player with 4 games this season: THIS season, labelled, not stale ──
const p4 = await read('player', 8000001)
check(p4.season === CUR && p4.stale === false && p4.fallback === null, 'player, 4 games this season: this season, not stale, no fallback')
check(p4.all.games === 4 && p4.sample.games === 4 && p4.sample.thin === true && p4.sample.current === true, 'the sample says 4 games, thin, current')
check(yearsIn(p4).size === 1 && [...yearsIn(p4)][0] === '2099', 'no last-season shot in the response (one season only)')
check(stampLine(p4, p4.all) === 'THIS SEASON: 4 GAMES · SMALL SAMPLE, READ LIGHTLY', 'the stamp says "THIS SEASON: 4 GAMES"', stampLine(p4, p4.all))
// league: this season's has 70 games (< LEAGUE_MIN_GAMES): last season's, said so
check(p4.league && p4.league.season === PREV && p4.league.fallback === true && p4.league.games >= LEAGUE_MIN_GAMES, "the league comparison is last season's, flagged fallback, because the league is early")
check(/last season/.test(leagueStamp(p4.league, p4)) && p4.league.seasonLabel.length > 0, 'the league stamp names its season and says it is last season\'s', leagueStamp(p4.league, p4))

// ── a player with 0 games this season: last season, with the explicit line ──
const p0 = await read('player', 8000002)
check(p0.season === PREV && p0.stale === true && p0.fallback === 'no-shots-this-season', 'player, 0 shots this season: last season, stale, fallback named')
check(/^NO SHOTS YET IN .* SHOWING LAST SEASON/.test(stampLine(p0, p0.all)), 'the stamp says no shots yet this season, showing last season', stampLine(p0, p0.all))
check(p0.league?.season === PREV && p0.league.fallback === false, "last season's league is its own season (not a fallback)")
check([...yearsIn(p0)].join() === '2098', "only last season's shots")
const none = await read('player', 8000009)
check(none.season === null && none.fallback === null, 'no shots in either season: season null (the empty state)')

// ── a club with enough games this season: this season, not thin ──
const t14 = await read('team', 'BBB')
check(t14.season === CUR && !t14.stale && t14.sample.thin === false && t14.all.games === 14, 'club, 14 games: this season, not thin')
check(stampLine(t14, t14.all) === `${t14.seasonLabel} REGULAR SEASON · 14 GAMES`, 'a full sample reads as before', stampLine(t14, t14.all))

// ── the explicit parameter is unchanged ──
const last = await read('player', 8000001, { season: 'last' })
check(last.season === PREV && last.stale === true && last.pick === 'last' && last.all.games === 30 && [...yearsIn(last)].join() === '2098', 'season=last: last season only, as before')
const both = await read('player', 8000001, { season: 'both' })
check(both.season === CUR && both.all.games === 34 && /\+/.test(both.seasonLabel), 'season=both: both seasons, the label says both')
const thisOnly = await read('player', 8000002, { season: 'this' })
check(thisOnly.season === null, 'season=this with no shots: empty, no silent fallback')
// the old 10-game floor, kept for the pre-game write-ups
const auto = await read('player', 8000001, { season: 'auto' })
check(auto.season === PREV && auto.stale === true && auto.fallback === null, 'season=auto: the old 10-game floor (write-ups gate on their own volume)')
const auto14 = await read('team', 'BBB', { season: 'auto' })
check(auto14.season === CUR, 'season=auto with 14 games: this season')

// ── the league picker, pure ──
const big = { season: PREV, games: 1312 }; const small = { season: CUR, games: 5 }; const mid = { season: CUR, games: LEAGUE_MIN_GAMES }
check(pickLeague(mid, big, CUR).season === CUR && pickLeague(mid, big, CUR).fallback === false, 'a league with enough games this season is used as is')
check(pickLeague(small, big, CUR).fallback === true, 'a small league falls back to last season, flagged')
check(pickLeague(small, { season: PREV, games: 20 }, CUR) === null, 'no season with enough league games: no comparison, never a guess')

console.log(failed ? `\n${failed} FAILED` : '\nall ok')
process.exit(failed ? 1 : 0)
