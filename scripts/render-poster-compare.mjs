// POSTER COMPARE (TEST data only; every name says "Test"): renders the 1200 x 675 posters (the homer family, the goal poster, the
// touchdown poster and the player spotlight) to PNG files so a redraw can be read BEFORE and AFTER.
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/render-poster-compare.mjs <outDir> [name ...]
// The fixtures are TEST rows with the shapes the callers pass (see each poster's own header). Face / logo URLs that cannot be fetched
// are simply not drawn, exactly as in production. Names with "LONG" in them exercise the step-down for a very long name.
import { mkdirSync, writeFileSync } from 'node:fs'

const out = process.argv[2]
if (!out) { console.error('usage: render-poster-compare.mjs <outDir> [name ...]'); process.exit(2) }
const only = process.argv.slice(3)
mkdirSync(out, { recursive: true })

const H = await import('../lib/dash/homerCard.js')
const { LINT } = await import('../lib/cards/cardKit.js')
const lazy = (path, name) => async (...a) => (await import(path))[name](...a)
const goalCard = lazy('../lib/nhl/goalCard.js', 'goalCard')
const tdCard = lazy('../lib/nfl/tdCard.js', 'tdCard')
const spotlightCard = lazy('../lib/nfl/spotlightCard.js', 'spotlightCard')

const LONG = 'Test Maximilian Featherstonehaugh-Villanueva'
const row = (o = {}) => ({
  name: 'Test Hitter', team: 'NYY', opponent: 'BOS', home: true, role: 'TOP', _roles: 'TOP', hr_score: 91, board_rank: 1, odds_over: 320, odds_book: 'TestBook', hr_n: 1,
  day: '2026-01-02', player_id: '682829',
  stats: { season_hr: 31, season_iso: 0.241, last5_hr: 2, last5_hits: 6, last5_xbh: 3, barrel: 0.14, hard_hit: 0.51, max_distance: 431, max_ev: 112, pitcher: 'Test Arm', pitcher_throws: 'R', pitcher_hr9: 1.62, pitcher_whip: 1.41, weak_side: 'LHB', bats: 'L', park_factor: 1.08, venue: 'Test Park' },
  hooks: ['🔁 TEST hook one: back-to-back nights', '🔥 TEST hook two: hot against this arm'], ...o,
})
const pick = (o = {}) => ({ name: 'Test Hitter', team: 'NYY', opponent: 'BOS', player_id: '682829', role: 'TOP', hr_score: 88, over: 650, book: 'TestBook', pitcher: 'Test Arm', pitcherTeam: 'BOS', pitcherHr9: 1.74, blastPct: 21, barrelPct: 17, hardHitPct: 52, ...o })
const hs = (o = {}) => ({ name: 'Test Hitter', team: 'NYY', player_id: '682829', ops: '1.012', avg: '.351', obp: '.420', slg: '.592', hr: 7, rbi: 19, games: 15, ab: 57, pitcher: 'Test Arm', season: { games: 140, avg: '.272', obp: '.341', slg: '.488', ops: '.829' }, ...o })
const goal = (o = {}) => ({ name: 'Test Skater', team: 'EDM', opp: 'TOR', status: 'called', season: '20252026', player_id: '8478402', season_goals: 40, period: 2, time_in_period: '12:44', strength: 'pp', score_after: 'EDM 3 - TOR 2', assists: [{ name: 'Test Helper' }, { name: 'Test Passer' }], lamp_score: 91, rank_in_game: 1, day: '2026-01-02', ...o })
const td = (o = {}) => ({
  scorerName: 'Test Receiver', team: 'BUF', opponent: 'MIA', position: 'WR', jersey: 14, gsisId: '00-0023459', day: '2026-01-02', kindWord: 'Passing TD',
  awayScore: 17, homeScore: 21, quarter: 3, clock: '4:12', parsed: { yards: 38, passer: 'Test Passer', kind: 'pass' },
  onBot: { score: 87, rank: 2, market: 'TD', grade: 'A' }, tdBoard: { rank: 2, of: 120 },
  seasonToDate: { td: 8, games: 9, last3Games: 3, last3Td: 4 },
  defense: { tag: 'TARGET', detail: 'MIA allows 1.8 TD / game to WR1', role: 'WR1' }, ...o,
})
const spot = (o = {}) => ({ name: 'Test Quarterback', team: 'BUF', player_id: '00-0023459', jersey: 17, position: 'QB', opp: 'MIA', seasonTd: 31, patd: 3, rutd: 2, rectd: 0, payd: 312, ruyd: 64, rec: 0, recyd: 0, avg: { td: 2.4, xtd: 2.1, payd: 245.5, ruyd: 31.2, rz: 4.0 }, ...o })

