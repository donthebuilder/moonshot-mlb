// Deterministic check for lib/nfl/gameSplits.js. TEST data only (labelled), no network.
// Run: node --import ./scripts/_esm-resolve.mjs scripts/check-nfl-game-splits.mjs
import { comboFields, filterGames, aggregateNflGames, stadiumRecord, hasContext, homeTeamOf, THIN_G } from '../lib/nfl/gameSplits.js'
let bad = 0
const check = (ok, msg) => { if (!ok) { bad++; console.error('FAIL', msg) } }
const near = (a, b) => Math.abs(a - b) < 1e-9

// TEST LOG (not a real player): tm=AAA
const G = (s, w, opp, h, wd, r, rs, rf, sf, td, recyd) => ({ s, w, opp, tm: 'AAA', d: `${s}-09-${10 + w}`, ...(h == null ? {} : { h }), wd, ...(r ? { r } : {}), rs, rf, sf, g_td: td, g_recyd: recyd, g_rec: 0, g_ruyd: 0, g_car: 0, g_payd: 0, g_kick: 0 })
const LOG = [
  G(2025, 1, 'DAL', 1, 'Thu', 'W', 7, 'outdoors', 'grass', 1, 80),
  G(2025, 2, 'CHI', 0, 'Sun', 'L', 4, 'dome', 'fieldturf', 0, 20),
  G(2025, 3, 'DAL', 0, 'Sun', 'W', 7, 'closed', 'a_turf', 2, 100),
  G(2025, 4, 'NYG', null, 'Sun', 'L', 14, 'outdoors', 'grass', 0, 10),   // neutral site
  G(2026, 1, 'BUF', 1, 'Mon', 'W', 6, 'outdoors', 'grass', 1, 60),
  G(2026, 2, 'BUF', 0, 'Sun', 'T', 9, 'open', 'grass', 0, 0),
]
check(hasContext(LOG), 'context detected')
check(!hasContext([{ s: 2025, w: 1, opp: 'X', tm: 'Y', g_td: 1 }]), 'an old-shape log has no context')
check(comboFields([{ s: 2025, w: 1, opp: 'X', tm: 'Y', g_td: 1 }]).length === 0, 'old log: no selectors (one opponent/season is not a choice)')
const keys = comboFields(LOG).map((f) => f.key)
check(keys.join() === 'day,ha,res,roof,turf,rest,opp,season', `fields ${keys}`)

const n = (sel) => filterGames(LOG, sel).length
check(n({}) === 6, 'no filter = all')
check(n({ ha: 'home' }) === 2 && n({ ha: 'away' }) === 3, 'neutral site is neither home nor away')
check(n({ res: 'win' }) === 3 && n({ res: 'loss' }) === 2, 'a tie is neither win nor loss')
check(n({ day: 'Sun', ha: 'away' }) === 3, 'AND: Sunday away')
check(n({ day: 'Sun', ha: 'away', res: 'W' }) === 0, 'unknown value matches nothing')
check(n({ day: 'Sun', ha: 'away', res: 'win' }) === 1, 'AND: Sunday away win')
check(n({ roof: 'indoors' }) === 2 && n({ roof: 'outdoors' }) === 3, 'roof buckets mirror the bot ("open" is neither)')
check(n({ turf: 'turf' }) === 2 && n({ turf: 'grass' }) === 4, 'surface buckets')
check(n({ rest: 'short' }) === 2 && n({ rest: 'rested' }) === 2 && n({ rest: 'normal' }) === 2, 'rest buckets (<=6 short, >=8 rested)')
check(n({ opp: 'DAL' }) === 2 && n({ season: '2026' }) === 2, 'opponent / season')
check(n({ day: '' , ha: '' }) === 6, 'empty selections are ignored')

const a = aggregateNflGames(filterGames(LOG, { opp: 'DAL' }))
check(a.g === 2 && a.td === 3 && near(a.tdPerG, 1.5) && near(a.tdPct, 100) && a.multi === 1, 'aggregate TDs')
check(near(a.recyd, 90) && a.rec === null && a.car === null, 'yardage per game; a stat he never records is null, not 0')
check(a.thin === true && a.veryThin === true, 'two games is thin')
check(aggregateNflGames(LOG).thin === (LOG.length < THIN_G), 'thin flag follows THIN_G')
check(aggregateNflGames([]).g === 0, 'empty')

// stadium: AAA is home in 2025 wk1 + 2026 wk1; away at DAL (2x) and CHI (1)
check(homeTeamOf(LOG[0]) === 'AAA' && homeTeamOf(LOG[1]) === 'CHI' && homeTeamOf(LOG[3]) === null, 'building owner')
const soldier = stadiumRecord(LOG, 'Soldier Field')
check(soldier && soldier.g === 1 && soldier.td === 0, 'Soldier Field = the CHI game')
const att = stadiumRecord(LOG, 'AT&T Stadium')
check(att && att.g === 1 && att.td === 2 && near(att.baseTdPerG, 4 / 5) && att.baseGames === 5, 'AT&T = the one game played at DAL; base excludes the neutral game')
check(stadiumRecord(LOG, 'Nowhere Park') === null, 'unknown venue -> null')
// BUF moved in 2026: the 2025 old-building games must not count. TEST: AAA at BUF in 2025 + 2026.
const MOVED = [G(2025, 5, 'BUF', 0, 'Sun', 'W', 7, 'outdoors', 'grass', 3, 0), G(2026, 5, 'BUF', 0, 'Sun', 'W', 7, 'outdoors', 'grass', 1, 0)]
check(stadiumRecord(MOVED, 'Highmark Stadium')?.g === 1, 'a relocated club only counts its new building')
check(stadiumRecord(LOG.map((g) => ({ s: g.s, w: g.w, opp: g.opp, tm: g.tm, g_td: g.g_td })), 'AT&T Stadium') === null, 'old-shape log: no stadium line')
if (bad) { console.error(`${bad} failed`); process.exit(1) }
console.log('check-nfl-game-splits OK')
