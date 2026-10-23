// node --import ./scripts/_esm-resolve.mjs scripts/check-prop-lanes.mjs
// THE ONE LIST PER SPORT HOLDS (2026-10-22, lib/propLanes.js). Every reader that used to carry its own copy of a sport's lanes now
// derives it from lib/propLanes.js. This check runs each reader on fixed TEST inputs and compares what it produces with what the
// old hand-written tables produced the day the list was made (scripts/check-prop-lanes.fixture.json, TEST data, captured before
// the refactor). Changing a lane on purpose = update the fixture in the same commit and say why. Also: BUCKETS' model bars
// (lib/nba/model.js NBA_MARKETS) must equal the list's.
import fs from 'node:fs'
import { MARKETS as MLB_MARKETS } from '../lib/gamelogs.js'
import * as LS from '../lib/liveStatus.js'
import { GOAL_MARKETS } from '../lib/nhl/goalLog.js'
import { MARKETS as NFL_MARKETS, MARKET_SHORT } from '../lib/nfl/theme.js'
import { NBA_MARKETS } from '../lib/nba/model.js'
import { propLanesOf } from '../lib/propLanes.js'

const want = JSON.parse(fs.readFileSync(new URL('./check-prop-lanes.fixture.json', import.meta.url), 'utf8'))
const games = [{ h: 0, tb: 0, hr: 0, r: 0, rbi: 0, bb: 0, k: 2 }, { h: 2, tb: 5, hr: 1, r: 1, rbi: 2, bb: 1, k: 0 }, { h: 1, tb: 1, hr: 0, r: 0, rbi: 0, bb: 0, k: 1 }, { h: 1, tb: 2, hr: 0, r: 1, rbi: 0, bb: 0, k: 1 }]
const got = {}
got.mlbMarkets = MLB_MARKETS.map((m) => ({ key: m.key, label: m.label, tests: games.map((g) => m.test(g)) }))
const line = { state: 'Live', h: 2, r: 1, rbi: 1, tb: 5, hr: 1 }, fin = { state: 'Final', h: 0, r: 0, rbi: 0, tb: 0, hr: 0 }
got.mlbLive = ['hr', 'top', 'hr2', 'hit', 'hrr', 'contact', 'tb', 'zzz'].map((k) => [k, LS.mlbLiveStatus(k, line, { inning: 5, half: 'Bottom' }), LS.mlbLiveStatus(k, fin, null)])
got.nflLive = ['TD', 'TD2', 'REC_YDS', 'REC', 'RUSH_YDS', 'RUSH_ATT', 'PASS_YDS', 'KICK_PTS', 'X'].map((k) => [k, LS.nflLiveStatus(k, 1, { state: 'in', period: 2, clock: '4:11' }, 1), LS.nflLiveStatus(k, 0, { state: 'post' }, 2)])
const nhlGame = { state: 'live', statusLine: 'P2 10:00', goals: [{ scorer: { id: 7 }, assists: [{ id: 8 }], periodType: 'REG' }, { scorer: { id: 8 }, assists: [{ id: 7 }], periodType: 'REG' }, { scorer: { id: 7 }, assists: [], periodType: 'SO' }] }
got.nhlLive = ['GOAL', 'G2', 'PTS', 'AST', 'SOG', 'X'].map((k) => [k, LS.nhlLiveStatus(k, { playerId: 7, value: 4 }, nhlGame), LS.nhlLiveStatus(k, { playerId: 8, value: 1 }, { ...nhlGame, state: 'final' })])
const live = { games: [{ id: 'g1', state: 'live', detail: '7:12 - 3rd' }], players: { p1: { pts: 27, reb: 9, ast: 4, tpm: 3, tens: 1 } } }
got.nbaLive = ['pts', 'reb', 'ast', '3pm', 'pra', 'dd', 'td', 'x'].map((k) => [k, LS.nbaLiveStatus(k, { gameId: 'g1', playerId: 'p1' }, live), LS.nbaLiveStatus(k, { gameId: 'g1', playerId: 'p1' }, live, 30)])
got.goalMarkets = GOAL_MARKETS.map(({ key, label, one, stat, lines, first }) => ({ key, label, one, stat, lines, first }))
got.nflMarkets = NFL_MARKETS
got.nflStatKey = Object.fromEntries(propLanesOf('nfl').filter((l) => l.stat).map((l) => [l.key, l.stat]))   // HitRate.js STAT_KEY (JSX file, same expression)
got.nbaBars = Object.fromEntries(Object.entries(NBA_MARKETS).map(([k, m]) => [k, { bar: m.bar, label: m.label }]))
const mlb = propLanesOf('mlb')
got.thresholdGrid = { LINES: Object.fromEntries(mlb.map((l) => [l.key, l.lines])), SHORT: Object.fromEntries(mlb.map((l) => [l.key, l.word])) }   // ThresholdGrid's own expressions
got.playerBars = propLanesOf('nba').filter((l) => l.bars !== false).map((l) => [l.key, l.label, l.lines, l.first])   // PlayerBars' MARKETS, its fields

let bad = 0
for (const k of Object.keys(want)) {
  const a = JSON.stringify(want[k]), b = JSON.stringify(got[k])
  if (a !== b) { bad++; console.log(`FAIL ${k}\n  was ${a.slice(0, 400)}\n  now ${b.slice(0, 400)}`) }
}
const shortWant = { TD: 'ANY TD', REC_YDS: 'REC YDS', REC: 'REC', RUSH_YDS: 'RUSH YDS', RUSH_ATT: 'RUSH ATT', PASS_YDS: 'PASS YDS', KICK_PTS: 'KICK PTS', DEF_TD: 'DEF TD' }
if (JSON.stringify(MARKET_SHORT) !== JSON.stringify(shortWant)) { bad++; console.log('FAIL nfl MARKET_SHORT', JSON.stringify(MARKET_SHORT)) }
for (const l of propLanesOf('nba')) if (NBA_MARKETS[l.key] && NBA_MARKETS[l.key].bar !== l.bar) { bad++; console.log(`FAIL nba ${l.key}: model bar ${NBA_MARKETS[l.key].bar}, list bar ${l.bar}`) }
console.log(bad ? `check-prop-lanes: ${bad} problem(s)` : `check-prop-lanes: every reader matches the list (${Object.keys(want).length} tables, 4 sports)`)
process.exit(bad ? 1 : 0)
