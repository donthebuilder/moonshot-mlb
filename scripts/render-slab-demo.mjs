// LAYOUT DEMOS of the slab with LABELLED TEST DATA (names say "Test", the files say TEST-DEMO). Real graded Card rows do not exist yet (the Card's first
// day is 2026-10-10), and no night's receipt on file holds a CASHED call, so the cashed / void looks are shown on test rows and nothing else.
//   node --import ./scripts/proto-cards/_loader.mjs scripts/render-slab-demo.mjs <outDir>
import { mkdirSync, writeFileSync } from 'node:fs'
import { renderSlab } from '../lib/cards/slabCard.js'
import { BRAND } from '../lib/routes.js'

const out = process.argv[2] || '/tmp/slab-demo'
mkdirSync(out, { recursive: true })
const m = (n, o = {}) => ({ sport: 'nhl', brand: { sport: 'nhl', name: BRAND.nhl.name }, playerId: `T${n}`, name: `Test Skater ${n}`, team: 'TST', opp: 'OPP', home: null, face: '', logo: '', logoPlate: false, tone: null, ...o })
const slab = (legs, o = {}) => ({ sport: 'nhl', brandName: 'LAMP', kicker: 'THE CARD · NHL · TEST DATA', product: 'TWO-MAN', market: 'anytime goal', dayWord: 'Jan 2', result: 'missed', legs: legs.map((outcome, i) => ({ m: m(i + 1), outcome, market: 'anytime goal' })), record: { k: 6, n: 14, label: 'TEST: Two-Men landed both legs' }, note: 'TEST DATA. Layout demo.', ...o })
const demos = {
  'straight-cashed': slab(['cashed'], { product: 'STRAIGHT 1', result: 'cashed', record: { k: 12, n: 31, label: 'TEST: straights hit, this lane' } }),
  'straight-missed': slab(['missed'], { product: 'STRAIGHT 2', result: 'missed', record: { k: 12, n: 31, label: 'TEST: straights hit, this lane' } }),
  'twoman-cashed': slab(['cashed', 'cashed'], { result: 'cashed' }),
  'twoman-missed': slab(['missed', 'cashed'], { result: 'missed' }),
  'twoman-void': slab(['cashed', 'dnp'], { result: 'void' }),
  'receipt-mixed': slab(['cashed', 'cashed', 'missed', 'missed', 'dnp'], { sport: null, brandName: 'DASH Network', kicker: 'THE RECEIPT · TEST DATA', product: 'NIGHT RECEIPT', market: 'every named call', result: null, record: { k: 2, n: 4, label: 'TEST: cashed, every named call graded' } }),
}
for (const [k, d] of Object.entries(demos)) { writeFileSync(`${out}/slab-TEST-DEMO-${k}.png`, await renderSlab(d)); console.log('wrote', k) }
