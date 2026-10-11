#!/usr/bin/env node
// THE WATCHLIST (2026-10-10 upgrade). TEST DATA ONLY: made-up players, pins, ranks and clock, labelled as such.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-watchlist.mjs
// Proves: the status word comes through callStatus (lib/nfl/tdStatus), the injury chip and role come from their own modules, the rank
// move rides each row, the summary line counts, the Moved strip picks the right men, the empty state suggests only real board names,
// and the stored list keeps working: an old week-bucketed value is read and an undone removal restores the pin as stored.
const store = new Map()
const ls = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => { store.set(k, String(v)) }, removeItem: (k) => { store.delete(k) } }
globalThis.localStorage = ls
globalThis.window = { localStorage: ls, dispatchEvent() {}, addEventListener() {}, removeEventListener() {} }
globalThis.Event = class { constructor(t) { this.type = t } }

const { buildWatchRows, sortRows, summarize, movedRows, suggestions, movementOf, gameOptions } = await import('../lib/nfl/watchRows.js')
const { tdStatusFor } = await import('../lib/nfl/tdStatus.js')
const { STATUS_WORD } = await import('../lib/callStatus.js')
const { restoreWatch, dropWatch } = await import('../lib/nfl/watchlist.js')

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

// TEST week file: four made-up men and one who left the slate
const P = (id, name, pos, team, td, extra = {}) => ({ player_id: id, name, position: pos, team, opp: 'ZZZ', scores: { TD: td, REC_YDS: td - 5 }, ...extra })
const players = [
  P('t1', 'Test Alpha', 'RB', 'AAA', 90, { role: 'RB1' }),
  P('t2', 'Test Bravo', 'WR', 'AAA', 70, { role: 'WR1', injury_status: 'Q' }),
  P('t3', 'Test Charlie', 'TE', 'BBB', 55, { role: 'TE1', injury_status: 'OUT' }),
  P('t4', 'Test Delta', 'WR', 'BBB', 40, { role: 'WR2' }),
  P('t5', 'Test Echo', 'RB', 'CCC', 30),
]
const board = [...players].sort((a, b) => b.scores.TD - a.scores.TD)
const rankOf = new Map(board.map((p, i) => [p.player_id, i + 1]))
const byId = new Map(players.map((p) => [p.player_id, p]))
const kick = (iso) => iso
const pins = [
  { player_id: 't2', name: 'Test Bravo', team: 'AAA', position: 'WR', game_id: 'g1', kickoff: kick('2026-10-11T17:00:00Z'), pinned_market: 'TD', pinned_score: 64, pinned_at: '2026-10-09T10:00:00Z' },
  { player_id: 't1', name: 'Test Alpha', team: 'AAA', position: 'RB', game_id: 'g1', kickoff: kick('2026-10-11T17:00:00Z'), pinned_market: 'TD', pinned_score: 89 },       // old pin: snapshot but no pinned_at
  { player_id: 't3', name: 'Test Charlie', team: 'BBB', position: 'TE', game_id: 'g2', kickoff: kick('2026-10-12T00:20:00Z') },                                              // pre-snapshot pin: no snapshot at all
  { player_id: 'gone', name: 'Test Gone', team: 'ZZZ', position: 'WR', stale: true },
]
// status through the shared rule: t1 is on the bot's card (CALLED), t2/t3 are inside the top third, others are not
const picksCard = { TD: { picks: [{ player_id: 't1' }] } }
const { statusOf } = tdStatusFor({ picksCard, gameCalls: null, games: [{ game_id: 'g1', home: 'AAA', away: 'XXX' }], board })
const moveOf = (id) => (id === 't2' ? { move: { kind: 'up', n: 2 }, prevAt: 1, source: 'device' } : null)
const NOW = Date.parse('2026-10-10T18:00:00Z')
const rows = sortRows(buildWatchRows({ pins, byId, statusOf, rankOf, moveOf, now: NOW }))

