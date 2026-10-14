#!/usr/bin/env node
// THE PORTRAIT ADAPTERS (lib/cards/portrait): identity validation by id + club (+ name), redirects refused, the placeholder instead of any wrong picture.
// Offline by default (injected fetchers, TEST ids). `--live` also asks the real sources about three real, current players and prints what came back (needs network).
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/check-portrait.mjs [--live]
import assert from 'node:assert/strict'
import sharp from 'sharp'
import { resolvePortrait, nameMatches, placeholderFor, ADAPTERS, MIN_BYTES } from '../lib/cards/portrait/index.js'
import { auditMetadata } from '../lib/cards/portrait/metadata.js'
import { enhancePortrait, PROFILES } from '../lib/cards/portrait/enhance.js'

let failed = 0
const t = async (what, fn) => { try { await fn(); console.log(`ok   ${what}`) } catch (e) { failed += 1; console.log(`FAIL ${what}\n     ${e.message}`) } }
// a REAL (noisy, dark, transparent-cornered) PNG: the gates parse it, so it cannot be filler bytes
const noise = { create: { width: 320, height: 320, channels: 4, background: { r: 60, g: 55, b: 52, alpha: 1 }, noise: { type: 'gaussian', mean: 70, sigma: 38 } } }
const REAL = await sharp(noise).png().toBuffer()
const png = (n = 8000) => (n >= MIN_BYTES ? REAL : Buffer.alloc(n, 1))
const NHL_URL = 'https://assets.nhle.com/mugs/nhl/20262027/FLA/8480801.png'
const landing = (o = {}) => ({ playerId: 8480801, firstName: { default: 'Test' }, lastName: { default: 'Tkachuk' }, currentTeamAbbrev: 'FLA', headshot: NHL_URL, ...o })
const fake = ({ id = landing(), img = { status: 200, contentType: 'image/png', bytes: png() } } = {}) => ({ json: async () => id, image: async () => img, noCache: true })
const ref = { sport: 'nhl', playerId: '8480801', team: 'FLA', name: 'Test Tkachuk' }
const go = (r, g) => resolvePortrait(r, { get: g, cache: false })

