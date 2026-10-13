#!/usr/bin/env node
// THE SHARE CARDS (2026-10-12; replaces the browser-canvas check): every 📸 download is a SERVER card in the baseball-card look
// (lib/cards/shareCards.js, drawn by satori through next/og), so this runs in plain node with the SWC loader, no browser, no database, no network:
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/check-cards.mjs [--out DIR]
// It renders every share layout from labelled TEST data (every name says "Test") and fails when a card breaks the card rules:
//   - a PNG at 1080 x 1350 (and the scaled sizes the route serves); the type floor (22px at the design size) holds on every text node
//   - the status words are exactly STATUS_WORD; the foil strip is drawn for a CALLED lead only (a board / off card has none)
//   - a miss is built from the greys (no accent on its result); a void man is VOID
//   - a very long name steps down to fit (no clipped / overflowing name)
//   - the source files: no sport ternary, no hex literal, no developer words, no printed probability, no status word spelled by hand
//   - the retired browser canvas kit (lib/cards/kit.js, cards.js, components/**/shareCard.js) stays gone and nothing imports it
//   - every download button goes through lib/cards/saveCard.js
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
const OUT = arg('--out') || join(tmpdir(), 'dash-cards')
mkdirSync(OUT, { recursive: true })
const ROOT = new URL('..', import.meta.url).pathname
let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

const { renderShare, rankedDesign, gameDesign, pitcherDesign, pickDesign, recordDesign } = await import('../lib/cards/shareCards.js')
const { LINT, lintType } = await import('../lib/cards/cardKit.js')
const { STATUS_WORD } = await import('../lib/callStatus.js')
const { loadShareModel } = await import('../lib/cards/shareData.js')
const { nflTdResult, nflItem } = await import('../lib/cards/nflRows.js')

