// TOP THREE CARD PREVIEWS: TEST fixtures (they print TEST DATA) in every count and tier, plus the stress set. Nothing is written to the database; nothing is posted.
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/render-top-three-cards.mjs <outDir>
import { mkdirSync, writeFileSync } from 'node:fs'

const out = process.argv[2]
if (!out) { console.error('usage: render-top-three-cards.mjs <outDir>'); process.exit(2) }
mkdirSync(out, { recursive: true })
const { renderTopThree } = await import('../lib/cards/topThreeCard.js')
const F = await import('../lib/cards/topThreeFixtures.js')

const sets = {
  'three-nhl': F.TEST_MODEL('nhl'),
  'three-nfl': F.TEST_MODEL('nfl', [F.TEST_LEGEND, { ...F.TEST_STAR, line: '151 RUSH YDS' }, { ...F.TEST_STAR_2, line: '3 TOUCHDOWNS' }]),
  'two-mlb': F.TEST_MODEL('mlb', [{ ...F.TEST_ELITE, line: '3 HOME RUNS' }, { ...F.TEST_STAR, line: '2 HOME RUNS' }]),
  'one-nhl': F.TEST_MODEL('nhl', [F.TEST_STAR]),
  'stress': F.TEST_MODEL('nhl', F.TEST_STRESS),
}
for (const [name, model] of Object.entries(sets)) {
  const png = await renderTopThree(model, { width: 1080 })
  writeFileSync(`${out}/${name}.png`, png)
  console.log(`${name}.png  ${png.length} bytes`)
}
