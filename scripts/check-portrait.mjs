#!/usr/bin/env node
// THE PORTRAIT ADAPTERS (lib/cards/portrait): identity validation by id + club (+ name), redirects refused, the placeholder instead of any wrong picture.
// Offline by default (injected fetchers, TEST ids). `--live` also asks the real sources about three real, current players and prints what came back (needs network).
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/check-portrait.mjs [--live]
import assert from 'node:assert/strict'
import { resolvePortrait, nameMatches, placeholderFor, ADAPTERS, MIN_BYTES } from '../lib/cards/portrait/index.js'

let failed = 0
const t = async (what, fn) => { try { await fn(); console.log(`ok   ${what}`) } catch (e) { failed += 1; console.log(`FAIL ${what}\n     ${e.message}`) } }
const png = (n = 8000) => Buffer.alloc(n, 1)
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
  for (const r of live) {
    const out = await resolvePortrait(r, { cache: false })
    console.log(`LIVE ${r.sport} ${r.playerId} ${r.team}: ${out.ok ? `OK ${out.provider} ${out.width}x${out.height} ${out.bytes}B ${out.sourceUrl}` : `PLACEHOLDER (${out.reason})`}`)
  }
}
console.log(failed ? `\n${failed} FAILED` : '\nall portrait checks passed')
process.exit(failed ? 1 : 0)