// ── TEST models ──
const brand = (name) => ({ name })
const row = (i, o = {}) => ({ rank: i, name: `Test Skater ${i}`, team: 'TST', where: 'vs OPP', face: '', logo: '', tone: null, status: i <= 2 ? 'called' : i <= 5 ? 'board' : 'off', score: 98 - i * 6, pct: 100 - i * 11, ...o })
const rows = [2, 3, 4, 5, 6, 7, 8, 9].map((i) => row(i))
const lead = { ...row(1), pos: 'C', number: 7, scoreWord: 'LAMP SCORE', line: 'TEST line', score: 97 }
const club = (t) => ({ team: t, logo: '', logoPlate: false, tone: null })
const LONG = 'Test Christian Encarnacion-Strand Junior The Third'
const M = {
  rankedCalled: { sport: 'nhl', brand: brand('LAMP'), kicker: 'RANKINGS · GOAL', right: '212 RANKED', dayWord: 'Jan 2', lead, rows, more: 203, headLabel: 'GOAL SCORE' },
  rankedBoard: { sport: 'nfl', brand: brand('TUDDY'), kicker: 'RANKINGS · ANYTIME TD', right: '120 RANKED', dayWord: 'Week 5', lead: { ...lead, status: 'board' }, rows, more: 0, headLabel: 'TD SCORE' },
  rankedLong: { sport: 'mlb', brand: brand('MOONSHOT'), kicker: 'THE BOARD', right: '9 RANKED', dayWord: 'Jan 2', lead: { ...lead, name: LONG }, rows: rows.slice(0, 3).map((r) => ({ ...r, name: LONG })), more: 0, headLabel: 'HR SCORE' },
  rankedGraded: { sport: 'nfl', brand: brand('TUDDY'), kicker: 'RANKINGS · ANYTIME TD', right: '9 RANKED', dayWord: 'Week 5', lead: { ...lead, result: { text: '2 TD', hot: true } }, rows: [{ ...rows[0], result: { text: 'MISS', hot: false }, miss: true }, { ...rows[1], result: { text: 'VOID', hot: false }, miss: true }], more: 0, headLabel: 'TD SCORE' },
  empty: { sport: 'mlb', brand: brand('MOONSHOT'), kicker: 'MY WATCHLIST', right: '0', dayWord: 'Jan 2', lead: null, rows: [], more: 0, empty: 'None of these hitters is on tonight\'s board.' },
  game: { sport: 'nhl', brand: brand('LAMP'), kicker: 'GAME CARD', right: 'calls set', dayWord: 'Jan 2', banner: { away: club('FLA'), home: club('BUF'), when: '7:00 PM ET', proj: { label: 'EXPECTED GOALS', away: '2.9', home: '2.8', total: '5.7' } }, rows: rows.slice(0, 6).map((r, i) => ({ ...r, rank: i + 1 })) },
  gameNoProj: { sport: 'mlb', brand: brand('MOONSHOT'), kicker: 'GAME CARD', right: 'lineups in', dayWord: 'Jan 2', banner: { away: club('NYY'), home: club('BOS'), when: '', proj: null }, rows: [] , empty: 'No designated picks in this game.' },
  pitcher: { sport: 'mlb', brand: brand('MOONSHOT'), name: 'Test Pitcher', team: 'TST', opp: 'OPP', throws: 'R', weakSide: 'LHB', face: '', logo: '', tone: null, dayWord: 'Jan 2', tiles: ['ERA', 'WHIP', 'HR/9', 'K/9', 'FB%'].map((label, i) => ({ label, value: String(i + 1.5), hot: i === 2, cold: i === 3 })), topBat: { name: 'Test Hitter', team: 'OPP', opp: 'TST', score: 88, face: '', tone: null } },
  pickPre: { sport: 'nfl', brand: brand('TUDDY'), name: 'Test Receiver', team: 'TST', opp: 'OPP', position: 'WR', number: 11, marketLabel: 'Receiving yards', score: 88, bar: 60, grade: 'A', rung: 2, status: 'called', footLine: 'a 0–100 rank within this market', dayWord: 'Jan 2' },
  pickHit: { sport: 'nfl', brand: brand('TUDDY'), name: 'Test Receiver', team: 'TST', opp: 'OPP', position: 'WR', marketLabel: 'Receiving yards', bar: 60, actual: 88, status: 'called', result: { word: 'HIT', hit: true }, footLine: "graded against the market's own bar", dayWord: 'Jan 2' },
  pickMiss: { sport: 'nfl', brand: brand('TUDDY'), name: 'Test Receiver', team: 'TST', opp: 'OPP', position: 'WR', marketLabel: 'Receiving yards', bar: 60, actual: 41, status: 'called', result: { word: 'MISS', hit: false }, footLine: "graded against the market's own bar", dayWord: 'Jan 2' },
  record: { sport: 'mlb', brand: brand('MOONSHOT'), right: '41 GRADED DAYS', dayWord: 'Jan 2', seasonOk: 812, seasonN: 4120, seasonPct: 19.7, lockOk: 301, lockN: 1500, lockPct: 20.1, note: 'TEST', rows: [['TOP', 22.1], ['HR', 19.4], ['HIT', 71.2]].map(([label, pct]) => ({ label, pct, hot: pct > 70, cold: pct < 20, line: '0/0' })) },
}
const KIND = { rankedCalled: 'ranked', rankedBoard: 'ranked', rankedLong: 'ranked', rankedGraded: 'ranked', empty: 'ranked', game: 'game', gameNoProj: 'game', pitcher: 'pitcher', pickPre: 'pick', pickHit: 'pick', pickMiss: 'pick', record: 'record' }
const DESIGN = { ranked: rankedDesign, game: gameDesign, pitcher: pitcherDesign, pick: pickDesign, record: recordDesign }
const pngSize = (b) => [b.readUInt32BE(16), b.readUInt32BE(20)]

LINT.length = 0
const pngs = {}
for (const [k, m] of Object.entries(M)) {
  try {
    const png = await renderShare(KIND[k], m)
    pngs[k] = png
    writeFileSync(join(OUT, `${k}.png`), png)
    const [w, h] = pngSize(png)
    check(png.subarray(0, 8).toString('hex') === '89504e470d0a1a0a' && w === 1080 && h === 1350, `${k}: a 1080 x 1350 PNG`)
  } catch (e) { check(false, `${k}: renders (${e?.message || e})`) }
}
const small = await renderShare('ranked', M.rankedCalled, { width: 540 })
check(pngSize(small).join('x') === '540x675', 'the 540 width is the same drawing scaled to 540 x 675')
check(LINT.length === 0, `no text under the 22px floor on any card${LINT.length ? ` (${LINT.slice(0, 3).map((x) => `${x.card}:${x.text}@${x.size}`).join('; ')})` : ''}`)

