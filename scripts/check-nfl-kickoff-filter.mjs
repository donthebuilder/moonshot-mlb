#!/usr/bin/env node
// The Sunday board / poll only name players whose game has not kicked off.
// TEST DATA only -- made-up names. No network.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-nfl-kickoff-filter.mjs
import { nflBoardPicks, nflBotPollPicks } from '../lib/nfl/tweetFeed.js'
import { periodWord } from '../lib/nfl/period.js'
import { OUTSIDE_POOL } from '../lib/recordWindow.js'
import { tdPool } from '../lib/nfl/tdPool.js'
let fail = 0
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); fail += !ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : ` -> ${JSON.stringify(got)}`}`) }

const NOW = Date.parse('2026-10-11T16:30:00Z')   // Sunday 12:30 ET
const p = (id, team, opp, position, TD) => ({ player_id: id, name: `Test ${id}`, team, opp, position, scores: { TD } })
const data = {
  games: [
    { away: 'AAA', home: 'BBB', kickoff: '2026-10-11T13:00:00Z' },   // started 9:00 ET
    { away: 'CCC', home: 'DDD', kickoff: '2026-10-11T17:00:00Z' },   // 1:00 ET, not yet
    { away: 'EEE', home: 'FFF', kickoff: '2026-10-12T00:20:00Z' },   // Sunday night 8:20 ET
    { away: 'GGG', home: 'HHH', kickoff: '2026-10-13T00:15:00Z' },   // Monday night 8:15 ET
  ],
  players: [
    p('a', 'AAA', 'BBB', 'RB', 99), p('c', 'CCC', 'DDD', 'RB', 50), p('e', 'EEE', 'FFF', 'WR', 40),
    p('g', 'GGG', 'HHH', 'WR', 80), p('q', 'CCC', 'DDD', 'QB', 30), p('n', 'EEE', 'FFF', 'TE', null),
  ],
}
const opts = { now: NOW, day: '2026-10-11' }
eq('board picks', nflBoardPicks(data, undefined, opts).map((x) => x.player_id), ['q', 'c', 'e'])
eq('poll skips played + other-day games', nflBotPollPicks(data, 4, opts).map((x) => x.player_id), ['c', 'e', 'q'])
eq('no opts keeps the whole slate (other callers)', nflBotPollPicks(data, 4)[0].player_id, 'a')
eq('window off, started game still dropped', nflBotPollPicks(data, 4, { now: NOW }).map((x) => x.player_id), ['g', 'c', 'e', 'q'])
eq('OT word', [periodWord(4), periodWord(5), periodWord(6), periodWord(null)], ['Q4', 'OT', '2OT', ''])
eq('null score not in the pool', tdPool({ markets: [{ key: 'TD', positions: ['RB', 'WR', 'TE'] }], players: [p('n', 'EEE', 'FFF', 'TE', null), p('c', 'CCC', 'DDD', 'RB', 5)] }).rows.map((x) => x.player_id), ['c'])
eq('outside pool: QB and DB yes, WR / blank no', ['QB', 'DB', 'WR', ''].map((position) => OUTSIDE_POOL.nfl({ payload: { position } })), [true, true, false, false])
process.exit(fail ? 1 : 0)
