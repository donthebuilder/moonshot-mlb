// CHAMPIONSHIP ODDS CHECK (2026-10-13). The panel (components/PennantRace.js + ChampionshipFold.js) reads one file per
// sport (contract: lib/championship.js header; bot spec: AUDITS-TO-READ/BOT-TASK-CHAMPIONSHIP-ODDS.md).
//   node scripts/check-championship.mjs                 the invariants below; exit 1 on any FAIL
//   node scripts/check-championship.mjs --write <dir>   also writes TEST fixtures to <dir>/current/*.json, to look at the
//                                                       panel in a local build (NEXT_PUBLIC_DATA_BASE=http://localhost:PORT)
//
// THE FIXTURES BELOW ARE TEST DATA. They are invented on purpose, every method line starts "TEST FIXTURE", and they
// exist only in this script: no component, route or lib file holds a team's odds. Production shows nothing until the
// bot publishes.
await import('./_esm-resolve.mjs')
const fs = await import('node:fs')
const path = await import('node:path')
const R = await import('../lib/routes.js')
const Ch = await import('../lib/championship.js')
const DS = await import('../lib/dataSource.js')

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8')
let bad = 0
const fail = (m) => { bad++; console.log(`FAIL ${m}`) }
const ok = (c, m) => { if (!c) fail(m) }

// ── TEST fixtures ───────────────────────────────────────────────────────────
const ABBR = {
  mlb: ['LAD', 'NYY', 'PHI', 'SEA', 'HOU', 'MIL', 'BAL', 'CLE', 'ATL', 'SD', 'TOR', 'DET', 'BOS', 'CHC', 'TB', 'STL'],
  nfl: ['KC', 'BUF', 'PHI', 'DET', 'BAL', 'SF', 'DAL', 'HOU', 'MIA', 'LAR', 'GB', 'CIN', 'SEA', 'PIT', 'MIN', 'LAC'],
  nhl: ['COL', 'FLA', 'VGK', 'DAL', 'CAR', 'NYR', 'BOS', 'TOR', 'EDM', 'WPG', 'NJD', 'TBL', 'MIN', 'LAK', 'OTT', 'STL', 'VAN', 'CGY'],
  nba: ['OKC', 'BOS', 'DEN', 'NYK', 'CLE', 'MIL', 'MIN', 'LAL', 'PHX', 'DAL', 'IND', 'MIA', 'ORL', 'GSW', 'MEM', 'SAC', 'HOU', 'ATL'],
}
const META = {
  mlb: { champion: 'win_world_series', rounds: ['win_division', 'win_league'] },
  nfl: { champion: 'win_champion', rounds: ['win_round1', 'win_round2', 'win_round3'] },
  nhl: { champion: 'win_champion', rounds: ['win_round1', 'win_round2', 'win_round3'] },
  nba: { champion: 'win_champion', rounds: ['win_round1', 'win_round2', 'win_round3'] },
}
export function fixture(sport) {
  const abbrs = ABBR[sport]
  const w = abbrs.map((_, i) => 0.82 ** i)
  const tot = w.reduce((a, b) => a + b, 0)
  const m = META[sport]
  const r4 = (x) => Math.round(x * 10000) / 10000
  const teams = abbrs.map((abbr, i) => {
    const c = w[i] / tot
    const t = {
      team_id: 9000 + i, abbr, name: `TEST ${abbr}`, conference: i % 2 ? 'East' : 'West', division: `TEST DIV ${1 + (i % 4)}`,
      wins: 60 - i, losses: 20 + i, strength: r4(0.7 - i * 0.01), proj_wins: 60 - i,
      make_playoffs: r4(Math.min(1, c * 9 + 0.15)), win_division: r4(Math.min(1, c * 4)), top_seed: r4(Math.min(1, c * 3)),
      seeds: { 1: r4(Math.min(1, c * 3)) },
      [m.champion]: r4(c),
    }
    t.win_round1 = r4(Math.min(0.97, c * 6)); t.win_round2 = r4(Math.min(0.9, c * 3.6)); t.win_round3 = r4(Math.min(0.8, c * 2.2)); t.win_round4 = r4(c)
    if (sport === 'mlb') { t.win_league = t.win_round3; t.league = i % 2 ? 'AL' : 'NL' }
    if (sport === 'nhl') t.otl = 5
    if (sport === 'nfl') { t.ties = 0; t.race = { clinch: i === 0 ? 'z' : '', eliminated: false, seed: i < 7 ? i + 1 : 0 } }
    return t
  })
  const sum = teams.reduce((a, t) => a + t[m.champion], 0)
  for (const t of teams) { t[m.champion] = r4(t[m.champion] / sum); t.win_round4 = t[m.champion] }
  return { schema: 1, season: 2026, as_of: '2026-10-13T04:22:00Z', built_at: '2026-10-13T04:22:00Z', sims: 10000, model_version: 'TEST-fixture',
    method: 'TEST FIXTURE — invented numbers for looking at the layout. Not a forecast.', note: '', teams }
}