const day = '2026-01-02'
const site = { site: 'test.local' }
const FX = {
  'homer-called': () => H.homerCard(row(), site),
  'homer-called-long': () => H.homerCard(row({ name: LONG, odds_over: 850 }), site),
  'homer-board': () => H.homerCard(row({ role: 'TOP15', _roles: 'TOP15', board_rank: 9, odds_over: null }), site),
  'homer-off': () => H.homerCard(row({ role: '', _roles: '', board_rank: 41, hr_score: 52, odds_over: null, hooks: [], stats: {} }), site),
  'mlbhr': () => H.mlbhrCard(row(), { kind: 'solo', distance: 431, seasonHr: 31 }, { ...site, boardSize: 36, postedAt: '2026-01-02T22:05:00Z' }),
  'hotstretch': () => H.hotStretchCard(day, hs(), { ...site, window: 'month', windowLabel: 'LAST 15 GAMES' }),
  'hotstretch-long': () => H.hotStretchCard(day, hs({ name: LONG }), { ...site, window: 'week' }),
  'longshot': () => H.longshotCard(day, pick(), site),
  'longshot-long': () => H.longshotCard(day, pick({ name: LONG, role: 'HR' }), site),
  'numerology-trifecta': () => H.numerologyCard(day, { tier: 'trifecta', root: 7, players: [{ name: 'Test One', team: 'NYY', opponent: 'BOS', jersey: 16, role: 'TOP', nth: 7, player_id: 'a' }, { name: 'Test Two', team: 'LAD', opponent: 'SF', jersey: 25, role: null, nth: 16, player_id: 'b' }] }, site),
  'numerology-jersey': () => H.numerologyCard(day, { tier: 'jersey', jersey: 22, players: [{ name: LONG, team: 'NYY', opponent: 'BOS', jersey: 22, role: 'HR', nth: 1, player_id: 'a' }, { name: 'Test Two', team: 'LAD', opponent: 'SF', jersey: 22, role: null, player_id: 'b' }, { name: 'Test Three', team: 'ATL', opponent: 'PHI', jersey: 22, player_id: 'c' }, { name: 'Test Four', team: 'SEA', opponent: 'HOU', jersey: 22, player_id: 'd' }, { name: 'Test Five', team: 'CHC', opponent: 'STL', jersey: 22, player_id: 'e' }, { name: 'Test Six', team: 'BOS', opponent: 'NYY', jersey: 22, player_id: 'f' }] }, site),
  'numerology-gematria': () => H.numerologyCard(day, { tier: 'gematria', players: [{ name: 'Test One', team: 'NYY', opponent: 'BOS', gem: { dateText: 'Jan 2', value: 33 }, player_id: 'a' }, { name: 'Test Two', team: 'LAD', opponent: 'SF', gem: { dateText: 'Jan 2', value: 33 }, player_id: 'b' }] }, site),
  'pairs': () => H.pairsCard(day, [
    { count: 9, rate: 14, sameGame: 4, a: { name: 'Test One', team: 'NYY', opponent: 'BOS', player_id: 'a', blastPct: 19, pitcher: 'Test Arm', pitcherTeam: 'BOS', over: 320, book: 'TestBook', hr_score: 88 }, b: { name: 'Test Two', team: 'NYY', opponent: 'BOS', player_id: 'b', pitcher: 'Test Arm', pitcherTeam: 'BOS', over: 410, book: 'TestBook', hr_score: 81 } },
    { count: 6, a: { name: 'Test Three', player_id: 'c' }, b: { name: 'Test Four', player_id: 'd' } },
  ], site),
  'stat': () => H.statCard(day, { pill: 'TEST', label: 'TEST STAT', headline: 'Test headline that says something moderately long about the night', lines: ['Test line one', 'Test line two'] }, site),
  'pregame': () => H.pregameCard(day, Array.from({ length: 10 }, (_, i) => ({ name: i === 3 ? LONG : `Test Hitter ${i + 1}`, team: ['NYY', 'LAD', 'ATL', 'SEA'][i % 4], opponent: 'BOS', pitcher: 'Test Arm', hr_score: 90 - i, odds_over: i < 4 ? 300 + i * 40 : null, odds_book: 'TestBook', pitcher_l3_hr9: 1.3 + i / 10, player_id: String(i) })), site),
  'recap': () => H.recapCard(day, [row(), row({ name: 'Test Two', role: 'HR', _roles: 'HR', board_rank: 2 }), row({ name: 'Test Three', role: 'WATCH', _roles: 'WATCH', board_rank: 12 }), row({ name: 'Test Four', role: '', _roles: '', board_rank: 80 })], [row({ day: '2025-12-31' }), row({ day: '2025-12-31', role: '' }), row({ day: '2025-12-30' })], site),
  'goal-called': () => goalCard(goal(), site),
  'goal-called-long': () => goalCard(goal({ name: LONG, assists: [{ name: 'Test Assistant With A Long Name' }, { name: 'Test Second Assistant' }] }), site),
  'goal-board': () => goalCard(goal({ status: 'board', rank_in_game: 3, strength: 'ev', season_goals: 7 }), site),
  'goal-off': () => goalCard(goal({ status: 'off', lamp_score: null, rank_in_game: null, assists: [], season_goals: null }), site),
  'td-called': () => tdCard(td(), site),
  'td-called-long': () => tdCard(td({ scorerName: LONG }), site),
  'td-board': () => tdCard(td({ onBot: null }), site),
  'td-off': () => tdCard(td({ onBot: null, tdBoard: null, defense: null, seasonToDate: null }), site),
  'spotlight': () => spotlightCard(spot(), { ...site, windowLabel: 'WEEK 5', statement: 'Five total touchdowns on Thursday night', context: 'THE BIGGEST NIGHT OF THE WEEK' }),
  'spotlight-long': () => spotlightCard(spot({ name: LONG, payd: 0, ruyd: 120, rec: 0 }), { ...site, windowLabel: 'WEEK 5', statement: 'Five total touchdowns on Thursday night, a long claim line for the test', context: '' }),
}

let bad = 0
for (const [name, fn] of Object.entries(FX)) {
  if (only.length && !only.some((o) => name.startsWith(o))) continue
  try {
    const res = await fn()
    const buf = res instanceof Uint8Array || Buffer.isBuffer(res) ? Buffer.from(res) : Buffer.from(await res.arrayBuffer())
    writeFileSync(`${out}/${name}.png`, buf)
    console.log(name, buf.length)
    for (const x of LINT.splice(0)) console.log(`  TYPE-FLOOR ${name}: ${x.size}px "${x.text}"`)
  } catch (e) { bad += 1; console.log(`FAIL ${name}: ${e?.message || e}`) }
}
process.exit(bad ? 1 : 0)
