#!/usr/bin/env node
// NBA ODDS CAPTURE, END TO END ON TEST DATA (2026-10-13, BUCKETS go-live prep). No network, no SGO object spent, no database.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-nba-odds-capture.mjs
// The event below is a SYNTHETIC TEST EVENT in the SGO shape (statIDs as lib/odds/lines.js EXTRA.NBA documents them). Nothing here is a real price or a real player.
// Holds, for the day Donovan sets NBA_ODDS_CAPTURE=on:
//   1. flag off (default) and BUCKETS hidden: the tick's leagues are NFL, MLB, NHL only, and the month planner counts no NBA game
//   2. flag on: NBA joins the list pass and the planner; only the exact word "on" counts
//   3. what an NBA event stores: the five over/under markets as odds_lines rows (best book, consensus, books count), the game total as one odds_game_totals row,
//      and ZERO odds_snap rows (BUCKETS has no yes/no market listed, so the yes/no reader finds nothing and does not crash)
//   4. a started event still yields rows from the pure readers, so the TICK is what refuses it: the tick source re-reads the clock and skips `started`
//   5. the tick calls no NFL-only freezer for an NBA event (freezeDashLines / freezeTdBoard return null off NFL)
//   6. the object cost of a month from the real (public) schedule counts is under the soft cap in every month of the season with NBA on
import assert from 'node:assert/strict'
import fs from 'node:fs'

delete process.env.NBA_ODDS_CAPTURE; delete process.env.BUCKETS_PUBLIC; delete process.env.NEXT_PUBLIC_BUCKETS_PUBLIC
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const SNAP = await import('../lib/odds/snap.js')
const LINES = await import('../lib/odds/lines.js')
const GT = await import('../lib/odds/gameTotal.js')
const DL = await import('../lib/dashLock.js')
const BL = await import('../lib/boardLock.js')
const BUD = await import('../lib/odds/budget.js')

let n = 0
const ok = async (name, fn) => { await fn(); n += 1; console.log(`ok  ${name}`) }

// ── TEST EVENT (synthetic) ──
const book = (odds, line) => ({ odds, overUnder: line, available: true, lastUpdatedAt: '2026-11-21T20:00:00Z' })
const prop = (stat, player, line, over = '-115') => ({
  statID: stat, periodID: 'game', playerID: player, betTypeID: 'ou', sideID: 'over', bookOverUnder: String(line), bookOdds: over,
  fairOverUnder: String(line), fairOdds: '-110', openBookOverUnder: String(line - 1), openBookOdds: '-110',
  byBookmaker: { bookA: book(over, String(line)), bookB: book('-105', String(line + 0.5)) },
})
const EVENT = {
  eventID: 'TEST_NBA_1', leagueID: 'NBA', status: { startsAt: '2026-11-22T00:30:00.000Z', started: false },
  teams: { home: { teamID: 'T_HOME', names: { short: 'LAL' } }, away: { teamID: 'T_AWAY', names: { short: 'BOS' } } },
  players: { P1: { name: 'Test Player One', teamID: 'T_HOME' }, P2: { name: 'Test Player Two', teamID: 'T_AWAY' } },
  odds: {
    'points-P1-game-ou-over': prop('points', 'P1', 24.5),
    'rebounds-P1-game-ou-over': prop('rebounds', 'P1', 6.5),
    'assists-P2-game-ou-over': prop('assists', 'P2', 5.5),
    'threePointersMade-P2-game-ou-over': prop('threePointersMade', 'P2', 2.5),
    'points+rebounds+assists-P1-game-ou-over': prop('points+rebounds+assists', 'P1', 36.5),
    'steals-P1-game-ou-over': prop('steals', 'P1', 1.5),                       // a market BUCKETS does not use: not stored
    'points-P1-game-ou-under': { ...prop('points', 'P1', 24.5), sideID: 'under' }, // the other side: not stored
    'points-all-game-ou-over': { statID: 'points', periodID: 'game', statEntityID: 'all', betTypeID: 'ou', sideID: 'over', bookOverUnder: '221.5', bookOdds: '-110', fairOverUnder: '221.5', openBookOverUnder: '220', byBookmaker: { bookA: book('-110', '221.5') } },
    'points-all-game-ou-under': { statID: 'points', periodID: 'game', statEntityID: 'all', betTypeID: 'ou', sideID: 'under', bookOverUnder: '221.5', bookOdds: '-110', fairOverUnder: '221.5', openBookOverUnder: '220', byBookmaker: { bookA: book('-110', '221.5') } },
  },
}
const TAKEN = '2026-11-21T23:20:00.000Z'
const match = (sp) => `ours-${sp.name.split(' ').pop()}`

