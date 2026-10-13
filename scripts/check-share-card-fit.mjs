// SHARE CARD FIT CHECK (the GAME card, lib/cards/shareCards.js gameDesign). TEST fixtures only (every name says "Test"): a pregame, a live game and
// a final, long names, a name with no space, one player, two, none, a long note, with and without the team model's expected count.
// For every one it asserts, from the fit system's own log (lib/cards/fit.js FIT_LOG), that
//   1. no text box overflowed (measured width <= the box it was given);
//   2. nothing ordinary was cut: an ellipsis only on text of 40+ characters;
//   3. the grid's last row ends above the footer (gameLayout.bottom <= gameLayout.limit): nothing pushes the footer out of the frame;
//   4. no text is under the 22px floor (cardKit lintType), and the PNG is 1080 x 1350.
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/check-share-card-fit.mjs [--png <dir>]
import { mkdirSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'
import { FIT_LOG } from '../lib/cards/fit.js'
import { LINT } from '../lib/cards/cardKit.js'

const { renderShare, gameLayout } = await import('../lib/cards/shareCards.js')
const pngDir = process.argv.includes('--png') ? process.argv[process.argv.indexOf('--png') + 1] : null
if (pngDir) mkdirSync(pngDir, { recursive: true })
let fails = 0
const bad = (msg) => { fails += 1; console.log(`  ERROR ${msg}`) }
const ok = (cond, msg) => { if (!cond) bad(msg); return cond }

const club = (team) => ({ team, logo: '', logoPlate: false, tone: null })
const LONG = ['Test Maximilian Featherstonehaugh-Villanueva', 'Test Wolfeschlegelsteinhausenbergerdorff', 'Test Encarnacion-Strand', 'Test Skater Four', 'Test Al', 'Test Skater Six', 'Test Jean-Gabriel Pageau-Lindstrom the Third of Fargo', 'Test Skater Eight']
const row = (i, o = {}) => ({ rank: i, name: LONG[(i - 1) % LONG.length], team: 'TST', where: i % 2 ? 'vs OPP' : '@ OPP', opp: 'OPP', face: '', logo: '', logoPlate: false, tone: null, status: i <= 2 ? 'called' : i <= 5 ? 'board' : 'off', score: 99 - i * 5, pct: 100 - i * 11, tag: '', result: null, miss: false, ...o })
const brand = { name: 'LAMP' }
const proj = { label: 'EXPECTED GOALS', away: '3.1', home: '2.9', total: '6.0' }
const base = { sport: 'nhl', brand, kicker: 'GAME CARD', right: 'calls set', dayWord: 'Oct 12', headLabel: 'GOAL SCORE', note: '', empty: 'No skater in this game has played enough NHL games to be on the board.', more: 0, lead: null }
const pre = { state: 'pre', score: null, whenLine: 'TUE  10:30 PM ET', when: '10:30 PM ET' }
const CASES = {
  'pregame-8-long-names': { ...base, rows: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => row(i)), banner: { away: club('EDM'), home: club('LAK'), proj, ...pre } },
  'final-graded': { ...base, rows: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => row(i, i === 1 ? { result: { text: '2 G', hot: true } } : i < 5 ? { result: { text: 'MISS', hot: false }, miss: true } : i === 7 ? { result: { text: 'VOID', hot: false }, miss: true } : {})), banner: { away: club('SEA'), home: club('WSH'), proj, state: 'final', score: { away: 5, home: 3 }, whenLine: 'FINAL', when: 'FINAL 5–3' } },
  'live': { ...base, rows: [1, 2, 3, 4, 5, 6].map((i) => row(i)), banner: { away: club('TOR'), home: club('UTA'), proj, state: 'live', score: { away: 1, home: 1 }, whenLine: '2nd · 11:42', when: '2nd · 11:42' } },
  'no-proj-mlb': { ...base, sport: 'mlb', brand: { name: 'MOONSHOT' }, headLabel: 'SCORE', rows: [1, 2, 3].map((i) => row(i, { tag: '· HR' })), banner: { away: club('NYY'), home: club('BOS'), proj: null, ...pre, whenLine: 'WED  7:10 PM ET' } },
  'one-player': { ...base, rows: [row(1)], banner: { away: club('FLA'), home: club('BUF'), proj, ...pre } },
  'two-players': { ...base, rows: [row(1), row(2)], banner: { away: club('MIN'), home: club('WPG'), proj: null, ...pre } },
  'none': { ...base, rows: [], banner: { away: club('CGY'), home: club('ANA'), proj: null, ...pre } },
  'long-note-and-long-line': { ...base, note: 'a note that is a little long but is still one line on this card', rows: [1, 2, 3, 4, 5, 6, 7, 8].map((i) => row(i)), banner: { away: club('VGK'), home: club('NSH'), proj, state: 'live', score: { away: 10, home: 12 }, whenLine: '3rd · 04:12 · power play', when: 'x' } },
  'nba-four-letter': { ...base, sport: 'nba', brand: { name: 'BUCKETS' }, rows: [1, 2, 3, 4].map((i) => row(i)), banner: { away: club('GSW'), home: club('PHX'), proj: { label: 'EXPECTED POINTS', away: '112.4', home: '109.8', total: '222.2' }, ...pre } },
}

for (const [name, m] of Object.entries(CASES)) {
  console.log(name)
  FIT_LOG.length = 0
  LINT.length = 0
  const lay = gameLayout(m)
  ok(lay.bottom <= lay.limit, `the grid ends at ${lay.bottom}, below the footer line ${lay.limit}`)
  ok(lay.rows.length === 0 || lay.cardH >= 150, `mini card height ${lay.cardH} under 150`)
  const png = await renderShare('game', m)
  const meta = await sharp(png).metadata()
  ok(meta.width === 1080 && meta.height === 1350, `the PNG is ${meta.width} x ${meta.height}, not 1080 x 1350`)
  const mine = FIT_LOG.filter((e) => /^game-/.test(e.id || ''))
  ok(mine.length > 0 || lay.rows.length === 0, 'the fit log recorded nothing for the game card')
  for (const e of mine) {
    ok(e.w <= e.maxW, `overflow: "${e.text}" ${e.size}px is ${e.w}px in a ${e.maxW}px box (${e.id})`)
    ok(!e.truncated || String(e.text).length >= 40, `cut a short text: "${e.text}" (${e.id})`)
    ok(e.size >= 22, `${e.id} "${e.text}" at ${e.size}px, under the 22px floor`)
  }
  const low = LINT.filter((x) => /share-game/.test(x.card))
  ok(low.length === 0, `text under the 22px floor: ${low.slice(0, 3).map((x) => `"${x.text}" ${x.size}px`).join(', ')}`)
  console.log(`  ${mine.length} fits, grid ${lay.rows.length} cards at ${lay.cardW} x ${lay.cardH}, ends ${lay.bottom}/${lay.limit}`)
  if (pngDir) writeFileSync(`${pngDir}/${name}.png`, png)
}
console.log(fails ? `${fails} FAILED` : 'all green')
process.exit(fails ? 1 : 0)