if (process.argv.includes('--write')) {
  const dir = path.resolve(process.argv[process.argv.indexOf('--write') + 1] || '.')
  fs.mkdirSync(path.join(dir, 'current'), { recursive: true })
  for (const s of R.ALL_SPORT_KEYS) {
    const file = DS.championshipFile(s)
    fs.writeFileSync(path.join(dir, 'current', file), JSON.stringify(fixture(s)))
    console.log(`wrote ${path.join(dir, 'current', file)}  (TEST fixture)`)
  }
}

// ── 1. the registry covers every sport, once, with its own file ─────────────
ok(Object.keys(Ch.CHAMPIONSHIP).join() === R.ALL_SPORT_KEYS.join(), `CHAMPIONSHIP keys ${Object.keys(Ch.CHAMPIONSHIP)} vs the registry ${R.ALL_SPORT_KEYS}`)
const files = R.ALL_SPORT_KEYS.map((s) => DS.championshipFile(s))
ok(new Set(files).size === files.length, `two sports share a file: ${files}`)
ok(DS.championshipFile('mlb') === 'playoff_odds.json', 'MLB must keep reading playoff_odds.json')
for (const s of R.ALL_SPORT_KEYS) {
  const c = Ch.CHAMPIONSHIP[s]
  for (const k of ['foldId', 'foldTitle', 'foldMeta', 'trophy', 'champion', 'championLabel', 'cols', 'fieldSize', 'fieldWord', 'teamMark', 'shownMax', 'previewRows', 'captionWords', 'notePx', 'tagPx']) ok(c?.[k] != null, `${s}: registry entry has no ${k}`)
  ok(c.notePx >= 12 || s === 'mlb', `${s}: the method line must be 12px or more (only MOONSHOT's unchanged panel is 9.5)`)
}
ok(new Set(R.ALL_SPORT_KEYS.map((s) => Ch.CHAMPIONSHIP[s].foldId)).size === R.ALL_SPORT_KEYS.length, 'fold ids must be unique per sport')

// ── 2. precision: never round a small chance up, never print a sure thing that is not ──
const P = Ch.sharePct
ok(P(0) === '—' && P(null) === '—' && P(NaN) === '—', 'sharePct: zero/absent is a dash')
ok(P(0.0004) === '<1%' && P(0.0099) === '<1%', 'sharePct: under one percent is "<1%"')
ok(P(0.01) === '1%' && P(0.014) === '1%' && P(0.015) === '2%', 'sharePct: ordinary rounding at and above 1%')
ok(P(0.994) === '99%' && P(0.995) === '>99%' && P(0.9999) === '>99%' && P(1) === '100%', 'sharePct: ">99%" until it is locked')
ok(P(0.164) === '16%', 'sharePct: 16.4% prints 16%')

