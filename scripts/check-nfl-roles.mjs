#!/usr/bin/env node
// NFL DEPTH ROLES (lib/nfl/roles.js and every surface that prints one). All data below is TEST data, made up for this check only
// (clubs "T01".."T02", players "p1".."p9"); nothing here is a real player or a real number.
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/check-nfl-roles.mjs
import { depthRole, isSlot, withRoles, roleLabel, roleLong, roleNote, roleOptions, roleMatches, roleGames, SLOT_MIN_PCT } from '../lib/nfl/roles.js'
import { matchupTag } from '../lib/nfl/dvpSignal.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

// TEST matchup: the bot's `roles` map (gsis_id -> role) and `snaps` rows, two clubs
const M = {
  season: 2026,
  roles: { p1: 'WR1', p2: 'WR2', p3: 'WR3', p4: 'Other WR', p5: 'RB1', p6: 'TE1', p7: 'QB', p8: 'Other TE', p9: { role: 'RB2' }, p10: 'WR2', p11: 'WR1' },
  snaps: { p1: { games: 4, snap_pct: 80 }, p2: { games: 2, snap_pct: 90, slot_pct: 70 }, p3: { games: 4, slot_pct: 20 } },
  dvp: { season: { T02: { WR1: { td: 3, td_rank: 4, g: 4 } } } },
}
// 1. role assignment is the bot's chart, numbered roles only, position-guarded
check(depthRole(M, 'p1', 'WR') === 'WR1' && depthRole(M, 'p2', 'WR') === 'WR2' && depthRole(M, 'p3', 'WR') === 'WR3', 'WR1 / WR2 / WR3 come straight off the chart')
check(depthRole(M, 'p5', 'RB') === 'RB1' && depthRole(M, 'p9', 'RB') === 'RB2' && depthRole(M, 'p6', 'TE') === 'TE1', 'RB1, RB2 (object row too) and TE1')
check(depthRole(M, 'p7', 'QB') === 'QB', 'a quarterback is "QB": the file has no QB1 and none is invented')
check(depthRole(M, 'p4', 'WR') === null && depthRole(M, 'p8', 'TE') === null, '"Other WR" / "Other TE" are depth men: no number, plain position')
check(depthRole(M, 'p1', 'TE') === null && depthRole(M, 'p5', 'WR') === null, 'a role from the wrong position group is refused')
check(depthRole(M, 'nobody', 'WR') === null && depthRole(M, 'p1', 'K') === null && depthRole({}, 'p1', 'WR') === null && depthRole(null, 'p1', 'WR') === null, 'no data / kicker / no roles map -> null, never a guess')

// 2. ties: two men claiming one chair keep what the chart says (the helper never re-ranks)
check(depthRole(M, 'p10', 'WR') === 'WR2' && depthRole(M, 'p2', 'WR') === 'WR2', 'two WR2 on a chart are both printed as the chart has them (no re-derivation)')

// 3. slot only when a stored field supports it
check(SLOT_MIN_PCT === 50, 'the slot threshold is 50% of his snaps')
check(isSlot(M.snaps.p2) === true && isSlot(M.snaps.p3) === false && isSlot(M.snaps.p1) === null && isSlot(undefined) === null, 'slot: true at 70%, false at 20%, unknown (null) without the field')
const slate = { season: 2026, players: [
  { player_id: 'p1', position: 'WR', name: 'A' }, { player_id: 'p2', position: 'WR', name: 'B' }, { player_id: 'p4', position: 'WR', name: 'C' },
  { player_id: 'p5', position: 'RB', name: 'D' }, { player_id: 'zz', position: 'WR', name: 'E' }, { player_id: 'k1', position: 'K', name: 'F' } ] }
const S = withRoles(slate, M)
const by = Object.fromEntries(S.players.map((p) => [p.player_id, p]))
check(by.p1.role === 'WR1' && by.p1.role_slot === null, 'WR1 with no slot field: role_slot unknown, SLOT never shown')
check(by.p2.role === 'WR2' && by.p2.role_slot === true && roleLong(by.p2) === 'WR2 · slot' && roleLabel(by.p2) === 'WR2', 'slot is added only where the field exists, and only in the long form')
check(by.p4.role == null && roleLabel(by.p4) === 'WR', 'a depth man prints his position')
check(by.zz.role === undefined && roleLabel(by.zz) === 'WR' && roleLabel(by.k1) === 'K', 'a player with no data -> position only')
check(withRoles(slate, { season: 2026 }) === slate && withRoles(null, M) === null, 'no roles map -> the slate is returned untouched (same object)')
check(roleLabel(null) === '' && roleLabel({ position: 'TE' }) === 'TE', 'roleLabel is total')

// 4. the filter
const opts = roleOptions(S.players)
check(opts.map((o) => o.key).join() === 'RB1,WR1,WR2,SLOT', 'filter options in depth order, only roles present, SLOT only because a field supports it')
check(S.players.filter((p) => roleMatches(p, 'WR2')).length === 1 && S.players.filter((p) => roleMatches(p, 'SLOT')).length === 1 && S.players.filter((p) => roleMatches(p, 'all')).length === 6, 'roleMatches: by role, by slot, and "all"')
check(roleOptions(withRoles(slate, { ...M, snaps: {} }).players).every((o) => o.key !== 'SLOT'), 'no slot field anywhere -> no Slot chip at all')

// 5. the sample + season label
check(roleGames(M, 'p1') === 4 && roleGames(M, 'nobody') === null, 'games of snaps behind the chart')
check(/4 games of snaps/.test(roleNote(by.p1, 2026)) && /2026/.test(roleNote(by.p1, 2026)) && /not a forecast/.test(roleNote(by.p1, 2026)), 'note: season, games, and "a label, not a forecast"')
check(/early: 2 games of snaps/.test(roleNote(by.p2, 2026)), 'under 3 games it says early, with the count')
check(roleNote(by.p4, 2026) === null, 'no role -> no note')

// 6. the same word on the board, the alert text and the X text: the defense line reads the same role
const tag = matchupTag(M, { opp: 'T02', player_id: 'p11' }, 'TD')
check(tag?.role === 'WR1' && depthRole(M, 'p11', 'WR') === tag.role, 'the "WR1 vs T02" defense line and the board label are the same role')

if (failed) { console.error(`\n${failed} check(s) failed`); process.exit(1) }
console.log('\nall NFL role checks passed')
