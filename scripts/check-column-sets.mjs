// The column-set switch (Wave 4): Short list / What I read / All, `cols=` in the address (lib/columnViews.js).
//   node --no-warnings --import ./scripts/_esm-resolve.mjs scripts/check-column-sets.mjs
// All data below is TEST data, labelled as such; nothing here is a real stat.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const { COLUMN_SETS, columnSetKey, applyColumnSet, tagColumnSets, isIdentityColumn } = await import('../lib/columnViews.js')
const { nflBoardColumns } = await import('../lib/nfl/boardColumns.js')
const { nhlFullColumns } = await import('../lib/nhl/boardColumns.js')
let bad = 0
const fail = (m) => { console.log(`FAIL ${m}`); bad++ }
const keys = (cs) => cs.map((c) => c.key)
const subset = (a, b) => keys(a).every((k) => keys(b).includes(k))

// 1. the three sets and the address value
if (COLUMN_SETS.map((s) => s.key).join() !== 'lean,read,all') fail('COLUMN_SETS must be lean, read, all in that order')
if (COLUMN_SETS.map((s) => s.label).join() !== 'Short list,What I read,All') fail('labels must be Short list / What I read / All')
for (const [v, want] of [['lean', 'lean'], ['read', 'read'], ['all', 'all'], ['', null], ['classic', null], [null, null], ['LEAN', null]]) if (columnSetKey(v) !== want) fail(`columnSetKey(${JSON.stringify(v)}) !== ${want}`)

// 2. short ⊂ read ⊂ all, on TEST columns, on the NFL extras, on the NHL extras
const TEST = [
  { key: 'rank', label: '#', group: 'Player' }, { key: 'name', label: 'Player', sticky: true, group: 'Player' },
  { key: 'score', label: 'Score', cset: 'lean', group: 'Call' }, { key: 'why', label: 'Why', cset: 'lean', group: 'Call' },
  { key: 'status', label: 'Status', statusCol: true, group: 'Call' },
  { key: 'a', label: 'A (TEST)', cset: 'read', group: 'Read' }, { key: 'b', label: 'B (TEST)', group: 'Rest' }, { key: 'c', label: 'C (TEST)', group: 'Rest' },
]
const L = applyColumnSet(TEST, 'lean'), R = applyColumnSet(TEST, 'read'), A = applyColumnSet(TEST, 'all')
if (!(subset(L, R) && subset(R, A))) fail('short is not a subset of read, or read of all (TEST columns)')
if (keys(A).join() !== keys(TEST).join()) fail('All must return every column, in order')
if (keys(L).join() !== 'rank,name,score,why,status') fail(`short list (TEST) = ${keys(L).join()}`)
if (keys(R).join() !== 'rank,name,score,why,status,a') fail(`what I read (TEST) = ${keys(R).join()}`)
if (!(L.length < R.length && R.length < A.length)) fail('the three sets must differ in size on a table that has all three tiers')
if (applyColumnSet(TEST, null) !== TEST || applyColumnSet(TEST, 'all') !== TEST) fail('no set / all must return the input untouched')
if (!isIdentityColumn({ key: 'x', sticky: true }) || isIdentityColumn({ key: 'x' })) fail('identity columns: sticky yes, plain no')
const tagged = tagColumnSets([{ key: 'p' }, { key: 'q', cset: 'read' }, { key: 'r' }], { lean: ['p', 'q'], read: ['r'] })
if (tagged.map((c) => c.cset).join() !== 'lean,read,read') fail('tagColumnSets keeps an existing tag and tags the rest')

const nflRows = [{ sc_TD: 70, sc_REC: 60, st_TGT: 5, st_xTD: 0.4, season_td: 3, since_td: 2 }]
const nfl = nflBoardColumns(nflRows)
const nhl = nhlFullColumns([{ p_spg: 50, p_gpg: 40, p_toi: 60, gp: 8, drought: 2, l5g: 1, szn_g: 3, opp_ga: 3.1 }], [])
for (const [name, cols] of [['NFL extras', nfl], ['NHL extras', nhl]]) {
  const l = applyColumnSet(cols, 'lean'), r = applyColumnSet(cols, 'read'), a = applyColumnSet(cols, 'all')
  if (!(subset(l, r) && subset(r, a))) fail(`${name}: short not ⊂ read ⊂ all`)
  if (!(r.length < a.length)) fail(`${name}: What I read must be narrower than All (has ${r.length} of ${a.length})`)
  if (cols.some((c) => !c.group)) fail(`${name}: a column has no group: ${cols.filter((c) => !c.group).map((c) => c.key)}`)
}

// 3. the source: every cset value is lean|read; every opted-in board passes `sets` and the drawer passes columnSet
const files = []
const walk = (d) => { for (const n of readdirSync(d)) { if (['node_modules', '.next', 'ARCHIVE', '.git'].includes(n)) continue; const p = join(d, n); statSync(p).isDirectory() ? walk(p) : /\.js$/.test(n) && files.push(p) } }
for (const d of ['components', 'lib', 'app']) walk(d)
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  for (const m of src.matchAll(/\bcset:\s*(?:'([^']*)'|"([^"]*)")/g)) { const v = m[1] ?? m[2]; if (v !== 'lean' && v !== 'read') fail(`${f}: cset '${v}' (lean or read only)`) }
}
const has = (f, re) => re.test(readFileSync(f, 'utf8'))
for (const [f, re, what] of [
  ['components/nfl/NflBoardExtras.js', /<NflTable sets\b/, 'TUDDY board table opts in'],
  ['components/nfl/NflBoardFilters.js', /columnSet=\{/, 'TUDDY filters sheet shows the switch'],
  ['components/lamp/tabs/Board.js', /<LampTable sets\b/, 'LAMP all-games table opts in'],
  ['components/lamp/tabs/Board.js', /columnSet:/, 'LAMP filters sheet shows the switch'],
  ['components/buckets/tabs/Board.js', /<BucketsTable sets\b/, 'BUCKETS board table opts in'],
  ['components/buckets/tabs/Board.js', /columnSet:/, 'BUCKETS filters sheet shows the switch'],
  ['components/buckets/tabs/FullBoard.js', /<BucketsTable sets\b/, 'BUCKETS all-markets table opts in'],
  ['components/FiltersDrawer.js', /columnSet &&/, 'the drawer draws the switch only when asked (MOONSHOT passes none)'],
  ['components/ColumnSetSwitch.js', /minHeight: 44/, 'the pills are 44px tall'],
  ['lib/useColumnSet.js', /try \{ window\.localStorage/, 'memory is read and written in try/catch'],
  ['lib/useColumnSet.js', /h\.set\('cols'/, 'the choice is written to cols= in the address'],
]) if (!has(f, re)) fail(`${what} (${f})`)

// 4. the classic skin is gone and ?skin= is just ignored
const dense = readFileSync('components/DenseTable.js', 'utf8')
if (/skin\s*===|readSkin|SKIN_KEY|dash_table_skin|skinProp/.test(dense + readFileSync('components/table/v2.js', 'utf8'))) fail('the classic skin / readSkin / dash_table_skin are still referenced')
if (dense.split('\n').length > 600) fail('DenseTable.js grew back past 600 lines (it was 963 with the classic skin)')

console.log(bad ? `column sets: ${bad} problem(s)` : 'column sets: OK')
process.exit(bad ? 1 : 0)
