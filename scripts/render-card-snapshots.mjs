// CARD SNAPSHOTS (TEST data only, every name says "Test"): renders the server cards that share fonts / palette / mark / grain
// (the player front + back, the day lineup, the Two-Man dual, the graded slab, the homer / recap / stat posters) to PNG files plus a
// manifest of sha256 hashes, so a refactor of the shared loaders can be proved a NO-VISUAL-CHANGE: render before, render after, compare.
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/render-card-snapshots.mjs <outDir>
//   node scripts/render-card-snapshots.mjs --diff <dirBefore> <dirAfter>      (plain node: byte-compare the manifests)
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'

if (process.argv[2] === '--diff') {
  const [a, b] = [process.argv[3], process.argv[4]]
  const ma = JSON.parse(readFileSync(`${a}/manifest.json`, 'utf8')); const mb = JSON.parse(readFileSync(`${b}/manifest.json`, 'utf8'))
  let bad = 0
  for (const k of new Set([...Object.keys(ma), ...Object.keys(mb)])) {
    const same = ma[k] && mb[k] && ma[k] === mb[k]
    console.log(`${same ? 'identical' : 'DIFFERENT'} ${k}`)
    if (!same) bad += 1
  }
  console.log(bad ? `${bad} DIFFERENT` : `all ${Object.keys(ma).length} identical (byte for byte)`)
  process.exit(bad ? 1 : 0)
}

const out = process.argv[2]
if (!out) { console.error('usage: render-card-snapshots.mjs <outDir>'); process.exit(2) }
mkdirSync(out, { recursive: true })
const { BRAND } = await import('../lib/routes.js')
const { STATUS_WORD } = await import('../lib/callStatus.js')
const { renderFront } = await import('../lib/cards/playerCard.js')
const { renderBack } = await import('../lib/cards/playerBack.js')
const { renderDay } = await import('../lib/cards/dayCard.js')
const { renderDual } = await import('../lib/cards/dualCard.js')
const { renderSlab } = await import('../lib/cards/slabCard.js')
const H = await import('../lib/dash/homerCard.js')