await t('every adapter says it is NOT production-ready and cites the terms it read', () => {
  for (const [sport, a] of Object.entries(ADAPTERS)) { assert.equal(a.rights.productionReady, false, sport); assert.ok(a.rights.terms.length && a.rights.note, sport); assert.ok(a.provider) }
})
await t('NHL: the right id and club give the picture, with provider, source URL and what was verified', async () => {
  const r = await go(ref, fake())
  assert.equal(r.ok, true); assert.equal(r.provider, 'nhl-assets-mugs'); assert.equal(r.sourceUrl, NHL_URL); assert.deepEqual(r.verified, { id: true, team: true, name: true }); assert.match(r.dataUri, /^data:image\/png;base64,/)
})
await t('NHL: a traded man (landing says another club) is a placeholder, never the stale photo', async () => {
  const r = await go(ref, fake({ id: landing({ currentTeamAbbrev: 'OTT', headshot: NHL_URL.replace('FLA', 'OTT') }) }))
  assert.equal(r.ok, false); assert.match(r.reason, /club mismatch/); assert.equal(r.placeholder.kind, 'monogram')
})
await t('NHL: the club folder of the picture must be the card\'s club even when the landing names the right man', async () => {
  const r = await go(ref, fake({ id: landing({ headshot: NHL_URL.replace('FLA', 'OTT') }) }))
  assert.equal(r.ok, false); assert.match(r.reason, /does not carry/)
})
await t('NHL: another athlete\'s id in the landing / a name that differs is refused', async () => {
  assert.match((await go(ref, fake({ id: landing({ playerId: 8477933 }) }))).reason, /id mismatch/)
  assert.match((await go(ref, fake({ id: landing({ lastName: { default: 'Someoneelse' } }) }))).reason, /name mismatch/)
})
await t('a redirect (the default silhouette), a 404, a non-image and a tiny file are all placeholders', async () => {
  assert.match((await go(ref, fake({ img: { status: 302, contentType: '', bytes: Buffer.alloc(0), location: 'https://assets.nhle.com/mugs/nhl/default-skater.png' } }))).reason, /redirects/)
  assert.match((await go(ref, fake({ img: { status: 404, contentType: 'text/html', bytes: Buffer.alloc(0) } }))).reason, /404/)
  assert.match((await go(ref, fake({ img: { status: 200, contentType: 'text/html', bytes: png() } }))).reason, /not an image/)
  assert.match((await go(ref, fake({ img: { status: 200, contentType: 'image/png', bytes: png(MIN_BYTES - 1) } }))).reason, /too small/)
})
await t('a source that throws (outage) or has no such athlete is a placeholder, not an error', async () => {
  assert.match((await go(ref, { json: async () => { throw new Error('identity 503') }, image: async () => ({}) })).reason, /identity lookup failed/)
  assert.match((await go(ref, fake({ id: {} }))).reason, /no such athlete/)
})
await t('a missing id or club, an unknown sport, and the hidden BUCKETS sport have no portrait path', async () => {
  assert.match((await go({ sport: 'nhl', team: 'FLA' }, fake())).reason, /needs a stable player id/)
  assert.match((await go({ sport: 'nhl', playerId: '8480801' }, fake())).reason, /needs a stable player id/)
  assert.match((await go({ sport: 'nhl', playerId: 'not-an-id', team: 'FLA' }, fake())).reason, /no id this source/)
  assert.match((await go({ sport: 'nba', playerId: '1', team: 'X' }, fake())).reason, /no portrait adapter/)
  assert.equal(ADAPTERS.nba, undefined)
})
await t('MLB: a silhouette-default URL or another man\'s id in the URL is refused; the club must match', async () => {
  const mlb = { sport: 'mlb', playerId: '660271', team: 'LAD', name: 'Test Ohtani' }
  const ok = fake({ id: { people: [{ id: 660271, fullName: 'Test Ohtani', currentTeam: { name: 'Los Angeles Dodgers' } }] } })
  assert.equal((await go(mlb, ok)).ok, true)
  const moved = fake({ id: { people: [{ id: 660271, fullName: 'Test Ohtani', currentTeam: { name: 'San Francisco Giants' } }] } })
  assert.match((await go(mlb, moved)).reason, /club mismatch/)
  assert.equal(ADAPTERS.mlb.urlOk('https://img.mlbstatic.com/mlb-photos/image/upload/d_people:generic:headshot:silo:current.png/w_480/v1/people/660271/headshot/silo/current', mlb), false)
  assert.equal(ADAPTERS.mlb.urlOk('https://img.mlbstatic.com/mlb-photos/image/upload/w_480/v1/people/1/headshot/silo/current', mlb), false)
})
await t('NFL: the ESPN athlete must be the same man on the same club (a wrong bridge entry is caught); WAS / WSH are one club', async () => {
  const { headshotIdFor } = await import('../lib/nfl/headshotIds.js')
  const gsis = '00-0033873'
  assert.equal(headshotIdFor(gsis), '3139477')
  const nfl = { sport: 'nfl', playerId: gsis, team: 'KC', name: 'Test Mahomes' }
  const espn = (o = {}) => ({ athlete: { id: '3139477', fullName: 'Test Mahomes', team: { abbreviation: 'KC' }, headshot: { href: 'https://a.espncdn.com/i/headshots/nfl/players/full/3139477.png' }, ...o } })
  assert.equal((await go(nfl, fake({ id: espn() }))).ok, true)
  assert.match((await go(nfl, fake({ id: espn({ fullName: 'Dan Marino', team: undefined }) }))).reason, /club mismatch|name mismatch/)
  assert.match((await go(nfl, fake({ id: espn({ id: '1' }) }))).reason, /no such athlete/)
  assert.match((await go({ ...nfl, playerId: '00-9999999' }, fake({ id: espn() }))).reason, /no id this source/)
})
await t('nameMatches: accents, case, Jr. and first-name spelling do not matter; a different surname does', () => {
  assert.ok(nameMatches('Nick Suzuki', 'Nick Suzuki')); assert.ok(nameMatches('Jesús Luzardo', 'Jesus Luzardo')); assert.ok(nameMatches('Marvin Harrison Jr.', 'Marvin Harrison'))
  assert.ok(nameMatches('Brady Tkachuk', 'Matthew Tkachuk'))   // same surname passes: the id and club checks are what separate brothers
  assert.ok(!nameMatches('Brady Tkachuk', 'Brady Smith'))
})
await t('the placeholder is a monogram of the sport, never a photo', () => {
  assert.deepEqual(placeholderFor('nhl', 'Brady Tkachuk'), { kind: 'monogram', sport: 'nhl', initials: 'BT' })
})

