#!/usr/bin/env node
// CALLED LAST NIGHT (2026-10-10). TEST DATA only: made-up players and games, labelled as such.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-called-last.mjs
// Proves: only players CALLED at lock are in; hit / missed / did-not-play / pending are kept apart (a void and a
// pending are never a miss); the date is the game's own; the status word is callStatus's; the wording is neutral
// (no due / owed / bounce-back / probability); the filter and its #cln= address round-trip; the readers work
// against a fake database and the route gates BUCKETS.
import { readFileSync } from 'node:fs'
import { gradeNight } from '../lib/calibration/mlbCalibration.js'
import { STATUS_WORD } from '../lib/callStatus.js'
import * as core from '../lib/calledLast/core.js'
import { mlbRows, nhlRows, nflRows, nbaRows, payloadOf } from '../lib/calledLast/adapters.js'
import { readNhl, readNfl, readNba } from '../lib/calledLast/read.js'

let fail = 0
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); fail += !ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`) }
const yes = (name, v) => eq(name, Boolean(v), true)

// ── MLB: a TEST night, 2026-10-09 (game's own date), first pitch 23:00Z ──────
const FIRST = Date.parse('2026-10-09T23:00:00Z')
const games = new Map([['9001', { start: FIRST, type: 'F', state: 'Final', date: '2026-10-09' }], ['9002', { start: FIRST, type: 'F', state: 'Postponed', date: '2026-10-09' }]])
const por = (pid, name, role, at = '2026-10-09T20:00:00Z', pk = '9001') => ({ player_id: pid, player: name, game_pk: pk, team: 'TST', opp: 'OPP', game_pick_role: role, generated_at: at, prediction_date: '2026-10-08' })
const rows = [
  por(1, 'Test HR Miss', 'HR'), por(2, 'Test HR Hit', 'HR'), por(3, 'Test Hit Pick', 'HIT'), por(4, 'Test Watch Only', 'WATCH'),
  por(5, 'Test No Role', ''), por(6, 'Test Late Call', 'HR', '2026-10-09T23:30:00Z'), por(7, 'Test Did Not Play', 'HIT'),
  por(8, 'Test Pending', 'HRR'), por(9, 'Test Two Lanes', 'HR/HIT'), por(10, 'Test Rained Out', 'HR', '2026-10-09T20:00:00Z', '9002'),
]
const out = (pid, o) => ({ is_final: true, revision: 1, game_pk: 9001, player_id: pid, void: false, plate_appearances: 4, at_bats: 4, hits: 0, home_runs: 0, runs: 0, rbi: 0, total_bases: 0, went_yard: false, ...o })
const outcomes = new Map([
  ['9001|1', out(1, {})], ['9001|2', out(2, { hits: 2, home_runs: 1, rbi: 2, total_bases: 5, went_yard: true })], ['9001|3', out(3, { hits: 1, total_bases: 1 })],
  ['9001|7', out(7, { void: true, plate_appearances: 0, at_bats: 0 })], ['9001|9', out(9, { hits: 1, total_bases: 1 })],
])
const { entries } = gradeNight({ date: '2026-10-08', por: rows, outcomes, games })
const mlb = mlbRows(entries, '2026-10-09')
const by = (n) => mlb.find((r) => r.name === n)
eq('MLB: only CALLED-at-lock hitters (no WATCH, no role, no late stamp)', mlb.map((r) => r.name).sort(), ['Test Did Not Play', 'Test HR Hit', 'Test HR Miss', 'Test Hit Pick', 'Test Pending', 'Test Rained Out', 'Test Two Lanes'])
eq('MLB: 0-for-4 on an HR call is MISSED', [by('Test HR Miss').result, by('Test HR Miss').line], ['miss', '0-for-4'])
eq('MLB: HR call that homered is HIT, line has HR and RBI', [by('Test HR Hit').result, by('Test HR Hit').line], ['hit', '2-for-4 · HR · 2 RBI'])
eq('MLB: a HIT pick with a single is HIT (its own bar, not a homer)', by('Test Hit Pick').result, 'hit')
eq('MLB: a voided game is DID NOT PLAY, not a miss', [by('Test Did Not Play').result, by('Test Did Not Play').line], ['void', 'did not play'])
eq('MLB: no final outcome yet is PENDING, not a miss', by('Test Pending').result, 'pending')
eq('MLB: a postponed game with no outcome is DID NOT PLAY', by('Test Rained Out').result, 'void')
eq('MLB: two lanes, one bar missed -> MISSED, the lane that missed is marked', [by('Test Two Lanes').result, by('Test Two Lanes').calledAs], ['miss', 'HR ✗ / HIT'])
eq('MLB: the date is the game\'s own (prediction_date said 10-08)', [...new Set(mlb.map((r) => r.date))], ['2026-10-09'])
eq('MLB: a different date keeps none of them', mlbRows(entries, '2026-10-08'), [])

// ── NHL (TEST rows) ──────────────────────────────────────────────────────────
const log = (o) => ({ game_id: 5001, game_date: '2026-10-09', player_id: 1, model_version: 'lamp-goal-v3', team: 'TST', opp: 'OPP', name: 'x', status: 'called', dressed: true, goals: 0, hit: false, graded_at: '2026-10-10T08:00:00Z', ...o })
const nhl = nhlRows([
  log({ player_id: 1, name: 'Test Skater Miss' }), log({ player_id: 2, name: 'Test Skater Hit', goals: 1, hit: true }),
  log({ player_id: 3, name: 'Test Scratch', dressed: false, hit: null }), log({ player_id: 4, name: 'Test Ungraded', graded_at: null, hit: null }),
  log({ player_id: 5, name: 'Test On Board', status: 'board' }), log({ player_id: 6, name: 'Test Other Version', model_version: 'lamp-goalw-v1' }),
], { shots: new Map([['5001|1', 3]]), archivedGames: new Set(['5001']), versions: ['lamp-goal-v3'] })
const nb = (n) => nhl.find((r) => r.name === n)
eq('NHL: only status called, only the locked model version', nhl.map((r) => r.name).sort(), ['Test Scratch', 'Test Skater Hit', 'Test Skater Miss', 'Test Ungraded'])
eq('NHL: 0 G with 3 shots is MISSED, line has both', [nb('Test Skater Miss').result, nb('Test Skater Miss').line], ['miss', '0 G, 3 shots'])
eq('NHL: a goal is HIT', [nb('Test Skater Hit').result, nb('Test Skater Hit').line], ['hit', '1 G, 0 shots'])
eq('NHL: not dressed is DID NOT PLAY, not a miss', nb('Test Scratch').result, 'void')
eq('NHL: not graded yet is PENDING, not a miss', nb('Test Ungraded').result, 'pending')
const noShots = nhlRows([log({ player_id: 9, name: 'Test No Archive' })], { archivedGames: new Set() })
eq('NHL: a game with no shot archive prints goals alone (no invented shots, no TOI)', noShots[0].line, '0 G')

// ── NFL (TEST rows) ──────────────────────────────────────────────────────────
const lock = (o) => ({ sport: 'nfl', game_id: 'g1', game_date: '2026-10-04', player_id: 'T1', name: 'Test Back', team: 'TST', opp: 'OPP', week: 4, status: 'called', called_by: 'TD', result: 'miss', actual: 0, graded_at: 'x', ...o })
const logs = { logs: { T1: { log: [{ s: 2026, w: 4, g_td: 0, g_car: 12, g_ruyd: 48, g_rec: 2, g_recyd: 11, g_payd: 0 }] } } }
const nfl = nflRows([lock({}), lock({ player_id: 'T2', name: 'Test Hit', result: 'hit', actual: 1 }), lock({ player_id: 'T3', name: 'Test Inactive', result: 'void' }), lock({ player_id: 'T4', name: 'Test Ungraded', result: null, graded_at: null }), lock({ player_id: 'T5', name: 'Test Board', status: 'board' }), lock({ player_id: 'T6', name: 'Test Yards Call', called_by: 'REC_YDS', result: 'miss' }), lock({ player_id: 'T7', name: 'Test Game Call', called_by: 'GAME', result: 'hit', actual: 1 })], logs)
const nf = (n) => nfl.find((r) => r.name === n)
eq('NFL: only called rows, and only calls whose bar is a touchdown (a yards call is not graded on a TD)', nfl.map((r) => r.name).sort(), ['Test Back', 'Test Game Call', 'Test Hit', 'Test Inactive', 'Test Ungraded'])
eq('NFL: no touchdown is MISSED and the line is his stored game log', [nf('Test Back').result, nf('Test Back').line], ['miss', '0 TD · 12 car, 48 rush yds · 2 rec, 11 rec yds'])
eq('NFL: void stays void, ungraded stays pending', [nf('Test Inactive').result, nf('Test Ungraded').result], ['void', 'pending'])

// ── NBA (TEST rows) ──────────────────────────────────────────────────────────
const nba = nbaRows([{ status: 'called', result: 'miss', actual: 18, game_date: '2026-10-09', player_id: 7, name: 'Test Guard', team: 'TST', opp: 'OPP', game_id: 'n1', target: 'pts' }, { status: 'board', result: 'hit', player_id: 8, name: 'x' }])
eq('NBA: called only, stored figure as the line', nba.map((r) => [r.name, r.result, r.line]), [['Test Guard', 'miss', '18 pts']])

// ── payload states ───────────────────────────────────────────────────────────
eq('state none when nothing was called', payloadOf({ sport: 'mlb', slate: '2026-10-10', rows: [] }).state, 'none')
eq('state pending when every call is ungraded', payloadOf({ sport: 'mlb', slate: 'x', rows: [{ result: 'pending' }] }).state, 'pending')
eq('state ok once any is graded', payloadOf({ sport: 'mlb', slate: 'x', rows: [{ result: 'pending' }, { result: 'miss' }] }).state, 'ok')
eq('summary counts', core.summarize(mlb), { called: 7, hit: 2, miss: 2, void: 2, pending: 1 })

// ── dates: the game's own, no wall clock ─────────────────────────────────────
eq('previousDay: latest strictly before the slate', core.previousDay(['2026-10-07', '2026-10-09', '2026-10-10'], '2026-10-10'), '2026-10-09')
eq('previousDay: none -> null', core.previousDay(['2026-10-11'], '2026-10-10'), null)
eq('weekdayOf is a calendar fact', [core.weekdayOf('2026-10-09'), core.dayWord('2026-10-09')], ['Fri', 'Fri Oct 9'])

// ── the filter ───────────────────────────────────────────────────────────────
const m = { miss: { result: 'miss' }, hit: { result: 'hit' }, void: { result: 'void' }, pending: { result: 'pending' } }
eq('default (all) passes every called player, whatever he did', Object.values(m).map((r) => core.passes('all', r)), [true, true, true, true])
eq('a player not called last night never passes an active filter', [core.passes('all', null), core.passes('miss', undefined)], [false, false])
eq('missed passes only a miss (pending and did-not-play are not misses)', Object.values(m).map((r) => core.passes('miss', r)), [true, false, false, false])
eq('hit / didn\'t play narrow the same way', [core.passes('hit', m.hit), core.passes('hit', m.miss), core.passes('void', m.void), core.passes('void', m.pending)], [true, false, true, false])
eq('filter off passes everyone', core.passes('', null), true)
eq('modeOf rejects junk', ['all', 'miss', 'hit', 'void', 'x', '', null].map(core.modeOf), ['all', 'miss', 'hit', 'void', '', '', ''])

// ── the address: #cln= reads back through lib/filterHash.js, other keys untouched ──
globalThis.window = { location: { hash: '#sport=mlb&tab=fullboard&fteam=NYY&cln=miss' } }
const { readHashKey, FILTER_KEYS } = await import('../lib/filterHash.js')
eq('#cln=miss reopens as missed', core.modeOf(readHashKey(core.FILTER_KEY)), 'miss')
eq('the team filter in the same address is untouched', readHashKey('fteam'), 'NYY')
yes('cln is its own key (no clash with the existing filter keys or tab / sport)', !FILTER_KEYS.includes(core.FILTER_KEY) && !['sport', 'tab', 'game', 'team', 'player', 'm'].includes(core.FILTER_KEY))
globalThis.window.location.hash = '#sport=nhl&tab=board'
eq('no #cln= means off', core.modeOf(readHashKey(core.FILTER_KEY)), '')

// ── the words ────────────────────────────────────────────────────────────────
eq('the status word is callStatus\'s', core.CALLED_WORD, STATUS_WORD.called)
yes('every adapter row carries it', [...mlb, ...nhl, ...nfl, ...nba].every((r) => r.called === STATUS_WORD.called))
eq('yesterday is labelled as yesterday', core.yesterdayLabel(by('Test HR Miss')), 'Called Fri · missed')
eq('cell text', core.cellText(by('Test HR Miss')), 'Called Fri · missed · 0-for-4')
eq('cell text for did-not-play has no stat line', core.cellText(by('Test Did Not Play')), 'Called Fri · did not play')
eq('empty states name the date', [core.emptyNote({ date: '2026-10-09', state: 'ok', mode: 'miss' }), core.emptyNote({ date: '2026-10-09', state: 'pending' }), core.emptyNote({ date: null, state: 'none' })],
  ['No calls from Fri Oct 9 missed.', 'Nothing graded yet for Fri Oct 9.', 'No earlier slate with stored calls yet.'])
eq('summary line', core.summaryLine('2026-10-09', core.summarize(mlb)), '7 called Fri Oct 9 · 2 hit · 2 missed · 2 did not play · 1 pending')
// LINT: neutral wording. No due / owed / bounce-back / regression / probability anywhere a visitor reads it.
const BAD = /\b(due|owed|owe|bounce|bounces|bounce-back|rebound|regress\w*|overdue|likely|unlikely|odds|probab\w*|chance|expected|should|will)\b|%/i
const said = []
for (const r of [...mlb, ...nhl, ...nfl, ...nba]) said.push(core.cellText(r), core.yesterdayLabel(r), r.line, r.calledAs || '', r.bar || '')
said.push(...Object.values(core.RESULT_WORD), ...Object.values(core.RESULT_LOWER), core.SECTION_TITLE, ...core.MODES.map((x) => x.label))
for (const st of ['none', 'pending', 'ok']) for (const mode of ['all', 'miss', 'hit', 'void']) said.push(core.emptyNote({ date: '2026-10-09', state: st, mode }))
eq('no due / owed / bounce-back / probability in anything the code says', said.filter((t) => BAD.test(t)), [])
// and in every string literal of the files that draw it
const files = ['lib/calledLast/core.js', 'lib/calledLast/adapters.js', 'lib/calledLast/read.js', 'lib/calledLast/useCalledLast.js', 'components/CalledLastNight.js', 'app/api/called-last/route.js']
const literals = []
for (const f of files) {
  const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  for (const mm of src.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) literals.push([f, mm[1] ?? mm[2] ?? mm[3]])
}
eq('no due / owed / bounce-back / probability in any visible string of those files', literals.filter(([f, t]) => /\s/.test(t) && /\b(due|owed|bounce|bounce-back|rebound|regress\w*|overdue|probab\w*|chance)\b/i.test(t)), [])
yes('the code never types the status words itself (CALLED comes from callStatus)', literals.every(([, t]) => !/^(CALLED|ON THE BOARD|NOT ON THE BOARD)$/.test(t)))

// ── the readers, against a fake database ─────────────────────────────────────
class Q {
  constructor(table, data) { this.t = table; this.d = data; this.f = []; this.o = []; this.n = null }
  select() { return this }
  in(c, v) { this.f.push((r) => v.includes(r[c])); return this }
  eq(c, v) { this.f.push((r) => r[c] === v); return this }
  neq(c, v) { this.f.push((r) => r[c] !== v); return this }
  lt(c, v) { this.f.push((r) => r[c] < v); return this }
  order(c, { ascending = true } = {}) { this.o.push([c, ascending]); return this }
  limit(n) { this.n = n; return this }
  then(res, rej) {
    let rows = this.d.filter((r) => this.f.every((f) => f(r)))
    for (const [c, asc] of [...this.o].reverse()) rows = [...rows].sort((a, b) => (a[c] < b[c] ? -1 : a[c] > b[c] ? 1 : 0) * (asc ? 1 : -1))
    if (this.n) rows = rows.slice(0, this.n)
    return Promise.resolve({ data: rows, error: null }).then(res, rej)
  }
}
const fake = (tables) => ({ from: (t) => new Q(t, tables[t] || []) })
const goalLog = [
  log({ game_date: '2026-10-08', player_id: 1, name: 'Older Night', game_type: 2 }),
  log({ game_date: '2026-10-09', player_id: 2, name: 'Test Skater Miss', game_type: 2 }),
  log({ game_date: '2026-10-09', player_id: 3, name: 'Preseason', game_type: 1 }),
  log({ game_date: '2026-10-10', player_id: 4, name: 'Tonight', game_type: 2, graded_at: null }),
]
const nhlOut = await readNhl(fake({ lamp_goal_log: goalLog, lamp_shots: [{ game_id: 5001, player_id: 2, result: 'sog' }, { game_id: 5001, player_id: 2, result: 'goal' }, { game_id: 5001, player_id: 9, result: 'block' }] }), '2026-10-10')
eq('readNhl: the previous slate is the latest day before the slate that has calls (not tonight, not preseason)', [nhlOut.date, nhlOut.rows.map((r) => r.name)], ['2026-10-09', ['Test Skater Miss']])
eq('readNhl: shots on goal counted from the archive (a block is not a shot on goal; a goal is)', nhlOut.rows[0].line, '0 G, 2 shots')
eq('readNhl: nothing earlier -> an empty, honest payload', (await readNhl(fake({ lamp_goal_log: goalLog }), '2026-10-08')).state, 'none')
const nflOut = await readNfl(fake({ board_lock: [lock({ week: 3, game_date: '2026-09-27', player_id: 'A', name: 'Test Week3' }), lock({ week: 4, game_date: '2026-10-04', name: 'Test Week4' }), lock({ week: 5, game_date: '2026-10-11', name: 'Test This Week' })] }), '2026-10-11', 5)
eq('readNfl: the previous slate is the previous WEEK (week 4), not this one', [nflOut.rows.map((r) => r.name), nflOut.date], [['Test Week4'], '2026-10-04'])
const nbaOut = await readNba(fake({ buckets_log: [] }), '2026-10-10').catch((e) => ({ err: String(e.message) }))
yes('readNba runs against the fake (no rows -> none, or a clear error)', nbaOut.state === 'none' || nbaOut.err)

// ── the route: bad requests, and BUCKETS is a 404 until BUCKETS_PUBLIC=on ────
delete process.env.BUCKETS_PUBLIC
const { GET } = await import('../app/api/called-last/route.js')
const call = (qs) => GET(new Request(`http://x/api/called-last?${qs}`))
eq('route: unknown sport -> 400', (await call('sport=zzz&date=2026-10-10')).status, 400)
eq('route: bad date -> 400', (await call('sport=mlb&date=tonight')).status, 400)
eq('route: nba is a 404 while BUCKETS is hidden', (await call('sport=nba&date=2026-10-10')).status, 404)

console.log(fail ? `\n${fail} FAILED` : '\nall green')
process.exit(fail ? 1 : 0)