check(rows.map((r) => r.id).join() === 't1,t2,t3,gone', 'sorted by the TD score, the man off the slate last')
const t1 = rows[0], t2 = rows[1], t3 = rows[2], gone = rows[3]
check(['called', 'board', 'off'].includes(t1.status) && STATUS_WORD[t1.status], 'status is one of the three callStatus words')
check(t1.status === statusOf(byId.get('t1')), 'status is exactly what tdStatusFor says (not re-derived)')
check(t1.rank === 1 && t2.rank === 2 && t3.rank === 3, 'rank is his place on the TD board')
check(t2.rankMove?.move?.kind === 'up' && t2.rankMove.move.n === 2 && t1.rankMove === null, 'the rank move rides his row')
check(t2.inj === 'Q' && t3.inj === 'OUT' && t1.inj === null, 'injury tag from lib/nfl/injury (Q / OUT / none)')
check(t1.role === 'RB1' && t2.role === 'WR1', 'role label from lib/nfl/roles')
check(t2.move?.delta === 6 && t1.move?.delta === 1 && t3.move === null, 'move since saved: on the pinned market; none for a pin with no snapshot (nothing back-filled)')
check(t2.ago === 'yesterday' && t1.ago === null, '"pinned" ago only where pinned_at exists')
check(gone.status === null && gone.rank === null && gone.player === null, 'a man off the slate has no status, rank or score (never invented)')

const sum = summarize(rows, '2026-10-11')
check(sum.count === 4 && sum.playingToday === 3 && sum.out === 1 && sum.questionable === 1, `summary counts (watching ${sum.count}, today ${sum.playingToday}, out ${sum.out}, Q ${sum.questionable})`)
check(sum.called === rows.filter((r) => r.status === 'called').length, 'CALLED count = rows reading CALLED')
check(summarize(rows, '2026-10-12').playingToday === 0, 'the day is each game\'s own: the 00:20Z kickoff is the 11th in Eastern time, so nobody plays on the 12th')

const moved = movedRows(rows).map((r) => r.id)
check(moved.join() === 't2', 'Moved = rank arrow or >= 3 points since saved (t2 has both; t1 +1 does not qualify)')

const sug = suggestions(board, new Set(['t1']), 3)
check(sug.length === 3 && !sug.some((p) => p.player_id === 't1') && sug.every((p) => byId.has(p.player_id)), 'suggestions: real board names only, never a man already watched')
check(suggestions([], new Set(), 3).length === 0, 'no board = no suggestions (omitted, nothing invented)')
check(movementOf({ pinned_market: 'TD' }, byId.get('t1')) === null, 'a pin with no snapshot yields no move')
check(gameOptions([{ game_id: 'g2', kickoff: '2026-10-12T00:20:00Z' }, { game_id: 'g1', kickoff: '2026-10-11T17:00:00Z' }, { game_id: 'g3' }], pins).map((o) => o.game.game_id).join() === 'g1,g2', 'game filter: only games with a pin, by kickoff')

// ── the stored list keeps working ────────────────────────────────────────────
// an old week-bucketed value ({ 'season:mode:week': [rows] }) is still read: restoreWatch goes through the same read()
store.set('tuddy_watchlist_v1', JSON.stringify({ '2026:week:3': [{ player_id: 'old1', name: 'Test Old', team: 'AAA' }], '2026:week:4': [{ player_id: 'old2', name: 'Test Old Two', team: 'BBB' }] }))
check(restoreWatch({ player_id: 'new1', name: 'Test New', team: 'AAA', position: 'WR', pinned_score: 61, pinned_market: 'TD', pinned_at: '2026-10-09T00:00:00Z', stale: false }) === true, 'restoreWatch writes the pin back')
let saved = JSON.parse(store.get('tuddy_watchlist_v1'))
check(Array.isArray(saved.pins) && saved.pins.map((p) => p.player_id).join() === 'old1,old2,new1', 'old week buckets migrate into the flat list; the stored key and shape are the same')
const back = saved.pins.find((p) => p.player_id === 'new1')
check(back.pinned_score === 61 && back.pinned_market === 'TD' && back.pinned_at === '2026-10-09T00:00:00Z' && !('stale' in back), 'the undone pin keeps its snapshot; `stale` (computed on read) is not stored')
check(restoreWatch({ player_id: 'new1', name: 'dup' }) === false && JSON.parse(store.get('tuddy_watchlist_v1')).pins.length === 3, 'undo twice does not duplicate him')
const follows = JSON.parse(store.get('dash_follow_v1') || '{}')
check(follows['nfl:new1']?.name === 'Test New', 'undo follows him again (the push audience key nfl:<id> is unchanged)')
dropWatch('new1')
check(!JSON.parse(store.get('tuddy_watchlist_v1')).pins.some((p) => p.player_id === 'new1'), 'dropWatch still removes him')

console.log(failed ? `${failed} FAILED` : 'watchlist: all ok')
process.exit(failed ? 1 : 0)