// the foil strip is a CALLED-lead mark only: look for the foil gradient in the tree
const hasFoil = (m, kind) => Boolean(DESIGN[kind](m, null).props.called)   // the Shell draws the strip exactly when `called`
check(hasFoil(M.rankedCalled, 'ranked') && !hasFoil(M.rankedBoard, 'ranked') && !hasFoil(M.empty, 'ranked'), 'the foil strip is drawn for a CALLED lead only')
check(hasFoil(M.pickHit, 'pick') && !hasFoil(M.pickMiss, 'pick'), 'a graded HIT pick wears the foil, a MISS does not')
check(!hasFoil(M.record, 'record') && !hasFoil(M.pitcher, 'pitcher'), 'the record and the pitcher (no call) have no foil')

// status words: only STATUS_WORD
const text = (el) => { const out = []; const walk = (n) => { if (n == null || typeof n === 'boolean') return; if (typeof n === 'string' || typeof n === 'number') { out.push(String(n)); return } if (Array.isArray(n)) return n.forEach(walk); if (typeof n.type === 'function') return walk(n.type(n.props)); walk(n.props?.children) }; walk(el); return out }
const words = text(DESIGN.ranked(M.rankedBoard, null)).join('|')
check(words.includes(STATUS_WORD.board) && words.includes(STATUS_WORD.off) && !/CALLED IT|OFF THE BOARD|ON THE LAMP BOARD/.test(words), 'a ranked list says ON THE BOARD / NOT ON THE BOARD exactly as STATUS_WORD spells them')
const graded = text(DESIGN.ranked(M.rankedGraded, null)).join('|')
check(/2 TD/.test(graded) && /MISS/.test(graded) && /VOID/.test(graded), 'a graded list shows TD / MISS / VOID in words')
check(text(DESIGN.ranked(M.empty, null)).join('|').includes("None of these hitters is on tonight's board."), 'an empty list says so in words')
check(!text(DESIGN.game(M.gameNoProj, null)).some((t) => /EXPECTED/.test(t)), 'a game with no team-model number draws no strip (never a placeholder)')
const alltext = Object.entries(M).flatMap(([k, m]) => text(DESIGN[KIND[k]](m, null))).join('|')
check(!/probab|chance of|%\s*chance/i.test(alltext), 'no printed probability on any card')
check(!/lock|guarantee|\bdue\b/i.test(alltext.replace(/frozen/gi, '')), 'no lock / due / guaranteed wording on any card')

// names: a long one is stepped down (the slanted caps width fits the column)
const nameSize = (m) => { const sizes = []; const walk = (n) => { if (n == null || typeof n === 'boolean' || typeof n === 'string') return; if (Array.isArray(n)) return n.forEach(walk); if (typeof n.type === 'function') return walk(n.type(n.props)); if (n.props?.children === LONG) sizes.push(n.props.style.fontSize); walk(n.props?.children) }; walk(DESIGN.ranked(m, null)); return sizes }
const ns = nameSize(M.rankedLong)
check(ns.length >= 2 && ns.every((s) => s * 0.46 * LONG.length <= 960), `a ${LONG.length}-character name is stepped down to fit (${ns.join(', ')}px)`)

// the loaders refuse what they cannot answer, with a status the route maps
check((await loadShareModel('nope', 'mlb', {})).status === 400, 'an unknown kind is a 400')
check((await loadShareModel('ranked', 'cricket', {})).status === 404, 'a sport with no cards is a 404')
check((await loadShareModel('game', 'mlb', {})).status === 400, 'a game card without a game is a 400')
check((await loadShareModel('ranked', 'mlb', { ids: 'a b' })).status === 400, 'a malformed id list is a 400')
check((await loadShareModel('pitcher', 'nhl', { id: '1' })).status === 404, 'a kind a sport does not have is a 404')
// NFL rows: nothing before the game is final; a touchdown, a miss and a void wear the same dignity after
const res = { lines: { a: { TD: 2 }, b: { REC: 40 }, c: {} } }
check(nflTdResult({ player_id: 'a' }, { completed: false }, res) === null && nflTdResult({ player_id: 'a' }, { completed: true }, res).text === '2 TD', 'NFL result words: none before final, "2 TD" after')
check(nflItem({ player_id: 'b', name: 'TEST B', team: 'AAA', opp: 'BBB', score: 61, status: 'called' }, 2, { week: { games: [{ home: 'AAA', away: 'BBB', completed: true }] }, results: res }).result.text === 'MISS', 'an NFL row for a man who did not score reads MISS')

