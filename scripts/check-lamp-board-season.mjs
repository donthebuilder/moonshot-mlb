#!/usr/bin/env node
// LAMP board season line + form (2026-10-06). TEST DATA only: made-up skaters and games.
//   node --import ./scripts/_esm-resolve.mjs scripts/check-lamp-board-season.mjs
import { sznOf, formFrom, joinLines } from '../lib/nhl/seasonLine.js'
import { nhlBoardRow, withNhlFullSet } from '../lib/nhl/boardColumns.js'
let fail = 0
const eq = (name, got, want) => { const ok = JSON.stringify(got) === JSON.stringify(want); fail += !ok; console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`}`) }

// TEST season lines. 902 is a traded man: ONE entry holds both clubs' games (clubs 'AAA,BBB').
const lines = new Map([
  [901, { id: 901, gp: 10, g: 4, a: 3, pts: 7, shots: 30, shPct: 0.1333, toi: 1080, clubs: 'AAA' }],
  [902, { id: 902, gp: 12, g: 5, a: 5, pts: 10, shots: 36, shPct: 0.1389, toi: 1200, clubs: 'AAA,BBB' }],
  [903, { id: 903, gp: 0, g: 0, a: 0, pts: 0, shots: 0, shPct: null, toi: null, clubs: 'AAA' }],
])
eq('szn: totals, G/60 = g*3600/(gp*toi)', sznOf(lines.get(901)), { gp: 10, g: 4, a: 3, pts: 7, s: 30, shPct: 13.3, g60: 1.33 })
eq('szn: traded player carries both clubs in one line', sznOf(lines.get(902)).gp, 12)
eq('szn: no games = null, not zeros', sznOf(lines.get(903)), null)
eq('szn: unknown player = null', sznOf(undefined), null)

// per-game rows, TEST. The board is 2099-01-10; 901 also has a row ON the board date and after it (must never count).
const g = (playerId, gameDate, goals, gameId) => ({ playerId, gameDate, goals, gameId })
const rows = [
  g(901, '2099-01-09', 0, 9), g(901, '2099-01-07', 0, 8), g(901, '2099-01-05', 1, 7), g(901, '2099-01-03', 2, 6),
  g(901, '2099-01-01', 0, 5), g(901, '2098-12-30', 0, 4),
  g(901, '2099-01-10', 3, 99), g(901, '2099-01-11', 3, 100),            // the game on the board, and a later one
  g(902, '2099-01-09', 1, 9), g(902, '2099-01-08', 0, 8),               // two clubs, same player id
  g(904, '2099-01-09', 0, 9), g(904, '2099-01-08', 0, 8),               // no goal in the window
]
const form = formFrom(rows, '2099-01-10')
eq('form: drought = games since last goal, board-date game excluded', form.get(901).drought, 2)
eq('form: L5 counts the five games before the date only', [form.get(901).l5, form.get(901).gp5], [3, 5])
eq('form: L10 holds the games it has (6) and never the 3-goal board-date game', [form.get(901).l10, form.get(901).gp10], [3, 6])
eq('form: a goal in his last game = drought 0', form.get(902).drought, 0)
eq('form: no goal in the window = N+ (lower bound)', [form.get(904).drought, form.get(904).droughtPlus], [2, true])
eq('form: unknown player = absent', form.has(905), false)
const dayOf = formFrom(rows, '2099-01-11')
eq('form: asked for the NEXT day, the 01-10 game counts; the 01-11 one still does not', dayOf.get(901).drought, 0)

// the join: a game that has started (live or final) gets NO season line; form needs no such guard
const pre = joinLines(901, { lines, form, started: false })
const done = joinLines(901, { lines, form, started: true })
eq('join: pre-game carries the season line and the form', [pre.szn?.g, pre.form?.drought], [4, 2])
eq('join: a final/live game blanks the season line (as-of-now numbers would include it)', done.szn, null)
eq('join: form survives on a final night (it is dated, not as-of-now)', done.form?.drought, 2)
eq('join: traded player total on the board', joinLines(902, { lines, form, started: false }).szn.pts, 10)
// goalless drought becomes exact when the window holds all of his season games (904: 2 window games, 2 season games)
const lines904 = new Map([[904, { id: 904, gp: 2, g: 0, a: 0, pts: 0, shots: 3, shPct: 0, toi: 900 }]])
eq('join: window holds his whole season -> drought exact', joinLines(904, { lines: lines904, form, started: false }).form.droughtPlus, false)
const lines904b = new Map([[904, { id: 904, gp: 7, g: 0, a: 0, pts: 0, shots: 9, shPct: 0, toi: 900 }]])
eq('join: window short of his season -> stays N+', joinLines(904, { lines: lines904b, form, started: false }).form.droughtPlus, true)
eq('join: no line, no form = both null, never zeros', joinLines(999, { lines, form, started: false }), { szn: null, form: null })

// the columns: flattened off the board row, in their groups, hidden when no row has them
const flat = nhlBoardRow({ szn: pre.szn, form: pre.form })
eq('flat: season line + form keys', [flat.szn_g, flat.szn_a, flat.szn_pts, flat.szn_gp, flat.szn_s, flat.szn_shpct, flat.szn_g60, flat.drought, flat.l5g, flat.l10g], [4, 3, 7, 10, 30, 13.3, 1.33, 2, 3, 3])
const full = withNhlFullSet([{ _row: { szn: pre.szn, form: pre.form } }], [{ key: 'name' }])
eq('columns: Season line then Form groups', [...new Set(full.columns.map((c) => c.group?.label).filter(Boolean))], ['Season line', 'Form'])
eq('columns: every new one has a group', full.columns.filter((c) => c.key !== 'name').every((c) => c.group), true)
const fin = withNhlFullSet([{ _row: { szn: null, form: done.form } }], [{ key: 'name' }])
eq('columns: final night shows Form only (no Szn columns)', fin.columns.filter((c) => c.key !== 'name').map((c) => c.group.label).every((l) => l === 'Form'), true)
const plus = full.columns.find((c) => c.key === 'drought').fmt
eq('drought prints N+ when a lower bound', [plus(5, { drought_plus: true }), plus(5, {}), plus(null, {})], ['5+', '5', '—'])
console.log(fail ? `\n${fail} FAILED` : '\nall green')
process.exit(fail ? 1 : 0)