const manifest = {}
const save = async (name, res) => {
  const buf = res instanceof Uint8Array || Buffer.isBuffer(res) ? Buffer.from(res) : Buffer.from(await res.arrayBuffer())
  writeFileSync(`${out}/${name}.png`, buf)
  manifest[name] = createHash('sha256').update(buf).digest('hex')
  console.log(name, buf.length)
}
const base = (o = {}) => ({
  sport: 'nhl', brand: { sport: 'nhl', name: BRAND.nhl.name, league: BRAND.nhl.league }, status: 'called', statusWord: STATUS_WORD.called,
  name: 'Test Skater', team: 'TST', opp: 'OPP', home: true, teamName: 'Test Club', club: 'Test Club', pos: 'C', number: 7, role: 'TOP',
  face: '', logo: '', logoPlate: false, tone: null, score: 91, scoreWord: 'LAMP SCORE',
  stats: [{ label: 'SHOTS / GP', value: '3.1', pct: 95 }, { label: 'GOALS / GP', value: '0.41', pct: 88 }, { label: 'ICE TIME', value: '20:10', pct: 60 }, { label: 'THIS SEASON', value: '3-4-7', sub: 'G-A-P in 6 GP' }],
  statNote: "percentile among tonight's skaters", poolWord: "tonight's skaters", rankLine: ['#3 OF 500 TONIGHT'], callLine: 'TOP · ANYTIME GOAL',
  why: null, price: { best: '+110', books: 4 }, day: '2026-01-02', dayWord: 'Jan 2', playerId: '1', ...o,
})
const backData = {
  bio: [['HT / WT', "6'0\" · 190 lb"], ['SHOOTS', 'L'], ['BORN', 'Jan 2, 2000 · Testville']],
  cols: [['YEAR', 1.25, 'season'], ['TEAM', 1.9, 'tm'], ['GP', 1, 'gp'], ['G', 1, 'g']],
  rows: Array.from({ length: 8 }, (_, i) => ({ season: `${19 + i}-${20 + i}`, tm: 'Test Club', gp: '80', g: '30' })),
  title: 'CAREER STATS', career: { season: 'NHL TOTALS', tm: '', gp: '640', g: '240' }, playoffs: { season: 'PLAYOFFS', tm: '', gp: '20', g: '9' }, note: 'TEST note',
}
const leg = (n, o = {}) => ({ ...base({ name: `Test Skater ${n}`, playerId: `P${n}`, number: n, why: 'shots 99th · goals 98th percentile tonight' }), ...o })
await save('front-called', await renderFront(base()))
await save('front-board', await renderFront(base({ status: 'board', statusWord: STATUS_WORD.board, price: null })))
await save('front-520', await renderFront(base(), { width: 520 }))
await save('back', await renderBack(base(), backData))
const day = { sport: 'nhl', scope: 'full', league: 'NHL', brandName: 'LAMP', market: 'anytime goal', dayWord: 'Jan 2', straights: [1, 2, 3].map((n) => ({ slot: n, stake: 1, m: leg(n), price: n === 1 ? { best: '+110', books: 4 } : null })), two: { stake: 0.5, legs: [{ m: leg(1), price: { best: '+110', books: 4 } }, { m: leg(2), price: null }], price: null }, donovan: null }
await save('day-full', await renderDay(day))
const dual = { sport: 'nhl', brandName: 'LAMP', market: 'anytime goal', dayWord: 'Jan 2', lane: 'bot', label: 'TWO-MAN', rule: '0.5 unit · both legs must land', legs: [{ m: leg(1), price: { best: '+110', books: 4 } }, { m: leg(2), price: { best: '+130', books: 3 } }], price: '+341', serial: { n: 14, of: 31, caption: 'TWO-MAN NO.' } }
await save('dual', await renderDual(dual))
const sm = (n) => ({ ...leg(n), why: undefined })
const slab = (outs, o = {}) => ({ sport: 'nhl', brandName: 'LAMP', kicker: 'THE CARD · NHL', product: 'TWO-MAN', market: 'anytime goal', dayWord: 'Jan 2', result: 'missed', legs: outs.map((outcome, i) => ({ m: sm(i + 1), outcome, market: 'anytime goal' })), record: { k: 6, n: 14, label: 'Two-Men landed both legs' }, note: 'TEST note.', ...o })
await save('slab-cashed', await renderSlab(slab(['cashed', 'cashed'], { result: 'cashed' })))
await save('slab-missed', await renderSlab(slab(['missed', 'missed'])))
await save('slab-receipt', await renderSlab(slab(Array.from({ length: 12 }, (_, i) => (i % 3 ? 'missed' : 'cashed')), { sport: null, brandName: 'DASH Network', kicker: 'THE RECEIPT', product: 'NIGHT RECEIPT', result: null })))
// the poster family (1200 x 675, redrawn 2026-10-12 as a landscape variant of the card look: lib/cards/posterKit.js): TEST rows (scripts/render-poster-compare.mjs renders the full set)
const row = { name: 'Test Hitter', team: 'NYY', opp: 'BOS', role: 'TOP', _roles: 'TOP', hr_score: 91, board_rank: 1, odds_over: 320, odds_book: 'TestBook', hr_n: 1, stats: {}, hooks: ['TEST hook one', 'TEST hook two'], day: '2026-01-02', player_id: 'x', pitcher_name: 'Test Arm' }
await save('homer', await H.homerCard(row, { site: 'test.local' }))
await save('stat', await H.statCard('2026-01-02', { pill: 'TEST', label: 'TEST STAT', headline: 'Test headline', lines: ['Test line one', 'Test line two'] }, { site: 'test.local' }))
await save('recap', await H.recapCard('2026-01-02', [row, { ...row, name: 'Test Two', role: 'HR', _roles: 'HR', board_rank: 2 }], [], { site: 'test.local' }))
try {
  const { goalCard } = await import('../lib/nhl/goalCard.js')
  await save('goal', await goalCard({ player: 'Test Skater', name: 'Test Skater', team: 'EDM', opp: 'TOR', role: 'TOP', day: '2026-01-02', player_id: 'x' }, { site: 'test.local' }))
} catch (e) { console.log('goal skipped:', e.message) }
writeFileSync(`${out}/manifest.json`, JSON.stringify(manifest, null, 1))
console.log('manifest', Object.keys(manifest).length)