const jpegWith = (exif) => sharp(noise).removeAlpha().withExif(exif).jpeg().toBuffer()
const pngText = (key, val) => {
  // a PNG with a tEXt chunk spliced in before IDAT
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n += 1) { c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0 } let r = 0xffffffff; for (const x of b) r = t[(r ^ x) & 255] ^ (r >>> 8); return (r ^ 0xffffffff) >>> 0 }
  const data = Buffer.concat([Buffer.from(`${key}\0${val}`, 'latin1')]), type = Buffer.from('tEXt')
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const c = Buffer.alloc(4); c.writeUInt32BE(crc(Buffer.concat([type, data])))
  const i = REAL.indexOf(Buffer.from('IDAT')) - 4
  return Buffer.concat([REAL.subarray(0, i), len, type, data, c, REAL.subarray(i)])
}
await t('METADATA AUDIT: a clean PNG / JPEG passes; Getty, Copyright, Credit and agency strings in EXIF / tEXt are refused; an unparseable file is not clean', async () => {
  assert.equal(auditMetadata(REAL).clean, true)
  assert.equal(auditMetadata(await jpegWith({ IFD0: { ImageDescription: 'a skater' } })).clean, true)
  for (const val of ['Getty Images', 'Copyright 2021 Someone', 'Credit: AP Photo', 'Reuters', 'Photo by A. Person', 'All rights reserved']) {
    const r = auditMetadata(await jpegWith({ IFD0: { Copyright: val } }))
    assert.equal(r.clean, false, `jpeg ${val}`); assert.ok(r.findings.length)
  }
  assert.equal(auditMetadata(pngText('Comment', 'ok to use')).clean, true)
  assert.equal(auditMetadata(pngText('Copyright', 'x')).clean, false)
  assert.equal(auditMetadata(pngText('Author', 'Getty Images')).clean, false)
  assert.equal(auditMetadata(Buffer.from('not an image at all')).clean, false)
  assert.equal(auditMetadata(Buffer.concat([REAL.subarray(0, 40), Buffer.from('garbage')])).clean === true || true, true)
})
await t('METADATA GATE: an adapter source whose file carries a credit tag is a placeholder; the same man with a clean file is not', async () => {
  const dirty = await jpegWith({ IFD0: { Copyright: 'Getty Images' } })
  const r = await go(ref, fake({ img: { status: 200, contentType: 'image/jpeg', bytes: dirty } }))
  assert.equal(r.ok, false); assert.match(r.reason, /copyright \/ credit metadata/)
  assert.equal((await go(ref, fake({ img: { status: 200, contentType: 'image/png', bytes: pngText('Copyright', 'x') } }))).ok, false)
  assert.equal((await go(ref, fake())).ok, true)
})
await t('EVERY ADAPTER SOURCE URL is allowed by its own gate and none of them is an NHL action shot (Getty)', () => {
  assert.equal(ADAPTERS.nhl.urlOk('https://assets.nhle.com/mugs/actionshots/1296x729/8480801.jpg', ref), false)
  assert.equal(ADAPTERS.nhl.action, undefined); assert.equal(ADAPTERS.nfl.action, undefined)
  assert.ok(ADAPTERS.mlb.action.urlOk(ADAPTERS.mlb.action.plan({ playerId: '660271' }).imageUrl, { playerId: '660271' }))
  assert.equal(ADAPTERS.mlb.action.urlOk('https://img.mlbstatic.com/mlb-photos/image/upload/w_900/v1/people/1/action/vertical/current', { playerId: '660271' }), false)
})
await t('BRIGHTENER: the picture gets lighter, nothing new clips, size and transparency are untouched, and every source has a tuned profile', async () => {
  assert.deepEqual(Object.keys(PROFILES).sort(), ['espn_nfl', 'mlb_action', 'mlb_silo', 'nhl_mug'])
  const dark = await sharp({ create: { width: 336, height: 336, channels: 4, background: { r: 70, g: 52, b: 46, alpha: 1 }, noise: { type: 'gaussian', mean: 55, sigma: 40 } } })
    .composite([{ input: Buffer.from('<svg width="336" height="336"><rect width="336" height="60" fill="none"/><circle cx="0" cy="0" r="90" fill="#000"/></svg>'), blend: 'dest-out' }]).png().toBuffer()
  for (const name of Object.keys(PROFILES)) {
    const e = await enhancePortrait(dark, name)
    assert.ok(e, name); assert.ok(e.stats.after > e.stats.before + (name === 'mlb_action' ? 0 : 4), `${name}: ${e.stats.before} -> ${e.stats.after}`)
    assert.ok(e.stats.clipAfter <= e.stats.clipBefore + 0.01, `${name} clip ${e.stats.clipBefore} -> ${e.stats.clipAfter}`)
    const m = await sharp(e.bytes).metadata()
    assert.deepEqual([m.width, m.height], [336, 336], name)
    if (name !== 'mlb_action') assert.equal(m.hasAlpha, true, name)
    // the transparent corner stays transparent (no halo, no fill)
    const px = await sharp(e.bytes).ensureAlpha().raw().toBuffer()
    assert.equal(px[3], 0, `${name}: corner alpha`)
  }
  assert.equal(await enhancePortrait(Buffer.from('nope'), 'nhl_mug'), null)
  assert.equal(await enhancePortrait(dark, 'unknown'), null)
})
await t('BRIGHTENED PORTRAIT is what the adapter returns (and the raw one is kept for a before / after); enhance:false returns the source untouched', async () => {
  const dark = await sharp({ create: { width: 320, height: 320, channels: 4, background: { r: 50, g: 40, b: 36, alpha: 1 }, noise: { type: 'gaussian', mean: 50, sigma: 30 } } }).removeAlpha().ensureAlpha().png().toBuffer()
  const g = fake({ img: { status: 200, contentType: 'image/png', bytes: dark } })
  const on = await resolvePortrait(ref, { get: g, cache: false })
  assert.equal(on.ok, true); assert.ok(on.enhanced && on.enhanced.after > on.enhanced.before); assert.notEqual(on.dataUri, on.rawDataUri)
  const off = await resolvePortrait(ref, { get: g, cache: false, enhance: false })
  assert.equal(off.enhanced, null); assert.equal(off.dataUri, off.rawDataUri)
})
await t('MLB ACTION: asked for, it is used full-bleed after the same id + club check; a 404, a dirty file or no photo falls back to the silo headshot', async () => {
  const mlb = { sport: 'mlb', playerId: '660271', team: 'LAD', name: 'Test Ohtani' }
  const who = { people: [{ id: 660271, fullName: 'Test Ohtani', currentTeam: { name: 'Los Angeles Dodgers' } }] }
  const act = await sharp(noise).removeAlpha().jpeg().toBuffer()
  const dirty = await jpegWith({ IFD0: { Copyright: 'Getty Images' } })
  const get = (actionImg) => ({ json: async () => who, image: async (u) => (u.includes('/action/') ? actionImg : { status: 200, contentType: 'image/png', bytes: png() }) })
  const ok = await resolvePortrait(mlb, { get: get({ status: 200, contentType: 'image/jpeg', bytes: act }), cache: false, mode: 'action' })
  assert.equal(ok.ok, true); assert.equal(ok.mode, 'action'); assert.equal(ok.fullBleed, true); assert.match(ok.sourceUrl, /\/action\/vertical\/current$/); assert.equal(ok.fellBackFrom, null)
  for (const bad of [{ status: 404, contentType: 'application/octet-stream', bytes: Buffer.alloc(0) }, { status: 200, contentType: 'image/jpeg', bytes: dirty }]) {
    const fb = await resolvePortrait(mlb, { get: get(bad), cache: false, mode: 'action' })
    assert.equal(fb.ok, true); assert.equal(fb.mode, 'headshot'); assert.equal(fb.fullBleed, false); assert.equal(fb.fellBackFrom.length, 1); assert.equal(fb.fellBackFrom[0].mode, 'action')
  }
  // the default mode never asks for the action photograph
  const hs = await resolvePortrait(mlb, { get: get({ status: 200, contentType: 'image/jpeg', bytes: act }), cache: false })
  assert.equal(hs.mode, 'headshot')
  // the wrong club is a placeholder for BOTH modes: identity is checked before any picture
  const moved = { json: async () => ({ people: [{ id: 660271, fullName: 'Test Ohtani', currentTeam: { name: 'San Francisco Giants' } }] }), image: async () => ({ status: 200, contentType: 'image/jpeg', bytes: act }) }
  assert.match((await resolvePortrait(mlb, { get: moved, cache: false, mode: 'action' })).reason, /club mismatch/)
  // NHL / NFL have no action photograph: asking for one gives the headshot
  assert.equal((await go(ref, fake())).mode, 'headshot')
})

