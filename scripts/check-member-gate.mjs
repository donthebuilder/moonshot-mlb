#!/usr/bin/env node
// THE MEMBERS LOCK, CHECKED (2026-10-16). lib/members/gate.js decides which of tonight's CALLED labels a non-member sees as the lock.
// Plain node, TEST DATA only (the names and times below are made up for this check and are labelled as test data).
//   node scripts/check-member-gate.mjs
import './_esm-resolve.mjs'
import { readFileSync } from 'node:fs'

const { memberStateOf, startedAt, freeCalledKeys, hiddenCalledCount, lockedFor, cardGate, storyLockKey, maskCalledRows, gameCountVisible } = await import('../lib/members/gate.js')
const { FREE_CALLS_PER_SPORT } = await import('../lib/members/limits.js')
const access = readFileSync(new URL('../lib/members/access.js', import.meta.url), 'utf8')

const fails = []
const eq = (got, want, msg) => { if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${msg}: got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`) }
const ok = (cond, msg) => { if (!cond) fails.push(msg) }

// TEST DATA: one sport's board, 7 called + others, all before first pitch
const NOW = Date.parse('2030-01-01T20:00:00Z')
const LATER = '2030-01-01T23:00:00Z'
const EARLIER = '2030-01-01T18:00:00Z'
const mk = (id, status, time = LATER, rank = id) => ({ id: `test-${id}`, status, time, rank })
const board = [mk(1, 'called'), mk(2, 'called'), mk(3, 'board'), mk(4, 'called'), mk(5, 'called'), mk(6, 'called'), mk(7, 'called'), mk(8, 'off'), mk(9, 'called')]
const opts = { keyOf: (r) => r.id, startedOf: (r) => startedAt(r.time, { now: NOW }), statusOf: (r) => r.status, rankOf: (r) => r.rank }

// 0. the number is Donovan's, written once (access.js re-exports it)
eq(FREE_CALLS_PER_SPORT, 4, 'FREE_CALLS_PER_SPORT')
ok(/export \{[^}]*FREE_CALLS_PER_SPORT/.test(access), 'lib/members/access.js no longer re-exports FREE_CALLS_PER_SPORT')

// 1. free gets exactly 4 per sport, in the board's own order, then locks
const free = freeCalledKeys(board, opts)
eq([...free], ['test-1', 'test-2', 'test-4', 'test-5'], 'the free four are the first four CALLED rows')
const lockedIds = board.filter((r) => lockedFor({ status: r.status, started: false, graded: false, key: r.id, free, memberState: 'free' })).map((r) => r.id)
eq(lockedIds, ['test-6', 'test-7', 'test-9'], 'the rest of the CALLED rows lock')
// another sport is its own count
eq(freeCalledKeys([mk(21, 'called'), mk(22, 'called')], opts).size, 2, 'a second sport has its own four')

// 2. member / unknown are never locked; ON THE BOARD / NOT ON THE BOARD never lock
const lockedWith = (over) => lockedFor({ status: 'called', started: false, graded: false, key: 'test-9', free, memberState: 'free', ...over })
eq(lockedWith({}), true, 'baseline: a fifth called pick locks for a free viewer')
eq(lockedWith({ memberState: 'member' }), false, 'member is never locked')
eq(lockedWith({ memberState: 'unknown' }), false, 'unknown fails open')
eq(lockedWith({ status: 'board' }), false, 'ON THE BOARD is never locked')
eq(lockedWith({ status: 'off' }), false, 'NOT ON THE BOARD is never locked')
eq(lockedWith({ status: null }), false, 'no status is never locked')

// 3. started / graded show the real label for everyone
eq(lockedWith({ started: true }), false, 'a started game shows the real label')
eq(lockedWith({ graded: true }), false, 'a graded pick shows the real label')
const mixed = [mk(31, 'called', EARLIER), mk(32, 'called'), mk(33, 'called'), mk(34, 'called'), mk(35, 'called'), mk(36, 'called')]
eq([...freeCalledKeys(mixed, opts)], ['test-32', 'test-33', 'test-34', 'test-35'], 'a started pick does not use up a free slot')

// 4. a past slate is never locked (no usable time: not started only on today's slate)
eq(startedAt(null, { now: NOW, slateIsToday: true }), false, 'no time, today: not started')
eq(startedAt(null, { now: NOW, slateIsToday: false }), true, 'no time, a past slate: started')
eq(startedAt('', { now: NOW, slateIsToday: false }), true, 'empty time, a past slate: started')
eq(startedAt('not a date', { now: NOW, slateIsToday: false }), true, 'unreadable time, a past slate: started')
eq(startedAt(Date.parse(LATER), { now: NOW }), false, 'ms time in the future: not started')
eq(startedAt(LATER, { now: NOW }), false, 'ISO time in the future: not started')
eq(startedAt(EARLIER, { now: NOW }), true, 'ISO time in the past: started')
const past = board.map((r) => ({ ...r, time: null }))
const pastFree = freeCalledKeys(past, { ...opts, startedOf: (r) => startedAt(r.time, { now: NOW, slateIsToday: false }) })
eq(pastFree.size, 0, 'a past slate has no tonight picks to ration')

// 5. ranking tie order is stable (ties and missing places keep the order given; the same four every time)
const ties = [mk(41, 'called', LATER, 1), mk(42, 'called', LATER, 1), mk(43, 'called', LATER, 1), mk(44, 'called', LATER, 1), mk(45, 'called', LATER, 1), mk(46, 'called', LATER, 1)]
eq([...freeCalledKeys(ties, opts)], ['test-41', 'test-42', 'test-43', 'test-44'], 'tied ranks keep the given order')
eq([...freeCalledKeys([...ties].reverse(), opts)], ['test-46', 'test-45', 'test-44', 'test-43'], 'the given order is the tiebreak, both ways')
const unranked = [{ id: 'test-51', status: 'called', time: LATER }, mk(52, 'called', LATER, 1), { id: 'test-53', status: 'called', time: LATER }, mk(54, 'called', LATER, 2), mk(55, 'called', LATER, 3), mk(56, 'called', LATER, 4)]
eq([...freeCalledKeys(unranked, opts)], ['test-52', 'test-54', 'test-55', 'test-56'], 'a row with no place sorts after the placed ones')
eq([...freeCalledKeys(board, opts)], [...freeCalledKeys(board, opts)], 'the same board gives the same four twice')
eq([...freeCalledKeys([...board].sort((a, b) => b.rank - a.rank), opts)], ['test-1', 'test-2', 'test-4', 'test-5'], 'the rank, not the list order, sets the free four')

// 6. who is a member (the account state the sync layer holds)
eq(memberStateOf(null), 'unknown', 'no account state yet')
eq(memberStateOf({ ready: false, signedIn: false, configured: true }), 'unknown', 'still loading')
eq(memberStateOf({ ready: true, signedIn: false, configured: false }), 'unknown', 'server without accounts: fail open')
eq(memberStateOf({ ready: true, signedIn: false, configured: true }), 'free', 'signed out is a non-member')
eq(memberStateOf({ ready: true, signedIn: true, configured: true, who: { member: true } }), 'member', 'member')
eq(memberStateOf({ ready: true, signedIn: true, configured: true, who: { member: false } }), 'free', 'signed in, not a member')
eq(memberStateOf({ ready: true, signedIn: true, configured: true, who: null }), 'unknown', 'signed in, no answer about membership: fail open')

// 7. THE PLAYER CARD RULE (Donovan 2026-10-16): lock-all on tonight's not-started CALLED pick, except the boards' free four; TEST DATA
const card = (over) => cardGate({ status: 'called', time: LATER, graded: false, key: 'test-9', free, memberState: 'free', now: NOW, ...over })
eq(card({}).locked, true, 'card: a non-member is locked on tonight\'s not-started CALLED pick (lock-all)')
eq(card({ free: new Set() }).locked, true, 'card: with no board mounted (empty free set) the card still locks')
eq(card({ key: 'test-1' }).locked, false, 'card: one of the free four stays unlocked, so the table and the card agree')
eq(card({ key: 'test-6' }).locked, true, 'card: a called man outside the free four locks')
eq(card({ graded: true }).locked, false, 'card: a graded pick shows its real label')
eq(card({ time: EARLIER }).locked, false, 'card: a started game shows its real label')
eq(card({ time: null, slateIsToday: false }).locked, false, 'card: a past slate is never locked')
eq(card({ memberState: 'member' }).locked, false, 'card: a member sees today\'s card')
eq(card({ memberState: 'unknown' }).locked, false, 'card: unknown membership fails open')
eq(card({ status: 'board' }).locked, false, 'card: ON THE BOARD never locks')
eq(card({ status: 'off' }).locked, false, 'card: NOT ON THE BOARD never locks')
eq(card({ status: null }).locked, false, 'card: no status never locks')
eq(card({}).gate.key, 'test-9', 'card: the gate handed to CallStatusBadge carries the key')

// 8. THE LIST KEY (storylines, the swipe): built the way each sport's board builds its row key, so a list and a table agree on the free four; TEST DATA
eq(storyLockKey('mlb', 'test-7', 'test-g1'), 'test-7-test-g1|test-g1', 'MLB: `${player}-${game}|${game}`, the RankedBoard row key')
eq(storyLockKey('nhl', 'test-7', 'test-g1'), 'test-g1|test-7', 'NHL: `${game}|${player}`, the goal board row key')
eq(storyLockKey('nfl', 'test-7', 'test-g1'), 'test-7', 'NFL: the player id, the TD board row key')
eq(storyLockKey('nfl', 7, null), '7', 'a number id is a string key')
const sk = (sport, key) => lockedFor({ status: 'called', started: false, graded: false, key, free: new Set([storyLockKey(sport, 'test-1', 'test-g1')]), memberState: 'free' })
eq(sk('mlb', storyLockKey('mlb', 'test-1', 'test-g1')), false, 'list: the man in the free set is unlocked')
eq(sk('mlb', storyLockKey('mlb', 'test-2', 'test-g1')), true, 'list: any other called man locks')
eq(sk('mlb', 'test-1'), true, 'list: a key that matches no board only ever LOCKS a man, it never reveals one')

// 9. THE LOOK (Donovan 2026-10-16: "don't show them as locked, just show them as ON THE BOARD"). A hidden CALLED pick is an ON THE BOARD pick to everything downstream;
//    the join prompt is one count line under the list, never a per-row lock. TEST DATA.
const effective = (r, memberState = 'free') => (lockedFor({ status: r.status, started: false, graded: false, key: r.id, free, memberState }) ? 'board' : r.status)
eq(board.map((r) => effective(r)), ['called', 'called', 'board', 'called', 'called', 'board', 'board', 'off', 'board'], 'free viewer: the free four stay CALLED, the rest read ON THE BOARD, board/off unchanged')
eq(board.map((r) => effective(r, 'member')), board.map((r) => r.status), 'member: every status is the real one')
eq(board.map((r) => effective(r, 'unknown')), board.map((r) => r.status), 'unknown membership: every status is the real one (fail open)')
eq(board.filter((r) => effective(r) === 'called').length, FREE_CALLS_PER_SPORT, 'a free viewer counts exactly FREE_CALLS_PER_SPORT CALLED rows (a status filter or sort cannot find more)')
const hOpts = { keyOf: opts.keyOf, startedOf: opts.startedOf, statusOf: opts.statusOf, free }
eq(hiddenCalledCount(board, hOpts), 3, 'the count line: 7 called minus the free four is 3 (a number, no names)')
eq(hiddenCalledCount(board, { ...hOpts, startedOf: () => true }), 0, 'started games are never counted as hidden')
eq(hiddenCalledCount([], hOpts), 0, 'an empty board hides nothing')
eq(hiddenCalledCount(board, { ...hOpts, free: new Set(board.map((r) => r.id)) }), 0, 'nothing hidden when everyone is free')
eq(hiddenCalledCount([mk(61, 'called'), mk(61, 'called')], { ...hOpts, free: new Set() }), 1, 'a man listed twice (two lanes) counts once')
for (const f of ['components/CallStatusBadge.js', 'components/MemberGate.js', 'components/table/v2.js', 'components/card/RankCard.js', 'components/TonightStrip.js']) {
  const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
  ok(!/1F512|\u{1F512}|Members only\. Join/.test(src), `${f} still draws a lock icon or "Members only" per row`)
}
{
  const mg = readFileSync(new URL('../components/MemberGate.js', import.meta.url), 'utf8')
  ok(/Members see tonight\\u2019s called picks and why/.test(mg), 'the card line is the generic "Members see tonight\u2019s called picks and why."')
  ok(/more called pick/.test(mg), 'the list line is the count line "N more called picks tonight are for members."')
}

// 10. THE GAMES (Donovan 2026-10-17: "the games on the slate page are showing the called picks"). A game's rows are masked: the call fields come off every LOCKED man, his
//     name / stats stay, a member gets the SAME array back, and a per-game count is drawn only when no called man in the game is locked. TEST DATA.
{
  const rowsOf = [
    { id: 'test-1', game_pick_role: 'TOP', best_bet_type: 'HR Bet', hr_score: 61, name: 'Test One' },
    { id: 'test-2', game_pick_role: 'HR/CONTACT', best_bet_type: '', hr_score: 55, name: 'Test Two' },
    { id: 'test-3', game_pick_role: 'WATCH', hr_score: 40, name: 'Test Three' },
    { id: 'test-4', game_pick_role: '', hr_score: 30, name: 'Test Four' },
  ]
  const lockedOf = (r) => ['test-1', 'test-2'].includes(r.id) && lockedFor({ status: 'called', started: false, graded: false, key: r.id, free: new Set(['test-1']), memberState: 'free' })
  const strip = ['game_pick_role', 'best_bet_type', 'beginner_label']
  const m = maskCalledRows(rowsOf, { lockedOf, strip })
  eq(m.map((r) => r.game_pick_role), ['TOP', '', 'WATCH', ''], 'games: only the locked man (test-2) loses his role; the free four man, WATCH and unroled rows are untouched')
  eq(m[1].name, 'Test Two', 'games: a masked man keeps his name')
  eq(m[1].hr_score, 55, 'games: a masked man keeps his score (the board is public; only the CALL is hidden)')
  eq(m[1]._callHidden, true, 'games: a masked row says so (a sentence must not claim "nobody was designated")')
  ok(m[0] === rowsOf[0] && m[2] === rowsOf[2], 'games: an unmasked row is the SAME object')
  ok(maskCalledRows(rowsOf, { lockedOf: () => false, strip }) === rowsOf, 'games: nothing locked (member / unknown / all free) returns the SAME array')
  eq(gameCountVisible([rowsOf[0]], { lockedOf }), true, 'games: a count is drawn when every called man in the game is readable')
  eq(gameCountVisible([rowsOf[0], rowsOf[1]], { lockedOf }), false, 'games: one locked man and the per-game count is hidden (it would point at him)')
  eq(gameCountVisible([], { lockedOf }), true, 'games: no called man, nothing to hide')
  // the game surfaces must go through the mask / the lock, not read the role raw
  for (const [f, needle] of [['components/tabs/Games.js', 'useMlbMask'], ['components/lamp/LampSlate.js', 'hideRow'], ['components/lamp/tabs/Home.js', 'readableCalls'], ['components/nfl/tabs/Home.js', 'lockOf('], ['components/ScoreRail.js', 'useMlbMask'], ['components/lamp/GoalieWeakSpots.js', 'useLockOf']]) {
    ok(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').includes(needle), `${f} no longer goes through the member gate (${needle})`)
  }
  for (const f of ['components/GameWriteupBlock.js', 'components/nfl/WriteupBlock.js']) {
    ok(!/HiddenCalledLine/.test(readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')), `${f} prints a per-game count of hidden calls`)
  }
  ok(/FREE_CALLS_PER_SPORT = 4\b/.test(readFileSync(new URL('../lib/members/limits.js', import.meta.url), 'utf8')), 'lib/members/limits.js: the free taste is no longer 4 (a test value left in?)')
}

// 11. BEST ANGLES ON THE GAME CARDS (Donovan 2026-10-17). The card's two rows are chosen by matchup and form (lib/slate/angles.js) and pass through this gate:
//     a hidden CALLED pick (tonight's not-started CALLED man outside the free four, for a non-member) is never chosen, the next best takes his place; the free four,
//     members and unknown viewers are chosen as ever; a started / graded pick is public. TEST DATA.
{
  const { pickAngles } = await import('../lib/slate/angles.js')
  const free4 = new Set(['test-1'])
  // TEST candidates: test-1 is the best matchup AND a free-four CALLED man; test-2 the next best matchup, CALLED and hidden; test-5 the best form, CALLED and hidden
  const cands = {
    matchup: [{ key: 'test-2', name: 'Test Two', why: 'w', fit: 90, status: 'called' }, { key: 'test-3', name: 'Test Three', why: 'w', fit: 80, status: 'board' }, { key: 'test-1', name: 'Test One', why: 'w', fit: 95, status: 'called' }],
    form: [{ key: 'test-5', name: 'Test Five', why: 'f', form: 9, status: 'called' }, { key: 'test-6', name: 'Test Six', why: 'f', form: 7, status: 'board' }, { key: 'test-1', name: 'Test One', why: 'f', form: 8, status: 'called' }],
  }
  const hiddenFor = (memberState, over = {}) => (c) => lockedFor({ status: c.status, started: false, graded: false, key: c.key, free: free4, memberState, ...over })
  const names = (rows) => rows.map((r) => `${r.kind}:${r.key}`)
  eq(names(pickAngles({ ...cands, hiddenOf: hiddenFor('free') })), ['matchup:test-1', 'form:test-6'], 'angles: a free viewer gets the free-four man (test-1) as the matchup row; the hidden CALLED best form (test-5) is skipped for the next best (test-6)')
  eq(names(pickAngles({ ...cands, hiddenOf: hiddenFor('member') })), ['matchup:test-1', 'form:test-5'], 'angles: a member gets every row as chosen (test-5 is the best form)')
  eq(names(pickAngles({ ...cands, hiddenOf: hiddenFor('unknown') })), ['matchup:test-1', 'form:test-5'], 'angles: unknown membership fails open')
  const noFree = (memberState) => (c) => lockedFor({ status: c.status, started: false, graded: false, key: c.key, free: new Set(), memberState })
  eq(names(pickAngles({ ...cands, hiddenOf: noFree('free') })), ['matchup:test-3', 'form:test-6'], 'angles: with no free four, every hidden CALLED man (test-1, test-2, test-5) is skipped and the next best (test-3, test-6) takes the rows')
  eq(names(pickAngles({ ...cands, hiddenOf: hiddenFor('free', { started: true }) })), ['matchup:test-1', 'form:test-5'], 'angles: a started game is public, so its called men are chosen')
  eq(names(pickAngles({ ...cands, hiddenOf: hiddenFor('free', { graded: true }) })), ['matchup:test-1', 'form:test-5'], 'angles: a graded pick is public')
  const allHidden = pickAngles({ matchup: [cands.matchup[0]], form: [cands.form[0]], hiddenOf: noFree('free') })
  eq(allHidden, [], 'angles: when every candidate is a hidden CALLED man the card has no rows (nobody is invented to fill them)')
  // nothing in the rows says "called"
  const shown = pickAngles({ ...cands, hiddenOf: hiddenFor('member') })
  ok(shown.every((r) => !/called/i.test(JSON.stringify({ k: r.kind, w: r.why, n: r.name }))), 'angles: a row never carries the word called')
  for (const f of ['components/nfl/NflSlate.js', 'components/GameStrip.js', 'components/lamp/LampSlate.js', 'components/buckets/tabs/Slate.js']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8')
    ok(/pickAngles\(/.test(src) && /hiddenOf/.test(src), `${f}: the game card's angle rows no longer go through pickAngles + hiddenOf (the member gate)`)
    ok(/useLockOf|lampLocked/.test(src), `${f}: the game card's angle rows no longer ask the member gate`)
  }
}

if (fails.length) { console.error('check-member-gate FAILED:\n - ' + fails.join('\n - ')); process.exit(1) }
console.log('check-member-gate: ok')
