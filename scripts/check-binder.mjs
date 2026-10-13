// THE BINDER (lib/cards/binder.js + the card list helpers in lib/cards/specialData.js + lib/cards/momentEvents.js): grouping and sorting, BASE collapsed, the watchlist filter,
// the NEW badge logic, the empty state, and "no invented rows". Every row below is TEST data (names say Test); nothing here is a real player's card.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-binder.mjs
import { readFileSync } from 'node:fs'
import { RARITY_ORDER, rarestFirst, newestFirst, mergeCards, followKeysOf, onlyWatched, filterCards, groupByRarity, progress, playersOf, parseSeen, isNew, newCount, markSeen, emptyState, cardKey, SEEN_CAP } from '../lib/cards/binder.js'
import { cardSummary, bestPerPlayerDay, gameOfRow, idOf } from '../lib/cards/specialData.js'
import { momentsForEvent, momentRowsOf } from '../lib/cards/momentEvents.js'
import * as F from '../lib/cards/specialFixtures.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

const card = (o) => ({ moment: 'nhl_hat_trick', id: `1:${o.playerId || 11}`, sport: 'nhl', tier: 'elite', tierWord: 'ELITE', kicker: 'HAT TRICK', line: '3 GOALS', day: '2026-10-10', dayWord: 'Oct 10', playerId: '11', name: 'Test Skater', team: 'TST', opp: 'EXA', game: '1', ...o })
const TODAY = '2026-10-12'
const L1 = card({ tier: 'legend', tierWord: 'LEGEND', id: 'L1', day: '2026-10-01' })
const E1 = card({ tier: 'elite', id: 'E1', day: '2026-10-11', playerId: '12', name: 'Test Two' })
const E2 = card({ tier: 'elite', id: 'E2', day: '2026-10-05', playerId: '11' })
const S1 = card({ tier: 'star', tierWord: 'STAR', id: 'S1', day: '2026-10-12', sport: 'mlb', playerId: '900', name: 'Test Slugger', moment: 'mlb_multi_hr' })
const S2 = card({ tier: 'star', tierWord: 'STAR', id: 'S2', day: '2026-09-20', playerId: '12', name: 'Test Two' })
const B1 = card({ tier: 'base', tierWord: 'BASE', id: 'B1', day: '2026-10-12', moment: 'nhl_goal', playerId: '11' })
const B2 = card({ tier: 'base', tierWord: 'BASE', id: 'B2', day: '2026-10-03', moment: 'nhl_goal', playerId: '11' })
const ALL = [B2, S2, E2, L1, S1, E1, B1]

// ── grouping and sorting ──
check(RARITY_ORDER.join() === 'legend,elite,star,base', 'rarity order: LEGEND > ELITE > STAR > BASE')
const groups = groupByRarity(ALL)
check(groups.map((g) => g.tier).join() === 'legend,elite,star,base', 'sections come out LEGEND, ELITE, STAR, BASE')
check(groups[1].cards.map((c) => c.id).join() === 'E1,E2', 'newest first inside a section (ELITE: Oct 11 then Oct 5)')
check(groups[2].cards.map((c) => c.id).join() === 'S1,S2', 'newest first inside STAR')
check(groups[3].collapsed === true && groups[0].collapsed === false && groups[1].collapsed === false && groups[2].collapsed === false, 'only BASE is collapsed')
check(groups[3].title === 'Base cards (2)', 'BASE reads "Base cards (N)"')
check(groups[0].title === 'LEGEND (1)', 'the other sections read "LEGEND (1)"')
check(groupByRarity([]).length === 0, 'no cards, no sections (never an empty LEGEND header)')
check(groupByRarity([S1]).length === 1, 'a section with no cards is left out')
check([...ALL].sort(rarestFirst).map((c) => c.id).join() === 'L1,E1,E2,S1,S2,B1,B2', 'rarestFirst: tier, then newest, ties stable')
check([...ALL].sort(newestFirst)[0].id === 'S1' || [...ALL].sort(newestFirst)[0].id === 'B1', 'newestFirst leads with the newest day')

