#!/usr/bin/env node
// THE POSITION FILTER (2026-10-10). TEST DATA only: made-up players, labelled as such.
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-position-filter.mjs
// Proves: the pills are derived from the rows on the page (a position nobody has is never offered; a position the
// spec has never heard of is, in the data's own word); each sport's own words (NHL L/R -> LW/RW and the F group,
// NBA's generic G / F inside the G and F groups, MLB's IF / OF, NFL depth roles); counts are what tapping a pill
// alone would show under the other filters; multi-select is "any of them"; filtering never renumbers (ranks come from
// the whole pool); it combines with the other filters; the honest empty sentence; the pos= address round-trip through
// lib/filterHash.js with every other key untouched; and that every Rankings page is wired to the one shared control.
import { readFileSync } from 'node:fs'
import {
  POSITIONS, canonPos, keysFor, positionOptions, rowMatches, parsePos, serializePos, emptySentence, overallRanks, specOf,
} from '../lib/positions.js'
import { roleKeys, ROLE_PILLS } from '../lib/nfl/roles.js'

let fail = 0
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); fail += !ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)} want ${JSON.stringify(want)}`}`) }
const yes = (name, v) => eq(name, Boolean(v), true)

// ── the registry is the site's sport list ──────────────────────────────────
const R = await import('../lib/routes.js')
eq('POSITIONS has exactly the registry sports (lib/routes.js ALL_SPORT_KEYS)', Object.keys(POSITIONS).sort(), [...R.ALL_SPORT_KEYS].sort())
eq('an unknown sport answers MOONSHOT, never throws', specOf('xfl'), POSITIONS.mlb)

const keys = (o) => o.map((x) => x.key)
const counts = (o) => Object.fromEntries(o.map((x) => [x.key, x.count]))

// ── MLB (TEST pool): positions come from the data; none is typed in ─────────
const mlbPool = [
  { id: 1, pos: 'SS' }, { id: 2, pos: 'SS' }, { id: 3, pos: 'C' }, { id: 4, pos: '1B' }, { id: 5, pos: 'LF' }, { id: 6, pos: 'CF' },
  { id: 7, pos: 'DH' }, { id: 8, pos: 'TWP' }, { id: 9, pos: '' }, { id: 10, pos: null },
]
const mlbOpts = positionOptions('mlb', mlbPool, { posOf: (r) => r.pos })
eq('MLB: only positions the pool has, in baseball order, then the groups', keys(mlbOpts), ['C', '1B', 'SS', 'LF', 'CF', 'DH', 'TWP', 'IF', 'OF'])
yes('MLB: no 2B / 3B / RF pill when nobody plays them', !keys(mlbOpts).some((k) => ['2B', '3B', 'RF'].includes(k)))
eq('MLB: counts (a man with no position is on no pill)', counts(mlbOpts), { C: 1, '1B': 1, SS: 2, LF: 1, CF: 1, DH: 1, TWP: 1, IF: 3, OF: 2 })
eq('MLB: the infield group holds 1B and SS', mlbPool.filter((r) => rowMatches('mlb', r, ['IF'], { posOf: (x) => x.pos })).map((r) => r.id), [1, 2, 4])
const onlyOneInfielder = positionOptions('mlb', [{ pos: 'SS' }, { pos: 'SS' }], { posOf: (r) => r.pos })
eq('MLB: a group of one member is not offered (it would be the same pill twice)', keys(onlyOneInfielder), ['SS'])
const genericOf = positionOptions('mlb', [{ pos: 'OF' }, { pos: 'C' }], { posOf: (r) => r.pos })
eq('MLB: the league’s generic OF is its own word and is offered', keys(genericOf), ['C', 'OF'])
eq('an unknown word from the data is offered after the known ones', keys(positionOptions('nfl', [{ p: 'WR' }, { p: 'EDGE' }, { p: 'QB' }], { posOf: (r) => r.p })), ['QB', 'WR', 'EDGE'])

// ── NHL (TEST): L and R are the data's words; LW and RW are the labels ──────
eq('NHL: L -> LW, R -> RW, lowercase and spaces tolerated', ['L', 'r', ' c ', 'D'].map((s) => canonPos('nhl', s)), ['LW', 'RW', 'C', 'D'])
const nhlPool = [{ pos: 'C' }, { pos: 'C' }, { pos: 'L' }, { pos: 'R' }, { pos: 'D' }, { pos: 'D' }, { pos: 'D' }]
const nhlOpts = positionOptions('nhl', nhlPool, { posOf: (r) => r.pos })
eq('NHL: C LW RW D, then the Forwards group (no G: no goalie on the board)', keys(nhlOpts), ['C', 'LW', 'RW', 'D', 'F'])
eq('NHL: F is C + LW + RW', counts(nhlOpts).F, 4)
eq('NHL: D is three men', counts(nhlOpts).D, 3)