// ── the source ──
const code = (f) => readFileSync(join(ROOT, f), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\s\/\/.*$/, '')).join('\n')
for (const f of ['lib/cards/shareCards.js', 'lib/cards/shareData.js', 'lib/cards/saveCard.js', 'lib/cards/nflRows.js', 'components/card/ShareCardButton.js']) {
  const c = code(f)
  check(!/\bsport\s*[!=]==?\s*['"]/.test(c) && !/\bsportKey\([^)]*\)\s*[!=]==?\s*['"]/.test(c), `${f}: no sport ternary`)
  check(!/#[0-9a-fA-F]{3,8}\b/.test(c.replace(/['"]#['"]/g, '')), `${f}: no hex literal`)
  check(!/\bbot\b|🤖|payload|model[_ ]?version/i.test(c), `${f}: no developer words in code`)
}
check(!/\b(CALLED|ON THE BOARD|NOT ON THE BOARD)\b/.test(code('lib/cards/shareCards.js')), 'lib/cards/shareCards.js: never spells a status word (STATUS_WORD only)')
// the retired browser canvas kit stays gone and nothing imports it
for (const f of ['lib/cards/kit.js', 'lib/cards/cards.js', 'components/shareCard.js', 'components/nfl/shareCard.js', 'components/lamp/shareCard.js', 'components/buckets/shareCard.js']) check(!existsSync(join(ROOT, f)), `${f} stays retired`)
const walkDir = (d, out = []) => { for (const n of readdirSync(join(ROOT, d))) { if (['node_modules', '.next', 'ARCHIVE', '.git', 'scratch'].includes(n)) continue; const p = `${d}/${n}`; if (statSync(join(ROOT, p)).isDirectory()) walkDir(p, out); else if (/\.(js|mjs)$/.test(n)) out.push(p) } return out }
const stale = ['app', 'components', 'lib', 'scripts'].flatMap((d) => walkDir(d)).filter((f) => f !== 'scripts/check-cards.mjs' && /from ['"][^'"]*(cards\/kit|cards\/cards|\/shareCard)(\.js)?['"]/.test(readFileSync(join(ROOT, f), 'utf8')))
check(stale.length === 0, `nothing imports the retired canvas kit or a shareCard wrapper${stale.length ? ` (${stale.join(', ')})` : ''}`)
// every download button is the ONE ShareCardButton (components/card/ShareCardButton.js), which goes through saveCard; no page draws its own
const BUTTONS = ['components/PlayerModal.js', 'components/PitcherModal.js', 'components/ReportCard.js', 'components/tabs/RankedBoard.js', 'components/tabs/HitsHRR.js', 'components/tabs/Watchlist.js', 'components/tabs/Games.js',
  'components/nfl/NflPlayerModal.js', 'components/nfl/NflSlate.js', 'components/nfl/tabs/Touchdowns.js', 'components/nfl/tabs/Accountability.js', 'components/nfl/tabs/Watchlist.js', 'components/nfl/tabs/BoardHub.js',
  'components/lamp/tabs/Player.js', 'components/lamp/tabs/Board.js', 'components/lamp/tabs/Game.js', 'components/lamp/LampSlate.js', 'components/buckets/tabs/Player.js', 'components/buckets/tabs/Board.js', 'components/buckets/tabs/Slate.js', 'components/buckets/tabs/Game.js']
for (const f of BUTTONS) {
  const src = readFileSync(join(ROOT, f), 'utf8')
  check(/card\/ShareCardButton/.test(src) && /<ShareCardButton\b/.test(src), `${f}: its 📸 is the shared ShareCardButton`)
  check(!/downloadCard\(/.test(src) && !/>\s*📸\s*</.test(code(f)), `${f}: no hand-made 📸 button`)
}
check(/lib\/cards\/saveCard/.test(readFileSync(join(ROOT, 'components/card/ShareCardButton.js'), 'utf8')) && /downloadCard\(/.test(readFileSync(join(ROOT, 'components/card/ShareCardButton.js'), 'utf8')), 'ShareCardButton goes through lib/cards/saveCard.js downloadCard')
check(!existsSync(join(ROOT, 'components/CardButton.js')), 'components/CardButton.js stays retired')

console.log(`\nPNGs for a look: ${OUT}`)
console.log(failed ? `${failed} FAILED` : 'all green')
process.exit(failed ? 1 : 0)