// ── progress strip ──
check(progress(ALL).text === '7 cards · 1 LEGEND · 2 ELITE · 2 STAR · 2 BASE', 'strip: "7 cards · 1 LEGEND · 2 ELITE · 2 STAR · 2 BASE"')
check(progress([L1, E1, E2, S1, S2]).text === '5 cards · 1 LEGEND · 2 ELITE · 2 STAR', 'strip leaves BASE out when there is none')
check(progress([]).text === '0 cards', 'no cards -> "0 cards"')
check(progress([E1]).text === '1 card · 1 ELITE', 'singular')

// ── filters ──
const follows = followKeysOf([{ sport: 'nhl', id: '11' }, { sport: 'mlb', id: '900', removed: true }, { sport: 'nhl', id: '12' }])
check(follows.has('nhl:11') && follows.has('nhl:12') && !follows.has('mlb:900'), 'a removed follow (tombstone) is not a follow')
check(onlyWatched(ALL, follows).map((c) => c.id).sort().join() === 'B1,B2,E1,E2,L1,S2', 'MY CARDS: only players on the watchlist (the unwatched MLB slugger is out)')
check(onlyWatched(ALL, new Set()).length === 0, 'an empty watchlist is an empty binder, never "everyone"')
check(filterCards(ALL, { sport: 'mlb' }).map((c) => c.id).join() === 'S1', 'filter: sport')
check(filterCards(ALL, { rarity: 'elite' }).length === 2, 'filter: rarity')
check(filterCards(ALL, { playerId: '12' }).map((c) => c.id).sort().join() === 'E1,S2', 'filter: player')
check(filterCards(ALL, { week: true, today: TODAY }).map((c) => c.id).sort().join() === 'B1,E1,S1', 'filter: this week = the last 7 days (Oct 6 to Oct 12)')
check(filterCards(ALL, { week: true }).length === ALL.length, 'this week without a "today" keeps everything instead of guessing')
check(filterCards(ALL, { week: true, today: TODAY, rarity: 'star' }).map((c) => c.id).join() === 'S1', 'filters combine')
check(playersOf(ALL)[0].playerId === '11' && playersOf(ALL)[0].n >= 4, 'the player filter lists players, most cards first')
check(mergeCards([L1, E1], [E1, S1]).length === 3, 'merging two lists keeps a card once')

// ── NEW since the last visit ──
check(parseSeen(null) === null && parseSeen('garbage') === null && parseSeen('{"v":2}') === null, 'a missing or broken seen record is "first visit"')
check(newCount(ALL, null) === 0 && !isNew(L1, null), 'FIRST visit: nothing is NEW (nothing to compare with)')
let seen = markSeen(null, [L1, E2, S2, B2], 1000)
check(seen.ids.length === 4 && seen.v === 1, 'marking seen stores the ids')
check(isNew(E1, seen) && isNew(S1, seen) && !isNew(L1, seen), 'a card not seen before is NEW; a seen one is not')
check(newCount(ALL, seen) === 2, 'NEW count counts STAR and up (BASE never raises the badge): E1, S1')
check(newCount(ALL, seen, { minTier: 'base' }) === 3, 'with BASE counted, B1 is NEW too')
seen = markSeen(seen, ALL, 2000)
check(newCount(ALL, seen) === 0, 'after the binder is looked at, nothing is NEW')
const big = markSeen(null, Array.from({ length: SEEN_CAP + 50 }, (_, i) => card({ id: `x${i}` })), 3)
check(big.ids.length === SEEN_CAP, `the seen list is capped at ${SEEN_CAP}`)
check(parseSeen(JSON.stringify(seen)).ids.length === seen.ids.length, 'the record round-trips through localStorage JSON')