// ── NBA (TEST): ESPN's generic G and F live inside the G and F groups ───────
const nbaPool = [{ pos: 'PG' }, { pos: 'SG' }, { pos: 'G' }, { pos: 'SF' }, { pos: 'PF' }, { pos: 'F' }, { pos: 'C' }]
const nbaOpts = positionOptions('nba', nbaPool, { posOf: (r) => r.pos })
eq('NBA: PG SG G SF PF F C (the generic G and F are one pill each, never doubled)', keys(nbaOpts), ['PG', 'SG', 'G', 'SF', 'PF', 'F', 'C'])
eq('NBA: G holds PG, SG and the generic G', counts(nbaOpts).G, 3)
eq('NBA: F holds SF, PF and the generic F', counts(nbaOpts).F, 3)
eq('NBA: the data may carry only the generic words: then G F C', keys(positionOptions('nba', [{ pos: 'G' }, { pos: 'F' }, { pos: 'C' }, { pos: 'G' }], { posOf: (r) => r.pos })), ['G', 'F', 'C'])
eq('keysFor: a PG answers to PG and G', keysFor('nba', 'PG'), ['PG', 'G'])

// ── NFL (TEST): positions, and depth roles in the same row ──────────────────
const nfl = (position, role = null, slot = null) => ({ position, role, role_slot: slot })
const nflPool = [nfl('QB', 'QB'), nfl('RB', 'RB1'), nfl('RB', 'RB2'), nfl('WR', 'WR1', true), nfl('WR', 'WR2', false), nfl('TE', 'TE1'), nfl('DEF'), nfl('RB')]
const nflOpts = positionOptions('nfl', nflPool, { posOf: (r) => r.position, extraOf: roleKeys, extraOrder: ROLE_PILLS })
eq('NFL: positions first, then the depth roles that exist (no WR3, no TE2 in this pool)', keys(nflOpts), ['QB', 'RB', 'WR', 'TE', 'DEF', 'QB', 'RB1', 'RB2', 'WR1', 'WR2', 'TE1', 'SLOT'].filter((k, i, a) => a.indexOf(k) === i))
yes('NFL: a role pill is a role, a position pill is a position', nflOpts.find((o) => o.key === 'WR1').kind === 'role' && nflOpts.find((o) => o.key === 'WR').kind === 'pos')
eq('NFL: SLOT only where a published share says so', counts(nflOpts).SLOT, 1)
eq('NFL: RB1 + WR picks any of them (RB1, and every WR)', nflPool.filter((r) => rowMatches('nfl', r, ['RB1', 'WR'], { posOf: (x) => x.position, extraOf: roleKeys })).map((r) => `${r.position}/${r.role}`), ['RB/RB1', 'WR/WR1', 'WR/WR2'])

// ── counts are what the pill alone would show under the OTHER filters ───────
const pool = [
  { id: 'a', pos: 'RB', team: 'AAA' }, { id: 'b', pos: 'RB', team: 'BBB' }, { id: 'c', pos: 'WR', team: 'AAA' }, { id: 'd', pos: 'WR', team: 'AAA' }, { id: 'e', pos: 'TE', team: 'BBB' },
]
const otherFiltered = pool.filter((r) => r.team === 'AAA')   // the team filter
const withTeam = positionOptions('nfl', pool, { posOf: (r) => r.pos, countRows: otherFiltered })
eq('under a team filter the pills count that team; every position stays offered', counts(withTeam), { RB: 1, WR: 2, TE: 0 })
eq('...and selecting WR then shows exactly that count', otherFiltered.filter((r) => rowMatches('nfl', r, ['WR'], { posOf: (x) => x.pos })).length, 2)
eq('multi-select is any-of', pool.filter((r) => rowMatches('nfl', r, ['RB', 'TE'], { posOf: (x) => x.pos })).map((r) => r.id), ['a', 'b', 'e'])
eq('an empty selection clears everyone', pool.every((r) => rowMatches('nfl', r, [], { posOf: (x) => x.pos })), true)
const held = positionOptions('nfl', pool, { posOf: (r) => r.pos, selected: ['QB'] })
yes('a held position the page no longer has stays offered, with 0, so it can be cleared', held.some((o) => o.key === 'QB' && o.count === 0))

// ── FILTERING NEVER RENUMBERS ───────────────────────────────────────────────
const board = [
  { id: 'p1', pos: 'WR', s: 91 }, { id: 'p2', pos: 'RB', s: 88 }, { id: 'p3', pos: 'WR', s: 85 }, { id: 'p4', pos: 'TE', s: 80 }, { id: 'p5', pos: 'RB', s: 79 },
  { id: 'p6', pos: 'RB', s: 70 }, { id: 'p7', pos: 'QB', s: 60 },
]
const overall = overallRanks(board, (r) => r.id, (r) => r.s)
const rbOnly = board.filter((r) => rowMatches('nfl', r, ['RB'], { posOf: (x) => x.pos }))
eq('the RB rows keep their board places (#2, #5, #6), not 1-2-3', rbOnly.map((r) => overall.get(r.id)), [2, 5, 6])
eq('ranks are the same with no filter', board.map((r) => overall.get(r.id)), [1, 2, 3, 4, 5, 6, 7])
const ties = overallRanks([{ id: 'x', s: 5 }, { id: 'y', s: 5 }, { id: 'z', s: 9 }], (r) => r.id, (r) => r.s)
eq('equal scores keep the pool’s own order (a stable sort), z first', [ties.get('z'), ties.get('x'), ties.get('y')], [1, 2, 3])
const subTies = [{ id: 'y', s: 5 }, { id: 'x', s: 5 }].sort((a, b) => b.s - a.s).map((r) => ties.get(r.id))
eq('a filtered subset sorted the same way keeps the same numbers', subTies, [3, 2])

