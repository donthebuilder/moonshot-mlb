#!/usr/bin/env node
// ALTERNATE RUNGS + 2+ MARKETS (lib/odds/lines.js), on TEST events -- invented ids, books and prices; no real game.
//   node --import ./scripts/_esm-resolve.mjs scripts/odds/check-alt-lines.mjs
import { linesRows, altLineRungs } from '../../lib/odds/lines.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

const book = (odds, ou, alts) => ({ odds: String(odds), overUnder: String(ou), available: true, altLines: alts })
// TEST: a receiver whose main line is 62.5 with 79.5 / 99.5 rungs at three books (one lists 99.5 only), plus a QB at 249.5 with a 299.5 rung.
const ev = {
  leagueID: 'NFL', eventID: 'TEST1', status: { startsAt: '2099-10-04T17:00:00Z' },
  teams: { home: { teamID: 'H', names: { short: 'HHH' } }, away: { teamID: 'A', names: { short: 'AAA' } } },
  players: { P1: { name: 'Test Receiver', teamID: 'H' }, P2: { name: 'Test Passer', teamID: 'A' } },
  odds: {
    'receiving_yards-P1-game-ou-over': {
      statID: 'receiving_yards', periodID: 'game', playerID: 'P1', betTypeID: 'ou', sideID: 'over', bookOverUnder: '62.5', bookOdds: '-115',
      byBookmaker: {
        b1: book(-115, 62.5, [{ overUnder: 79.5, odds: '+140' }, { overUnder: 99.5, odds: '+300' }]),
        b2: book(-110, 62.5, [{ overUnder: 79.5, odds: '+150' }, { overUnder: 99.5, odds: '+340' }, { overUnder: 119.5, odds: '+700' }]),
        b3: book(-120, 62.5, [{ overUnder: 99.5, odds: '+320' }]),
      },
    },
    'passing_yards-P2-game-ou-over': {
      statID: 'passing_yards', periodID: 'game', playerID: 'P2', betTypeID: 'ou', sideID: 'over', bookOverUnder: '249.5', bookOdds: '-110',
      byBookmaker: { b1: book(-110, 249.5, [{ overUnder: 299.5, odds: '+450' }]) },
    },
    // 2+ TD as an over 1.5 (the main line), and the anytime yes/no which must NEVER become a td2 row
    'touchdowns-P1-game-ou-over': {
      statID: 'touchdowns', periodID: 'game', playerID: 'P1', betTypeID: 'ou', sideID: 'over', bookOverUnder: '1.5', bookOdds: '+420',
      byBookmaker: { b1: book(+400, 1.5), b2: book(+440, 1.5) },
    },
    'touchdowns-P2-game-yn-yes': {
      statID: 'touchdowns', periodID: 'game', playerID: 'P2', betTypeID: 'yn', sideID: 'yes', bookOdds: '+150', byBookmaker: { b1: { odds: '+150' } },
    },
  },
}
const { rows } = linesRows(ev, 'lock', '2099-10-04T16:00:00Z', () => 'ours')
const by = (m) => rows.filter((r) => r.market === m)

const main = by('rec_yds')
check(main.length === 1 && main[0].line === 62.5, 'the main line is still ONE row per player per market (the readers of rec_yds are untouched)')
const alt = by('rec_yds_alt').sort((a, b) => a.line - b.line)
check(alt.length === 2 && alt[0].line === 79.5 && alt[1].line === 99.5, 'rungs 79.5 and 99.5 stored under rec_yds_alt; 119.5 is not on the rung list')
check(alt[1].odds === 320 && alt[1].books === 3 && alt[1].best_odds === 340 && alt[1].best_book === 'b2', '99.5: the median across the 3 books that list THAT rung (+320), best +340 at b2')
check(alt[0].odds === 145 && alt[0].books === 2, '79.5: two books list it; median of +140 and +150 is +145')
check(alt.every((r) => r.odd_id.includes('#') && r.side === 'over' && r.bet === 'ou' && r.stat === 'receiving_yards'), 'odd_id carries the rung, so the (event, odd, snap) key stays unique')
check(by('pass_yds_alt').length === 1 && by('pass_yds_alt')[0].line === 299.5, 'passing 299.5 rung stored')
const t2 = by('td2')
check(t2.length === 1 && t2[0].line === 1.5 && t2[0].odds === 420 && t2[0].our_player_id === 'ours', '2+ TD: the over 1.5 stored as td2 with its consensus price')
check(!rows.some((r) => r.market === 'td2' && r.sgo_player_id === 'P2'), 'the anytime yes/no is never read as a 2+ price')
check(altLineRungs({ byBookmaker: { b: { available: false, altLines: [{ overUnder: 99.5, odds: '+300' }] } } }).length === 0, 'an unavailable book lists nothing')
check(linesRows({ ...ev, odds: { 'receiving_yards-P1-game-ou-over': { ...ev.odds['receiving_yards-P1-game-ou-over'], byBookmaker: { b1: book(-115, 62.5) } } } }, 'lock', 't', () => 'o').rows.every((r) => r.market === 'rec_yds'), 'a feed with no alternate lines adds only the main row (nothing invented)')
console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