// ── empty state ──
const board = [{ sport: 'nhl', id: '11', name: 'Test Skater', team: 'TST' }, { sport: 'nhl', id: '21', name: 'Test A', team: 'TST' }, { sport: 'nhl', id: '22', name: 'Test B', team: 'EXA' }, { sport: 'nhl', id: '23', name: 'Test C' }, { sport: 'nhl', id: '24', name: 'Test D' }, { id: '', name: 'no id' }, null]
const es = emptyState({ board, followKeys: new Set(['nhl:11']), sport: 'nhl' })
check(es.suggestions.length === 3 && es.suggestions.map((s) => s.id).join() === '21,22,23', 'empty state: 3 suggestions from the board, skipping players already followed and rows without an id')
check(emptyState({ board: [], sport: 'nhl' }).suggestions.length === 0, 'no board -> no suggestions (nothing is invented)')
check(emptyState({ board: [board[1]], sport: 'nhl' }).suggestions.length === 1, 'a board with one man gives one suggestion, not three')
check(/Follow players/.test(emptyState({ sport: 'nhl' }).note) && /earns a card/.test(emptyState({ sport: 'nhl' }).note), 'the empty state explains how to collect')
check(emptyState({ hasFollows: true }).title === 'NO CARDS YET FOR YOUR PLAYERS' && emptyState({}).title === 'YOUR BINDER IS EMPTY', 'two empty states: following nobody vs following players with no card yet')

// ── the card list built from stored rows (real shape, TEST rows) ──
const nhl = [{ key: 'nhl_hat_trick', row: F.TEST_HAT, id: idOf.nhl_hat_trick(F.TEST_HAT) }, { key: 'nhl_goal', row: F.TEST_GOAL, id: idOf.nhl_goal(F.TEST_GOAL) }]
const best = bestPerPlayerDay(nhl, 'nhl')
check(best.length === 1 && best[0].moment === 'nhl_hat_trick' && best[0].tier === 'elite', 'one card per player per game day: the hat trick beats the single goal')
check(best[0].playerId === '11' && best[0].name === 'Test Skater' && best[0].team === 'TST' && best[0].game === '1', 'a card names the player, the club and the game')
check(cardSummary('nhl_goal', { ...F.TEST_GOAL, time_in_period: '' }, 'x', 'nhl') === null, 'a moment whose trigger is false is no card')
check(gameOfRow('mlb_multi_hr', F.TEST_MULTI_HR) === '700' && gameOfRow('nfl_100_yards', F.TEST_100) === null, 'the game of a card: MLB gamePk, none for a yardage card (no stored game)')

// ── the shared moment rule (the push and the post builder call this) ──
const ev = momentsForEvent({ sport: 'nhl', rows: F.TEST_HAT_ROWS })
check(ev.length === 1 && ev[0].moment === 'nhl_hat_trick' && ev[0].tier === 'elite' && ev[0].playerId === '11', 'momentsForEvent: three goals by one man -> one ELITE hat trick')
check(momentsForEvent({ sport: 'nhl', rows: [F.TEST_GOAL] }).length === 0, 'momentsForEvent: a plain goal (BASE) is never an event')
check(momentsForEvent({ sport: 'nhl', rows: [F.TEST_GOAL], minTier: 'base' }).length === 1, 'minTier base lets a plain goal through (callers opt in)')
check(momentsForEvent({ sport: 'nhl', rows: [{ ...F.TEST_GOAL_OT }] }).length === 1 && momentsForEvent({ sport: 'nhl', rows: [F.TEST_GOAL_OT] })[0].tier === 'star', 'an overtime goal is a STAR event')
check(momentsForEvent({ sport: 'nhl', rows: F.TEST_HAT_ROWS.map((r) => ({ ...r, overturned_at: '2026-01-02T00:00:00Z' })) }).length === 0, 'overturned goals are no event')
check(momentsForEvent({ sport: 'nhl', rows: [] }).length === 0 && momentsForEvent({ sport: 'nba', rows: [F.TEST_GOAL] }).length === 0 && momentsForEvent({ sport: 'nhl' }).length === 0, 'no rows / a sport with no moments -> nothing')
check(momentRowsOf('mlb', []).length === 0, 'momentRowsOf: empty in, empty out')

// ── no invented rows: the binder code carries no fixture and the page code carries no card literal ──
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
for (const p of ['lib/cards/binder.js', 'app/api/card/binder/route.js', 'app/api/card/recent/route.js', 'lib/cards/momentEvents.js']) {
  const src = read(p)
  check(!/Test Skater|TST|fixture|Math\.random|faker/i.test(src), `${p}: no fixture, no random, no made-up names`)
}
console.log(failed ? `\n${failed} FAILED` : '\nall binder checks passed')
process.exit(failed ? 1 : 0)