// ── combines with the other filters; the honest empty state ─────────────────
const teamAndPos = board.map((r, i) => ({ ...r, team: i % 2 ? 'BBB' : 'AAA' })).filter((r) => r.team === 'AAA').filter((r) => rowMatches('nfl', r, ['RB'], { posOf: (x) => x.pos }))
eq('team AAA + RB leaves the RB on team AAA only, with his overall rank', teamAndPos.map((r) => `${r.id}#${overall.get(r.id)}`), ['p5#5'])
const none = board.filter((r) => rowMatches('nfl', r, ['K'], { posOf: (x) => x.pos }))
eq('a position nobody has leaves nobody (the page then says so)', none.length, 0)
eq('the empty sentence names the position', emptySentence(['RB'], 'player'), 'No RB on the board with these filters.')
eq('the empty sentence names several', emptySentence(['RB', 'WR1']), 'No RB, WR1 on the board with these filters.')
eq('with no position the sentence still reads', emptySentence([], 'skater'), 'No skaters on the board with these filters.')

// ── the address: pos= round-trips; other keys untouched ─────────────────────
eq('parse', parsePos('RB,WR1'), ['RB', 'WR1'])
eq('serialize', serializePos(['RB', 'WR1']), 'RB,WR1')
eq('round trip', parsePos(serializePos(['PG', 'G', 'SF'])), ['PG', 'G', 'SF'])
eq('hand-edited: lowercase, spaces, duplicates and junk are cleaned', parsePos(' rb , RB ,,<script>,wr'), ['RB', 'WR'])
eq('nothing in the address is no selection', parsePos(null), [])
eq('a runaway list is capped', parsePos(Array.from({ length: 40 }, (_, i) => `P${i}`).join(',')).length, 12)
globalThis.window = { location: { hash: '#sport=nfl&tab=research&m=TD&fteam=KC&pos=RB,WR1' } }
const { readHashKey, FILTER_KEYS } = await import('../lib/filterHash.js')
eq('#pos=RB,WR1 reopens as RB + WR1', parsePos(readHashKey('pos')), ['RB', 'WR1'])
eq('the team filter and the tab in the same address are untouched', [readHashKey('fteam'), readHashKey('tab')], ['KC', 'research'])
yes('pos is its own key (no clash with the board filter keys, tab, sport, game, team, player, m, p, view)', !FILTER_KEYS.includes('pos') && !['sport', 'tab', 'game', 'team', 'player', 'm', 'p', 'view', 'date', 'day', 'week'].includes('pos'))
globalThis.window.location.hash = '#sport=nfl&tab=research'
eq('no pos= means no filter', parsePos(readHashKey('pos')), [])

// ── wiring: every Rankings page draws the one shared control and keeps the address ─────
const src = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8')
const wired = {
  'MOONSHOT Rankings (filter state)': ['components/BoardFilters.js', 'usePositionFilter(\'mlb\''],
  'MOONSHOT Rankings (page)': ['components/tabs/HitsHRR.js', 'positions: rankings'],
  'TUDDY Anytime TD': ['components/nfl/tabs/Touchdowns.js', 'usePositionFilter(\'nfl\''],
  'TUDDY every other market': ['components/nfl/tabs/Boards.js', 'usePositionFilter(\'nfl\''],
  'LAMP goal / shots / points / assists': ['components/lamp/tabs/Board.js', 'usePositionFilter(\'nhl\''],
  'BUCKETS boards and ALL MARKETS': ['components/buckets/tabs/Board.js', 'usePositionFilter(\'nba\''],
}
for (const [name, [file, needle]] of Object.entries(wired)) yes(`${name} is wired (${file})`, src(file).includes(needle))
yes('the pills are drawn by the shared drawer, inline on a desktop and in the sheet on a phone', /positions\b/.test(src('components/FiltersDrawer.js')) && src('components/FiltersDrawer.js').includes('PositionRow'))
yes('MOONSHOT’s address writer carries pos= across a tab move on Rankings', src('components/Dashboard.js').includes("'cln', 'pos'"))
yes('a sport switch drops pos= (it is the other sport’s words)', src('lib/sport.js').includes("h.delete('pos')"))
yes('the shells drop pos= when you leave Rankings', src('lib/useShellRoute.js').includes('pos: new Set') && src('components/nfl/NflDashboard.js').includes("pos: new Set(['research'])"))
yes('no sport ternary in the new files', !/sport === '(mlb|nfl|nhl|nba)'/.test(src('lib/positions.js') + src('lib/usePositionFilter.js')))

console.log(fail ? `\n${fail} FAILED` : '\nall position-filter checks passed')
process.exit(fail ? 1 : 0)
