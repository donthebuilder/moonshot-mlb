// SHARE CARD PREVIEWS (TEST data only, every name says "Test"): renders the six share layouts (lib/cards/shareCards.js) to PNG files.
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/render-share-cards.mjs <outDir>
import { mkdirSync, writeFileSync } from 'node:fs'
const out = process.argv[2]
if (!out) { console.error('usage: render-share-cards.mjs <outDir>'); process.exit(2) }
mkdirSync(out, { recursive: true })
const { renderShare } = await import('../lib/cards/shareCards.js')

const brand = (name) => ({ name })
const row = (i, o = {}) => ({ rank: i, name: `Test Skater ${i}`, team: 'TST', where: 'vs OPP', face: '', logo: '', tone: null, status: i <= 2 ? 'called' : i <= 5 ? 'board' : 'off', score: 98 - i * 6, pct: 100 - i * 11, ...o })
const rows = [2, 3, 4, 5, 6, 7, 8, 9].map((i) => row(i))
const lead = { ...row(1), pos: 'C', number: 7, scoreWord: 'LAMP SCORE', line: '3.1 S/GP  ·  0.41 G/GP  ·  20:10 TOI', status: 'called', score: 97 }
const save = async (name, kind, m, o = {}) => { const b = await renderShare(kind, m, o); writeFileSync(`${out}/${name}.png`, b); console.log(name, b.length) }

await save('ranked-called', 'ranked', { sport: 'nhl', brand: brand('LAMP'), kicker: 'RANKINGS · GOAL', right: '212 RANKED', dayWord: 'Oct 12', lead, rows, more: 203, headLabel: 'GOAL SCORE', note: "LAMP's own 0-100 ranking" })
await save('ranked-board', 'ranked', { sport: 'nfl', brand: brand('TUDDY'), kicker: 'RANKINGS · ANYTIME TD', right: '120 RANKED', dayWord: 'Oct 12', lead: { ...lead, status: 'board', scoreWord: 'TD SCORE' }, rows: rows.map((r, i) => (i < 3 ? { ...r, result: i === 0 ? { text: '2 TD', hot: true } : { text: i === 1 ? 'MISS' : 'VOID', hot: false }, miss: i > 0 } : r)), more: 111, headLabel: 'TD SCORE' })
await save('ranked-long', 'ranked', { sport: 'mlb', brand: brand('MOONSHOT'), kicker: 'THE BOARD · HR', right: '9 RANKED', dayWord: 'Oct 12', lead: { ...lead, name: 'Christian Encarnacion-Strand Junior', status: 'called', scoreWord: 'HR SCORE' }, rows: rows.slice(0, 4).map((r) => ({ ...r, name: 'Jean-Gabriel Pageau-Lindstrom' })), more: 0, headLabel: 'HR SCORE' })
await save('ranked-empty', 'ranked', { sport: 'mlb', brand: brand('MOONSHOT'), kicker: 'MY WATCHLIST', right: '0', dayWord: 'Oct 12', lead: null, rows: [], more: 0, empty: 'None of these hitters is on tonight\'s board.' })
const club = (t) => ({ team: t, logo: '', logoPlate: false, tone: null })
await save('game', 'game', { sport: 'nhl', brand: brand('LAMP'), kicker: 'GAME CARD', right: 'calls locked', dayWord: 'Oct 12', banner: { away: club('FLA'), home: club('BUF'), when: '7:00 PM EDT', proj: { label: 'EXPECTED GOALS', away: '2.9', home: '2.8', total: '5.7' } }, rows: rows.slice(0, 6).map((r, i) => ({ ...r, rank: i + 1 })), headLabel: 'GOAL SCORE', note: 'calls set before puck drop' })
await save('game-noproj', 'game', { sport: 'mlb', brand: brand('MOONSHOT'), kicker: 'GAME CARD', right: 'lineups in', dayWord: 'Oct 12', banner: { away: club('NYY'), home: club('BOS'), when: '7:10 PM EDT', proj: null }, rows: rows.slice(0, 3).map((r, i) => ({ ...r, rank: i + 1, tag: 'HR' })), headLabel: 'HR SCORE' })
const tiles = [['HR/9', '1.62', true], ['WHIP', '1.41', true], ['ERA', '4.88', true], ['HR', '24'], ['BB/9', '3.4'], ['K/9', '7.9', false, true], ['IP', '151.2'], ['GS', '27']].map(([label, value, hot, cold]) => ({ label, value, hot, cold }))
await save('pitcher', 'pitcher', { sport: 'mlb', brand: brand('MOONSHOT'), name: 'Test Pitcher', team: 'TST', opp: 'OPP', throws: 'R', weakSide: 'LHB', face: '', logo: '', tone: null, dayWord: 'Oct 12', tiles, topBat: { name: 'Test Hitter', team: 'OPP', opp: 'TST', score: 88, face: '', tone: null } })
await save('pick-pre', 'pick', { sport: 'nfl', brand: brand('TUDDY'), name: 'Test Receiver', team: 'TST', opp: 'OPP', position: 'WR', number: 11, marketLabel: 'Receiving yards', score: 88, bar: 60, grade: 'A', rung: 2, status: 'called', footLine: 'ranked inside the market, not a probability', face: '', logo: '', tone: null, dayWord: 'Oct 12', flags: 'Q' })
await save('pick-hit', 'pick', { sport: 'nfl', brand: brand('TUDDY'), name: 'Test Receiver', team: 'TST', opp: 'OPP', position: 'WR', number: 11, marketLabel: 'Receiving yards', score: null, bar: 60, actual: 88, rung: 2, status: 'called', result: { word: 'HIT', hit: true }, footLine: "graded against the market's own bar", face: '', logo: '', tone: null, dayWord: 'Oct 12' })
await save('pick-miss', 'pick', { sport: 'nfl', brand: brand('TUDDY'), name: 'Test Receiver', team: 'TST', opp: 'OPP', position: 'WR', marketLabel: 'Receiving yards', bar: 60, actual: 41, status: 'called', result: { word: 'MISS', hit: false }, footLine: "graded against the market's own bar", face: '', logo: '', tone: null, dayWord: 'Oct 12' })
await save('record', 'record', { sport: 'mlb', brand: brand('MOONSHOT'), right: '41 GRADED DAYS', dayWord: 'Oct 12', seasonOk: 812, seasonN: 4120, seasonPct: 19.7, lockOk: 301, lockN: 1500, lockPct: 20.1, note: 'locked 40 nights: every locked pick froze at first pitch', rows: [['TOP', 22.1, 331, 1500, 'A'], ['HR', 19.4, 200, 1031, 'B'], ['HIT', 71.2, 700, 983, 'C'], ['HRR', 38.0, 380, 1000, 'B'], ['CONTACT', 55.5, 555, 1000, 'C']].map(([label, pct, ok, n, g]) => ({ label, pct, hot: pct >= 60, line: `${ok}/${n} · grade ${g}` })) })