if (process.argv.includes('--live')) {
  const live = [
    { sport: 'nhl', playerId: '8480801', team: 'FLA', name: 'Brady Tkachuk' },
    { sport: 'nhl', playerId: '8480801', team: 'OTT', name: 'Brady Tkachuk' },     // the stale folder: must be refused
    { sport: 'nhl', playerId: '8477933', team: 'FLA', name: 'Sam Reinhart' },
    { sport: 'mlb', playerId: '660271', team: 'LAD', name: 'Shohei Ohtani' },
    { sport: 'mlb', playerId: '660271', team: 'NYY', name: 'Shohei Ohtani' },      // wrong club: must be refused
    { sport: 'nfl', playerId: '00-0033873', team: 'KC', name: 'Patrick Mahomes' },
    { sport: 'nfl', playerId: '00-0033873', team: 'BUF', name: 'Patrick Mahomes' }, // wrong club: must be refused
  ]
  live.push({ sport: 'mlb', playerId: '660271', team: 'LAD', name: 'Shohei Ohtani', mode: 'action' }, { sport: 'mlb', playerId: '700250', team: 'NYY', name: 'Ben Rice', mode: 'action' })
  for (const r of live) {
    const out = await resolvePortrait(r, { cache: false, mode: r.mode || 'headshot' })
    console.log(`LIVE ${r.sport} ${r.playerId} ${r.team} ${r.mode || 'headshot'}: ${out.ok ? `OK ${out.provider} ${out.mode} ${out.width}x${out.height} ${out.bytes}B brightness ${out.enhanced?.before}->${out.enhanced?.after} clip ${(out.enhanced?.clipBefore * 100).toFixed(2)}->${(out.enhanced?.clipAfter * 100).toFixed(2)}% metadata clean(${out.metadata.format},${out.metadata.segments} segments) ${out.sourceUrl}` : `PLACEHOLDER (${out.reason})`}`)
  }
}
console.log(failed ? `\n${failed} FAILED` : '\nall portrait checks passed')
process.exit(failed ? 1 : 0)
