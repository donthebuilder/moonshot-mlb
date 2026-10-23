#!/usr/bin/env node
// THE COLLECTIBLE BACK (lib/cards/collect/collectBack.js): 5:7 in every tier and both faces, the type floor, no grade / population / serial words (the mock's "1/250" is NOT drawn),
// the real card id and the issue slot on both faces, the stat table's rows and totals present, BUCKETS never on the brand back, the eight pictures differ. TEST rows only; no network, no database.
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/check-collect-back.mjs
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { W, H } from '../lib/cards/collect/collectCard.js'
import { collectBackDesign, renderCollectBack, BRAND_SPORTS, backGeometry, FACES } from '../lib/cards/collect/collectBack.js'
import { collectBackModel, EMPTY_BACK } from '../lib/cards/collect/collectBackData.js'
import { lintType } from '../lib/cards/cardKit.js'
import { TIERS } from '../lib/cards/moments.js'
import * as F from '../lib/cards/specialFixtures.js'

let failed = 0
const t = async (what, fn) => { try { await fn(); console.log(`ok   ${what}`) } catch (e) { failed += 1; console.log(`FAIL ${what}\n     ${e.message}`) } }
const text = (node, out = []) => {
  if (node == null || typeof node === 'boolean') return out
  if (typeof node === 'string' || typeof node === 'number') { out.push(String(node)); return out }
  if (Array.isArray(node)) { node.forEach((n) => text(n, out)); return out }
  const { type, props = {} } = node
  if (typeof type === 'function') return text(type(props), out)
  text(props.children, out)
  return out
}
const BACK = {
  bio: [['HT / WT', 'TEST'], ['SHOOTS', 'R'], ['BORN', 'TEST'], ['DRAFTED', 'TEST']],
  cols: [['YEAR', 1.25, 'season'], ['TEAM', 1.9, 'tm'], ['GP', 0.95, 'gp'], ['G', 0.9, 'g'], ['A', 0.9, 'a'], ['PTS', 1.1, 'pts']],
  rows: Array.from({ length: 9 }, (_, i) => ({ season: `20${10 + i}-${11 + i}`, tm: 'Test Club', gp: '60', g: '10', a: '12', pts: '22' })),
  career: { season: 'NHL TOTALS', tm: '', gp: '999', g: '98', a: '97', pts: '195' }, playoffs: { season: 'PLAYOFFS', tm: '', gp: '20', g: '5', a: '6', pts: '11' }, title: 'CAREER STATS', note: '', seasonsShown: [], source: 'fixture',
}
const c = await collectBackModel('nhl_hat_trick', F.TEST_HAT, { test: true, back: BACK })

await t('a back model carries the front\'s real card id and a table; a row that earns no card has no back', async () => {
  assert.match(c.id.cardId, /^DN-[0-9A-F]{12}$/); assert.equal(c.model.collect.cardId, c.id.cardId)
  assert.equal(await collectBackModel('nhl_hat_trick', { ...F.TEST_HAT, goals: F.TEST_HAT.goals.slice(0, 2) }, { test: true }), null)
  assert.equal((await collectBackModel('nhl_hat_trick', F.TEST_HAT, { test: true })).back, EMPTY_BACK)
})
await t('the type floor: no text node under 22 px at the design size, every tier and both faces', () => {
  for (const tier of TIERS) for (const face of FACES) assert.deepEqual(lintType(collectBackDesign(c.model, c.back, '', { tier, face })), [], `${tier}/${face}`)
})
await t('no grade, population, serial or value words; no "n/250"; the real id and the issue slot are on both faces', () => {
  for (const tier of TIERS) for (const face of FACES) {
    const all = text(collectBackDesign(c.model, c.back, '', { tier, face })).join(' ')
    assert.doesNotMatch(all, /\b(GEM|MINT|PSA|BGS|SGC|POP|GRADE|GRADED|MT 10|SERIAL|WORTH|VALUE|\$)\b/i, `${tier}/${face}`)
    assert.doesNotMatch(all, /\d+\s*\/\s*\d+/, `${tier}/${face}: no serial`)
    assert.match(all, /ID DN-[0-9A-F]{12}/); assert.match(all, /ISSUE NO\. PREVIEW/)
  }
  c.model.collect.issue = '7'
  assert.match(text(collectBackDesign(c.model, c.back, '', { tier: 'star', face: 'brand' })).join(' '), /ISSUE NO\. 7/)
  c.model.collect.issue = ''
  assert.doesNotMatch(text(collectBackDesign(c.model, c.back, '', { tier: 'star', face: 'stats' })).join(' '), /ISSUE NO/)
  c.model.collect.issue = 'PREVIEW'
})
await t('the stats face prints the latest seasons, the totals row, the playoffs row and the moment; the brand face prints CALLED IT and only the PUBLIC sports', () => {
  const s = text(collectBackDesign(c.model, c.back, '', { tier: 'elite', face: 'stats' })).join(' ')
  assert.match(s, /2018-19/); assert.doesNotMatch(s, /2010-11/); assert.match(s, /NHL TOTALS/); assert.match(s, /PLAYOFFS/); assert.match(s, /THE MOMENT THIS CARD DOCUMENTS/); assert.match(s, /HAT TRICK/)
  const b = text(collectBackDesign(c.model, c.back, '', { tier: 'elite', face: 'brand' })).join(' ')
  assert.match(b, /CALLED IT/); assert.match(b, /DASH NETWORK/); assert.deepEqual(BRAND_SPORTS, ['nhl', 'nfl', 'mlb', 'nba'])   // the public Card sports (BUCKETS since 2026-10-20); a sport with no BANNER_ICON draws no mark (nba: none drawn yet)
})
await t('the table fits: row height >= 44 with the most rows, in every tier', () => {
  for (const tier of TIERS) { const g = backGeometry(BACK, tier); assert.ok(g.rowH >= 44 && g.shown.length === 6, tier) }
})
await t('every tier and face renders a 1000 x 1400 PNG; the eight are different pictures; a smaller width keeps 5:7', async () => {
  const sharp = (await import('sharp')).default
  const hashes = new Set()
  for (const tier of TIERS) for (const face of FACES) {
    const png = await renderCollectBack(c.model, c.back, { tier, face })
    const m = await sharp(png).metadata()
    assert.deepEqual([m.width, m.height], [W, H], `${tier}/${face}`)
    hashes.add(createHash('sha256').update(png).digest('hex'))
  }
  assert.equal(hashes.size, 8)
  const small = await sharp(await renderCollectBack(c.model, c.back, { tier: 'star', width: 500 })).metadata()
  assert.deepEqual([small.width, small.height], [500, 700])
})
await t('every public sport draws (MLB and NFL TEST rows; an empty table says so)', async () => {
  for (const [k, r] of [['mlb_multi_hr', F.TEST_MULTI_HR], ['nfl_multi_td', F.TEST_MULTI_TD], ['nfl_100_yards', F.TEST_100]]) {
    const m = await collectBackModel(k, r, { test: true })
    assert.ok((await renderCollectBack(m.model, m.back, { tier: 'legend' })).length > 1000, k)
    assert.match(text(collectBackDesign(m.model, m.back, '', { tier: 'base' })).join(' '), /No season rows on file/)
  }
})
console.log(failed ? `\n${failed} FAILED` : '\nall ok')
process.exit(failed ? 1 : 0)