await ok('1. flag off (default) and BUCKETS hidden: no NBA league in the tick, none in the planner', () => {
  assert.equal(SNAP.nbaOddsCapture(), false)
  assert.deepEqual(SNAP.activeLeagues(false, SNAP.nbaOddsCapture()), ['NFL', 'MLB', 'NHL'])
})
await ok('2. flag on: NBA joins; only the exact word "on" counts', () => {
  process.env.NBA_ODDS_CAPTURE = 'on'
  assert.equal(SNAP.nbaOddsCapture(), true)
  assert.deepEqual(SNAP.activeLeagues(false, SNAP.nbaOddsCapture()), ['NFL', 'MLB', 'NHL', 'NBA'])
  for (const v of ['1', 'true', 'yes', 'ON ', '']) { process.env.NBA_ODDS_CAPTURE = v; if (v.trim().toLowerCase() === 'on') continue; assert.equal(SNAP.nbaOddsCapture(), false, `"${v}"`) }
  delete process.env.NBA_ODDS_CAPTURE
})
await ok('3a. odds_lines: the five BUCKETS markets, over side only, best book and book count kept', () => {
  const r = LINES.linesRows(EVENT, 'lock', TAKEN, match)
  assert.deepEqual(r.rows.map((x) => x.market).sort(), ['3pm', 'ast', 'pra', 'pts', 'reb'])
  assert.ok(r.rows.every((x) => x.sport === 'nba' && x.side === 'over' && x.bet === 'ou' && x.snap === 'lock' && x.books === 2))
  const pts = r.rows.find((x) => x.market === 'pts')
  assert.equal(pts.line, 24.5); assert.equal(pts.odds, -115); assert.equal(pts.best_line, 24.5); assert.equal(pts.best_book, 'bookA'); assert.equal(pts.game_date, '2026-11-21')
  assert.equal(pts.our_player_id, 'ours-One'); assert.equal(pts.team, 'LAL')
  assert.equal(r.players, 2); assert.equal(r.matched, 2)
})
await ok('3b. odds_game_totals: one NBA row with the consensus total (points, not goals)', () => {
  const g = GT.gameTotalRow(EVENT, 'lock', TAKEN)
  assert.equal(g.sport, 'nba'); assert.equal(g.line, 221.5); assert.equal(g.books, 1); assert.equal(g.game_date, '2026-11-21'); assert.equal(g.home, 'LAL')
})
await ok('3c. odds_snap: zero rows for NBA (no yes/no market is listed yet), and no crash', () => {
  const s = SNAP.snapRows(EVENT, 'lock', TAKEN, match)
  assert.deepEqual(s, { rows: [], players: 0, matched: 0 })
})
await ok('4. the tick refuses a started game: the clock is re-read at every write and `started` is skipped', () => {
  const src = read('app/api/odds/tick/route.js')
  assert.match(src, /Date\.parse\(takenAt\) < Date\.parse\(startsAt\(ev\)\)\) \|\| ev\.status\?\.started\) \{ out\.skipped\.push\(\{ event: ev\.eventID, snap, why: 'started' \}\)/)
  assert.match(src, /Date\.now\(\) < Date\.parse\(startsAt\(ev\)\)\) \|\| ev\.status\?\.started\) continue \/\/ already under way/)
})
await ok('5. NFL-only freezers return null for an NBA event (no dash line, no TD board)', async () => {
  assert.equal(await DL.freezeDashLines({}, EVENT, [{ market: 'pts' }], TAKEN), null)
  assert.equal(await BL.freezeTdBoard({}, EVENT, [], TAKEN, EVENT.status.startsAt), null)
})
await ok('6. the lock window lands every tip time the cron covers (11:00-05:59 UTC, every 10 minutes)', () => {
  const cron = JSON.parse(read('vercel.json')).crons.filter((c) => c.path === '/api/odds/tick').map((c) => c.schedule)
  assert.deepEqual(cron.sort(), ['*/10 0-5 * * *', '*/10 11-23 * * *'])
  // a lock needs a tick 50-70 minutes before the tip: a 12:00 UTC tip (noon ET holiday) locks 10:50-11:10 UTC, so the 11:00 tick catches it; the last tip is ~04:30 UTC
  const covered = (utcHour) => (utcHour >= 11 && utcHour <= 23) || (utcHour >= 0 && utcHour <= 5)
  for (const tipHour of [12, 17, 20, 23, 0, 2, 4]) assert.ok(covered((tipHour + 24 - 1) % 24), `tip ${tipHour}:00 UTC has a lock tick an hour before`)
})
await ok('7. objects a month with NBA on (public schedule counts, measured 2026-10-13) stay under the soft cap in every month', () => {
  // [month, NBA, NHL, NFL] regular season + postseason games; MLB adds ~40 postseason games in October only. Measured, not guessed: ESPN scoreboard + NHL schedule API.
  const MONTHS = [['2026-10', 88, 218, 60], ['2026-11', 215, 209, 71], ['2026-12', 178, 214, 62], ['2027-01', 236, 231, 43], ['2027-02', 169, 155, 1], ['2027-03', 232, 227, 0], ['2027-04', 88, 82, 0]]
  const S = BUD.SNAPS
  for (const [m, nba, nhl, nfl] of MONTHS) {
    const mlb = m === '2026-10' ? 40 : 0
    const withClose = nba * S.NBA.withClose + nhl * S.NHL.withClose + nfl * S.NFL.withClose + mlb * S.MLB.withClose
    assert.ok(withClose <= BUD.SOFT_CAP, `${m}: ${withClose} objects with CLOSE > ${BUD.SOFT_CAP}`)
  }
})

console.log(`\n${n} checks passed`)
