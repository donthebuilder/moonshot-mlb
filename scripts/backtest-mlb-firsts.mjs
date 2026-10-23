// node --import ./scripts/_esm-resolve.mjs scripts/backtest-mlb-firsts.mjs --rows rows2026.jsonl [--season 2026] [--from 2026-04-15]
// THE FIRSTS MODEL, WALK-FORWARD (2026-10-22). Replays every regular-season game with the shipped model (lib/mlb/firstModel.js
// firstCalls), each batter rated only from his games BEFORE that date, and counts how often the top call (and a top-3 call) got
// the game's first hit and hit its first homer, next to the plain baselines.
//   --rows   the season's opening rows as JSON lines, from scripts/backfill-mlb-openings.mjs --out (the two lineups in order and
//            who got the first hit / first homer)
// His game log comes from statsapi (one batched read per 25 hitters, fields-trimmed). Prints the table; writes nothing.
import { readFileSync } from 'node:fs'
import { firstCalls, ratesOf, VERSION } from '../lib/mlb/firstModel.js'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const SEASON = Number(arg('--season', '2026')), FROM = arg('--from', `${SEASON}-04-15`), ROWS = arg('--rows', null)
if (!ROWS) { console.error('--rows <file.jsonl> is required (scripts/backfill-mlb-openings.mjs --out)'); process.exit(2) }
const games = readFileSync(ROWS, 'utf8').trim().split('\n').map((l) => JSON.parse(l))
  .filter((x) => x.game.season_type === 2 && x.game.game_date >= FROM).sort((a, b) => a.game.game_date.localeCompare(b.game.game_date))

const ids = [...new Set(games.flatMap((x) => x.players.map((p) => p.player_id)))]
const logs = {}
for (let i = 0; i < ids.length; i += 25) {
  const u = `https://statsapi.mlb.com/api/v1/people?personIds=${ids.slice(i, i + 25).join(',')}&hydrate=stats(group=[hitting],type=[gameLog],season=${SEASON},gameType=[R,F,D,L,W])&fields=people,id,stats,splits,date,stat,plateAppearances,hits,homeRuns,baseOnBalls,hitByPitch`
  const j = await (await fetch(u)).json()
  for (const p of j.people || []) logs[p.id] = (p.stats?.[0]?.splits || []).map((s) => [s.date, s.stat.plateAppearances, s.stat.hits, s.stat.homeRuns, (s.stat.baseOnBalls || 0) + (s.stat.hitByPitch || 0)])
}
const before = (id, date) => {
  const c = { pa: 0, h: 0, hr: 0, ob: 0 }
  for (const g of logs[id] || []) if (g[0] < date) { c.pa += g[1]; c.h += g[2]; c.hr += g[3]; c.ob += g[4] }
  return c
}

const T = { n: 0, h1: 0, h3: 0, lead: 0, withHr: 0, r1: 0, r3: 0, rate1: 0 }
for (const x of games) {
  const g = x.game
  const lu = (t) => x.players.filter((p) => p.team === t).sort((a, b) => a.bat_order - b.bat_order).map((p) => ({ id: p.player_id, ...ratesOf(before(p.player_id, g.game_date)) }))
  const away = lu(g.away), home = lu(g.home)
  if (away.length !== 9 || home.length !== 9) continue
  const calls = firstCalls(away, home, { seed: Number(g.game_id) })
  const top = (k, n) => [...calls.entries()].filter(([, c]) => c[k] <= n).map(([id]) => id)
  T.n++
  if (top('hitRank', 1).includes(g.first_hit_player)) T.h1++
  if (top('hitRank', 3).includes(g.first_hit_player)) T.h3++
  if (away[0].id === g.first_hit_player) T.lead++
  if (g.first_hr_player) T.withHr++
  if (top('hrRank', 1).includes(g.first_hr_player)) T.r1++
  if (top('hrRank', 3).includes(g.first_hr_player)) T.r3++
  if ([...away, ...home].sort((a, b) => b.hr - a.hr)[0].id === g.first_hr_player) T.rate1++
}
const p = (a) => `${((100 * a) / T.n).toFixed(1)}%`
console.log(`${VERSION} · ${T.n} regular-season games from ${FROM} (${T.withHr} had a homer)`)
console.log(`FIRST HIT  top call ${p(T.h1)} · top 3 ${p(T.h3)} · always the road leadoff man ${p(T.lead)} · a random starter ${(100 / 18).toFixed(1)}%`)
console.log(`FIRST HR   top call ${p(T.r1)} · top 3 ${p(T.r3)} · the best HR rate in the game ${p(T.rate1)} · a random starter ${((100 / 18) * (T.withHr / T.n)).toFixed(1)}%   (of ALL games: a no-homer game is a miss)`)
