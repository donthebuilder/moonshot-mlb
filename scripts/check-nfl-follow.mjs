#!/usr/bin/env node
// NFL FOLLOW MATCHING (NOTIF-6, 2026-09-27). TEST DATA ONLY: made-up follow
// lists and a made-up ESPN-shaped box score run through lib/dash/pushRules.js.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-nfl-follow.mjs
import { followNameKey, audienceFrom, nflEventsFrom, nflFollowMisses, wants } from '../lib/dash/pushRules.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

// ── the key ───────────────────────────────────────────────────────────────
for (const [a, b] of [
  ['D.J. Moore', 'DJ Moore'], ['A.J. Brown', 'AJ Brown'], ['T.J. Hockenson', 'TJ Hockenson'],
  ['Marvin Harrison Jr.', 'Marvin Harrison'], ['Kenneth Walker III', 'Kenneth Walker'],
  ['Amon-Ra St. Brown', 'Amon-Ra St Brown'], ['Ja’Marr Chase', "Ja'Marr Chase"],
  ['Dalvin Cook', 'DALVIN COOK'], ['Jonathan Taylor', 'Jonathan  Taylor'],
]) check(followNameKey(a) === followNameKey(b), `"${a}" == "${b}" (${followNameKey(a)})`)
for (const [a, b] of [['Mike Williams', 'Mike Evans'], ['DJ Moore', 'D.K. Metcalf'], ['Josh Allen', 'Josh Jacobs']]) {
  check(followNameKey(a) !== followNameKey(b), `"${a}" != "${b}"`)
}

// ── end to end: follow "D.J. Moore" (board spelling), ESPN says "DJ Moore" ─
const state = { u1: { dash_follow_v1: { 'nfl:00-0034827': { id: '00-0034827', name: 'D.J. Moore', team: 'CHI', sport: 'nfl' }, 'nfl:x': { id: 'x', name: 'Marvin Harrison Jr.', team: 'ARI' } } } }
const audience = audienceFrom(state)
const snap = {   // TEST box score
  games: [{ game_id: 'G1', state: 'in', period: 2, away: 'CHI', home: 'GB', away_score: 7, home_score: 3 },
          { game_id: 'G2', state: 'in', period: 4, away: 'ARI', home: 'SF', away_score: 10, home_score: 14 }],
  lines: new Map([
    ['dj moore|CHI', { name: 'DJ Moore', team: 'CHI', game_id: 'G1', receiving_tds: 1, receptions: 4, receiving_yards: 61 }],
    ['george kittle|SF', { name: 'George Kittle', team: 'SF', game_id: 'G2', receiving_tds: 1, receptions: 5, receiving_yards: 70 }],
  ]),
}
const ev = nflEventsFrom(snap, '2026-09-27', audience)
const td = ev.find((e) => e.category === 'nfltd')
check(td && td.playerName === 'DJ Moore', 'follow "D.J. Moore" + box "DJ Moore" -> nfltd event (was: none)')
check(td && wants(state.u1, td), 'wants(): the follower gets it')
check(!ev.some((e) => /Kittle/.test(e.playerName || '')), 'no event for a man nobody follows')
check(ev.some((e) => e.category === 'nflkick' && e.playerNames?.includes('DJ Moore')), 'kickoff for his game names him')

// ── the miss log ──────────────────────────────────────────────────────────
const misses = nflFollowMisses(snap, audience)
check(misses.length === 1 && misses[0].key === 'marvin harrison' && misses[0].game_id === 'G2', `4th quarter, followed, no line -> one miss (${JSON.stringify(misses)})`)
check(!nflFollowMisses({ ...snap, games: snap.games.map((g) => ({ ...g, period: 2 })) }, audience).length, 'before the 4th quarter -> no miss (a quiet first half is normal)')


// ── where a TD alert opens (2026-10-04): his card when the slate knows his id ──
{
  const tdSnap = { games: [{ game_id: 'G9', state: 'in', home: 'AAA', away: 'BBB', period: 2 }], lines: new Map([['x', { game_id: 'G9', name: 'Test Scorer', team: 'AAA', receiving_tds: 1, receptions: 2, receiving_yards: 30 }]]) }
  const aud = { nfl: new Set([followNameKey('Test Scorer')]) }
  const withId = nflEventsFrom(tdSnap, '2026-10-04', aud, null, new Map([[followNameKey('Test Scorer'), '00-0000001']])).find((e) => e.category === 'nfltd')
  check(withId?.url === '/app#sport=nfl&tab=players&player=00-0000001', `TD with a known id opens his card (${withId?.url})`)
  const noId = nflEventsFrom(tdSnap, '2026-10-04', aud, null, null).find((e) => e.category === 'nfltd')
  check(noId?.url === '/app#sport=nfl&tab=watchlist', `TD with no id map opens the Watchlist (${noId?.url})`)
  const shared = nflEventsFrom(tdSnap, '2026-10-04', aud, null, new Map([[followNameKey('Test Scorer'), null]])).find((e) => e.category === 'nfltd')
  check(shared?.url === '/app#sport=nfl&tab=watchlist', 'a name two players share opens the Watchlist, not a guess')
}

console.log(failed ? `\n${failed} FAILED` : '\nall green')
process.exit(failed ? 1 : 0)
