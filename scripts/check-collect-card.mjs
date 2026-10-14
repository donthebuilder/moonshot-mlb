#!/usr/bin/env node
// THE COLLECTIBLE FRAME (lib/cards/collect): 5:7 ratio, each tier's finish density within its cap, the type floor, no grade / population / serial words, the issue slot reads PREVIEW,
// the four tiers really differ, a placeholder (never a face) when there is no portrait, and nothing links to the preview route. TEST rows only; no network, no database.
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/check-collect-card.mjs
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { W, H, RATIO, LOOK, MAX_DENSITY, collectLayers, collectDesign, renderCollect } from '../lib/cards/collect/collectCard.js'
import { collectModel, variantFor } from '../lib/cards/collect/collectData.js'
import { faceBrightness } from '../lib/cards/collect/faceCheck.js'
import { enhancePortrait } from '../lib/cards/portrait/enhance.js'
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
const hat = F.TEST_HAT
const c = await collectModel('nhl_hat_trick', hat, { test: true })

await t('the frame is exactly 2.5 : 3.5 (1000 x 1400), unlike the special card\'s 4:5', () => {
  assert.equal(W / H, 2.5 / 3.5); assert.equal(RATIO, 5 / 7); assert.notEqual(W / H, 1080 / 1350)
})
await t('finish density: BASE 0, STAR 3 (frame, one sheen, badge), ELITE <= 11, LEGEND <= 12, and each tier has more than the one below', () => {
  for (const tier of TIERS) assert.ok(collectLayers(tier).length <= MAX_DENSITY[tier], tier)
  assert.equal(collectLayers('base').length, 0); assert.equal(collectLayers('star').length, 3)
  assert.ok(collectLayers('elite').length > collectLayers('star').length && collectLayers('legend').length > collectLayers('star').length)
  assert.ok(collectLayers('legend').includes('corner-ornaments') && !collectLayers('elite').includes('corner-ornaments'))
  assert.equal(collectLayers('star').filter((l) => /frame/.test(l)).length, 1, 'STAR: ONE foil frame')
  assert.equal(collectLayers('star').filter((l) => /sheen/.test(l)).length, 1, 'STAR: ONE sheen band'); assert.ok(collectLayers('star').includes('badge') && collectLayers('elite').includes('badge') && collectLayers('legend').includes('badge') && !collectLayers('base').includes('badge'))
})
await t('the border geometry is in the table for every tier (inset and radius), LEGEND the widest', () => {
  for (const tier of TIERS) assert.ok(LOOK[tier].inset >= 28 && LOOK[tier].radius >= 30)
  assert.ok(LOOK.legend.inset > LOOK.base.inset)
})
await t('the type floor: no text node under 22 px at the design size, in every tier', () => {
  for (const tier of TIERS) assert.deepEqual(lintType(collectDesign(c.model, '', { tier })), [], tier)
})
await t('no grade, population, serial or value words on any tier; the issue slot says PREVIEW; the card id is real', () => {
  for (const tier of TIERS) {
    const all = text(collectDesign(c.model, '', { tier })).join(' ')
    assert.doesNotMatch(all, /\b(GEM|MINT|PSA|BGS|SGC|POP|GRADE|GRADED|MT 10|SERIAL|RARE DROP|WORTH|VALUE|\$)\b/i, tier)
    assert.doesNotMatch(all, /\d+\s*\/\s*\d+/, `${tier}: no "n/250" serial`)
    assert.match(all, /ISSUE NO\. PREVIEW/); assert.match(all, /ID DN-[0-9A-F]{12}/)
  }
})
await t('a TEST row says TEST DATA and wears the placeholder, never a face', () => {
  const all = text(collectDesign(c.model, '', { tier: 'legend' })).join(' ')
  assert.match(all, /TEST DATA/); assert.ok(c.model.placeholder && c.model.placeholder.kind === 'monogram'); assert.equal(c.model.face, '')
})
await t('a tier the event did not earn says so on the card (STYLE PREVIEW), and an earned tier does not', async () => {
  const style = await collectModel('nhl_hat_trick', hat, { test: true, styleOnly: true })
  assert.match(text(collectDesign(style.model, '', { tier: 'legend' })).join(' '), /STYLE PREVIEW/)
  assert.doesNotMatch(text(collectDesign(c.model, '', { tier: 'elite' })).join(' '), /STYLE PREVIEW/)
})
await t('a row that earns no tier makes no card (2 goals is not a hat trick)', async () => {
  assert.equal(await collectModel('nhl_hat_trick', { ...hat, goals: hat.goals.slice(0, 2) }, { test: true }), null)
})
await t('every tier renders a 1000 x 1400 PNG, the four are different pictures, and a smaller width keeps 5:7', async () => {
  const sharp = (await import('sharp')).default
  const hashes = new Set()
  for (const tier of TIERS) {
    const png = await renderCollect(c.model, { tier })
    const m = await sharp(png).metadata()
    assert.deepEqual([m.width, m.height], [W, H], tier)
    hashes.add(createHash('sha256').update(png).digest('hex'))
  }
  assert.equal(hashes.size, 4)
  const small = await sharp(await renderCollect(c.model, { tier: 'star', width: 500 })).metadata()
  assert.deepEqual([small.width, small.height], [500, 700])
})
await t('the same event looks different from another event (the ice is seeded by the card id), and the same event twice is identical', async () => {
  const a = await renderCollect(c.model, { tier: 'base' })
  const again = await renderCollect(c.model, { tier: 'base' })
  const other = await collectModel('nhl_hat_trick', { ...hat, game_id: 9 }, { test: true })
  const b = await renderCollect(other.model, { tier: 'base' })
  assert.ok(a.equals(again)); assert.ok(!a.equals(b))
})
await t('an MLB card (TEST row) renders in all four tiers, with a full-bleed action picture and with the placeholder', async () => {
  const sharp = (await import('sharp')).default
  const photo = await sharp({ create: { width: 450, height: 675, channels: 3, background: { r: 90, g: 110, b: 80 }, noise: { type: 'gaussian', mean: 100, sigma: 40 } } }).jpeg().toBuffer()
  const mlb = await collectModel('mlb_multi_hr', F.TEST_MULTI_HR, { test: true })
  assert.match(text(collectDesign(mlb.model, '', { tier: 'elite' })).join(' '), /3-HOMER GAME/)
  for (const tier of TIERS) {
    assert.ok((await renderCollect(mlb.model, { tier })).length > 1000, `placeholder ${tier}`)
    const withPhoto = { ...mlb.model, face: `data:image/jpeg;base64,${photo.toString('base64')}`, portraitMode: 'action', placeholder: null }
    assert.deepEqual(lintType(collectDesign(withPhoto, '', { tier })), [], tier)
    assert.ok((await renderCollect(withPhoto, { tier })).length > 1000, `action ${tier}`)
  }
})
await t('VARIETY: the same card id and tier always give the same photograph and view; the four tiers of one MLB card show four different kinds, and NHL / NFL (one photo) four different views', () => {
  const a = variantFor({ sport: 'mlb', cardId: 'DN-AAAAAAAAAAAA', tier: 'elite' })
  assert.deepEqual(a, variantFor({ sport: 'mlb', cardId: 'DN-AAAAAAAAAAAA', tier: 'elite' }))
  for (const id of ['DN-AAAAAAAAAAAA', 'DN-6EFE5ABF4D6F', 'DN-0123456789AB', 'DN-FFFFFFFFFFFF']) {
    assert.equal(new Set(TIERS.map((tier) => variantFor({ sport: 'mlb', cardId: id, tier }).kind)).size, 4, `mlb kinds ${id}`)
    for (const sport of ['nhl', 'nfl', 'mlb']) assert.equal(new Set(TIERS.map((tier) => JSON.stringify(variantFor({ sport, cardId: id, tier }).view))).size, 4, `${sport} views ${id}`)
    assert.deepEqual(new Set(TIERS.map((tier) => variantFor({ sport: 'nhl', cardId: id, tier }).kind)), new Set(['headshot']))
  }
  // another card id starts the rotation somewhere else (not every card begins with the same picture)
  const firsts = new Set(Array.from({ length: 24 }, (_, i) => variantFor({ sport: 'mlb', cardId: `DN-${i}`, tier: 'base' }).kind))
  assert.ok(firsts.size >= 3)
})
await t('NO TIER DARKENS THE FACE: for every layout (cut-out, full-bleed, studio) and every tier, the face box of the finished card is at least 97% as bright as the raw photo', async () => {
  const sharp = (await import('sharp')).default
  const mk = async (w, h, alphaOn) => {
    const base = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 96, g: 78, b: 68 }, noise: { type: 'gaussian', mean: 100, sigma: 22 } } }).removeAlpha().ensureAlpha().png().toBuffer()
    return base
  }
  const layouts = [
    { layout: 'cutout', mode: 'headshot', w: 336, h: 336, face: { x0: 0.36, y0: 0.24, x1: 0.64, y1: 0.52 }, profile: 'nhl_mug' },
    { layout: 'cutout', mode: 'headshot', w: 600, h: 436, face: { x0: 0.4, y0: 0.14, x1: 0.62, y1: 0.46 }, profile: 'espn_nfl' },
    { layout: 'bleed', mode: 'action', w: 900, h: 1350, face: { x0: 0.3, y0: 0.02, x1: 0.78, y1: 0.3 }, profile: 'mlb_action' },
    { layout: 'bleed', mode: 'hero', w: 930, h: 760, face: { x0: 0.3, y0: 0, x1: 0.8, y1: 0.45 }, profile: 'mlb_hero' },
    { layout: 'studio', mode: 'studio', w: 600, h: 901, face: { x0: 0.3, y0: 0.3, x1: 0.7, y1: 0.7 }, profile: 'mlb_studio' },
  ]
  for (const L of layouts) {
    const raw = await mk(L.w, L.h)
    const enh = await enhancePortrait(raw, L.profile)
    const mime = enh.contentType
    for (const tier of TIERS) {
      for (const sport of ['nhl', 'mlb']) {
        const base = await collectModel(sport === 'nhl' ? 'nhl_hat_trick' : 'mlb_multi_hr', sport === 'nhl' ? hat : F.TEST_MULTI_HR, { test: true, tier })
        const model = { ...base.model, face: `data:${mime};base64,${enh.bytes.toString('base64')}`, rawUri: `data:image/png;base64,${raw.toString('base64')}`, placeholder: null, portraitLayout: L.layout, portraitMode: L.mode, portraitFace: L.face, portraitBg: L.layout === 'studio' ? [100, 100, 100] : null, view: variantFor({ sport, cardId: base.id.cardId, tier }).view }
        model.collect = { ...model.collect, portrait: { width: L.w, height: L.h } }
        const png = await renderCollect(model, { tier })
        const fb = await faceBrightness(model, tier, png, model.rawUri)
        assert.ok(fb, `${L.mode}/${tier}: measured`)
        assert.ok(fb.ratio >= 0.97, `${L.layout}/${L.mode}/${sport}/${tier}: face ${fb.raw} -> ${fb.card} (x${fb.ratio})`)
      }
    }
  }
})
await t('NFL and LONG-SHOT cards (TEST rows): every tier renders; the NFL frame wears the turf; the long shot prints the pre-game price chip and its price', async () => {
  const nfl = await collectModel('nfl_100_yards', F.TEST_100, { test: true })
  const multi = await collectModel('nfl_multi_td', F.TEST_MULTI_TD, { test: true })
  const shot = await collectModel('long_shot_cashed', { ...F.TEST_LONG_SHOT, price_source: 'lock', best: 1520, books: 4 }, { test: true })
  assert.equal(shot.earned, 'elite')
  const noLock = await collectModel('long_shot_cashed', { ...F.TEST_LONG_SHOT, price_source: 'latest', best: 1520, books: 4 }, { test: true })
  assert.equal(noLock, null, 'a price that is not the lock snapshot earns no card')
  assert.match(text(collectDesign(shot.model, '', { tier: 'elite' })).join(' '), /PRICE LISTED PRE-GAME/)
  assert.match(text(collectDesign(shot.model, '', { tier: 'elite' })).join(' '), /\+1520/)
  assert.doesNotMatch(text(collectDesign(nfl.model, '', { tier: 'star' })).join(' '), /PRICE LISTED/)
  shot.model.collect.issue = ''   // a real card whose table has no row: the issue line is left off, the card still draws
  assert.doesNotMatch(text(collectDesign(shot.model, '', { tier: 'elite' })).join(' '), /ISSUE NO/)
  for (const c of [nfl, multi, shot]) for (const tier of TIERS) {
    assert.deepEqual(lintType(collectDesign(c.model, '', { tier })), [], `${c.model.moment.key} ${tier}`)
    assert.ok((await renderCollect(c.model, { tier, width: 500 })).length > 1000)
  }
})
await t('THE POST PATH: moment posts draw the collect card (1000 x 1400) with the issue label, and a moment the v2 rules do not know falls back to the old 4:5 card', async () => {
  const sharp = (await import('sharp')).default
  const { MOMENT_SENDERS } = await import('../lib/posts/momentPost.js')
  const ev = (moment, row) => ({ moment, row, who: { name: row.name, team: row.team, opp: row.opp, playerId: String(row.player_id) } })
  const db = { from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data: [{ issue_no: 7, status: 'issued' }], error: null }) }) }) }) }
  const r = await MOMENT_SENDERS.render(ev('nhl_hat_trick', F.TEST_HAT), db)
  const m = await sharp(r.png).metadata()
  assert.deepEqual([m.width, m.height], [1000, 1400]); assert.equal(r.model.collect.issue, '7')
  const legacy = await MOMENT_SENDERS.render(ev('long_shot_cashed', { ...F.TEST_LONG_SHOT, price_source: 'latest', best: 1520, books: 4 }), db)
  const lm = await sharp(legacy.png).metadata()
  assert.deepEqual([lm.width, lm.height], [1080, 1350])
})
await t('the preview route is not linked from anywhere (app, components, lib, scripts other than the previews)', () => {
  const hits = []
  const walk = (dir) => {
    for (const f of readdirSync(dir)) {
      if (f === 'node_modules' || f.startsWith('.')) continue
      const p = `${dir}/${f}`
      if (statSync(p).isDirectory()) { walk(p); continue }
      if (!/\.(js|jsx|mjs)$/.test(f) || p.includes('check-collect-card')) continue
      if (readFileSync(p, 'utf8').includes('/api/card/collect')) hits.push(p)
    }
  }
  for (const d of ['app', 'components', 'lib']) walk(d)
  assert.deepEqual(hits, [])
})

console.log(failed ? `\n${failed} FAILED` : '\nall collect-card checks passed')
process.exit(failed ? 1 : 0)