// ── 3. the reader: a good file reads; a bad one is the empty state ──────────
for (const s of R.ALL_SPORT_KEYS) {
  const r = Ch.readChampionship(s, fixture(s))
  ok(r.ok && r.teams.length === ABBR[s].length && r.sims === 10000 && r.method.startsWith('TEST FIXTURE'), `${s}: TEST fixture should read`)
  const noMethod = { ...fixture(s), method: ' ' }
  ok(!Ch.readChampionship(s, noMethod).ok, `${s}: a file with no method line must be empty (the method is never optional)`)
  const pctShares = fixture(s); pctShares.teams[0][Ch.CHAMPIONSHIP[s].champion] = 31.5
  ok(!Ch.readChampionship(s, pctShares).ok, `${s}: a percent written as a share must be empty, not guessed`)
  ok(!Ch.readChampionship(s, { ...fixture(s), teams: [] }).ok, `${s}: no teams is empty`)
  ok(!Ch.readChampionship(s, { ...fixture(s), sims: 0 }).ok, `${s}: zero sims is empty`)
  ok(!Ch.readChampionship(s, null).ok && !Ch.readChampionship(s, 'x').ok && !Ch.readChampionship(s, []).ok, `${s}: junk is empty`)
}
const off = fixture('nfl'); off.teams.forEach((t) => { t.win_champion = Math.min(1, t.win_champion * 1.5) })
ok(!Ch.readChampionship('nfl', off).ok, 'nfl: champion shares that do not add to about one must be empty')
ok(Ch.EMPTY_CHAMPIONSHIP.teams.length === 0 && !Ch.EMPTY_CHAMPIONSHIP.ok, 'the empty state carries no team')
// the bot's real MLB shape (bots/playoff_odds.py payload) still reads: no schema/as_of, built_at instead
const mlbReal = fixture('mlb'); delete mlbReal.schema; delete mlbReal.as_of
ok(Ch.readChampionship('mlb', mlbReal).asOf === mlbReal.built_at, "mlb: built_at is read as as_of (the bot's existing field)")

// ── 4. the code: one component, no sport ternary, no hex, no stored odds, no public BUCKETS door ──
const FILES = ['components/PennantRace.js', 'components/ChampionshipFold.js', 'lib/championship.js']
for (const f of FILES) {
  const src = read(f)
  ok(!/sport\s*===?\s*['"]/.test(src) && !/sport\s*!==?\s*['"]/.test(src), `${f}: a sport ternary/compare (use the registry)`)
  ok(!/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![0-9a-zA-Z])/.test(src.replace(/\/\/.*$/gm, '')), `${f}: a hex literal (use the theme token)`)
}
const lib = read('lib/championship.js')
ok(!/make_playoffs\s*:\s*0?\.\d/.test(lib) && !/TEST/.test(lib.replace(/\/\/.*$/gm, '')), 'lib/championship.js must not hold sample odds')
ok(read('components/ChampionshipFold.js').includes('if (!has) return null'), 'the fold must draw nothing until the file exists')
ok(/no placeholder|nothing here ever invents/i.test(lib), 'the contract comment must say nothing is invented')
const homes = { nfl: 'components/nfl/tabs/Home.js', nhl: 'components/lamp/tabs/Home.js', nba: 'components/buckets/tabs/Home.js' }
for (const [s, f] of Object.entries(homes)) ok(read(f).includes(`<ChampionshipFold sport="${s}" />`), `${s}: Home must mount the fold (${f})`)
ok(read('components/tabs/Leaders.js').includes('<PennantRace />'), 'mlb: Leaders must mount <PennantRace /> (moved off Home 10-17, 9269bda; lib/parity.js expects it there)')
// BUCKETS is hidden: the NBA fold is mounted only inside BUCKETS' own Home, and nothing public names it
const mounts = []
const walk = (d) => { for (const n of fs.readdirSync(path.join(ROOT, d))) { const p = `${d}/${n}`; const st = fs.statSync(path.join(ROOT, p)); if (st.isDirectory()) { if (!['node_modules', '.next', 'ARCHIVE'].includes(n)) walk(p) } else if (/\.js$/.test(n) && read(p).includes('<ChampionshipFold sport="nba"')) mounts.push(p) } }
walk('components'); walk('app')
ok(mounts.join() === 'components/buckets/tabs/Home.js', `the NBA fold must mount only in BUCKETS' Home, found: ${mounts}`)
ok(R.isHiddenSport('nba') === (String(process.env.NEXT_PUBLIC_BUCKETS_PUBLIC || '').toLowerCase() !== 'on'), 'BUCKETS hidden flag follows BUCKETS_PUBLIC')

console.log(bad ? `\nchampionship: ${bad} problem(s)` : `\nchampionship: ${R.ALL_SPORT_KEYS.length} sports, contract, reader and precision hold`)
process.exit(bad ? 1 : 0)
