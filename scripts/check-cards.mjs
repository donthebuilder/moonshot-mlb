#!/usr/bin/env node
// THE DOWNLOADABLE CARDS (fix14, 2026-10-08). Renders every PNG card the site
// can make, in a real browser, from labelled TEST data (scripts/card-fixtures.mjs:
// every name says "Test", none of it is a real line), and fails when a card
// breaks the card rules:
//   - 1080 x 1350, one frame; nothing under 24px; no text wider than its box,
//     off the card, or on top of other text; no real name clipped with an ellipsis
//   - status words are exactly STATUS_WORD (CALLED / ON THE BOARD / NOT ON THE BOARD),
//     never a made-up variant ("CALLED IT", "ON THE LAMP BOARD", "OFF THE BOARD")
//   - no developer words (bot, payload, model version), no robot emoji, no URL
//     or hashtag on the card, no printed probability
//   - the footer is "DASH · <product>" from the registry, in each product's accent
//   - a MISS never wears the win look: its stamp and its status chip are not the accent
//   - the shared kit has no sport ternary and the removed cards stay removed
//   node scripts/check-cards.mjs [--out DIR]     (writes a PNG per card for a look)
import { mkdirSync, writeFileSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { withCards } from './_card-harness.mjs'
import { FIX, NHL, NBA } from './card-fixtures.mjs'

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
const OUT = arg('--out') || join(tmpdir(), 'dash-cards')
mkdirSync(OUT, { recursive: true })

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

const rendered = await withCards(async ({ run }) => run(`
  const F = ${JSON.stringify(FIX)}
  const NHL = ${JSON.stringify(NHL)}, NBA = ${JSON.stringify(NBA)}
  const cards = await imp('/lib/cards/cards.js')
  const kit = await imp('/lib/cards/kit.js')
  const H = F.hitters
  const out = {}
  const grab = async (k, card, extra = {}) => {
    const g = card.c.getContext('2d')
    const px = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data.slice(0, 3))
    out[k] = { png: card.c.toDataURL('image/png'), w: card.c.width, h: card.c.height, log: card.log, brand: card.brand, px: { chip: px(${56 + 280 + 10}, ${150 + 62}), stamp: px(76, 600), ring: px(56, 300), stamp2: px(76, 1100), ringLead: px(56, 275) }, ...extra }
  }
  const rows = (list, o = {}) => list.map((p, i) => ({ rank: i + (o.from || 1), name: p.name, team: p.team, opp: p.opp, id: p.player_id, status: ['called', 'board', 'off'][i % 3], score: p.hr_score }))
  await grab('player', await cards.playerCard(H[0], { jersey: 99 }))
  await grab('player-board', await cards.playerCard(H[2], {}))
  await grab('player-noscore', await cards.playerCard({ ...H[3], hr_shape_profile: null, pitcher_name: '' }, {}))
  await grab('watchlist', await cards.rankedCard('mlb', { label: 'MY WATCHLIST', sub: '13 hitters · HR score, MOONSHOT\\'s own ranking', lead: { ...rows(H)[0], scoreLabel: 'HR SCORE', line: 'SZN 27 HR  ·  L5 1 HR  ·  ISO .231  ·  1G SINCE HR' }, rows: rows(H.slice(1), { from: 2 }), total: 13 }))
  await grab('board', await cards.rankedCard('mlb', { label: 'THE BOARD', sub: '13 ranked · TEST · this board is own HR ranking', lead: { ...rows(H)[0], scoreLabel: 'HR SCORE', line: 'x' }, rows: rows(H.slice(1), { from: 2 }), total: 13 }))
  await grab('game', await cards.rankedCard('mlb', { label: 'Game card', sub: 'BOS @ NYY · projected', banner: { away: 'BOS', home: 'NYY', when: '7:05 PM' }, rows: rows(H.slice(0, 6)).map((r) => ({ ...r, tag: 'HRR' })).map((r, i) => i === 1 ? { ...r, result: { text: '1 HR · 2 H', hot: true } } : r), total: 6 }))
  await grab('record', await cards.recordCard('mlb', F.record))
  await grab('pitcher', await cards.pitcherCard('mlb', { ...F.pitcher, id: 1, topBat: H[0] }))
  await grab('pick-pregame', await cards.pickCard('nfl', { ...F.nflPre, status: 'called' }))
  await grab('pick-hit', await cards.pickCard('nfl', { ...F.nflHit, status: 'called' }))
  await grab('pick-miss', await cards.pickCard('nfl', { ...F.nflMiss, status: 'called' }))
  await grab('pick-void', await cards.pickCard('nfl', { ...F.nflVoid, status: 'called' }))
  // the same kit, the other two products (words, emoji and accent come from the registry)
  await grab('lamp-list', await cards.rankedCard('nhl', { label: 'TEST board', sub: 'TEST data', rows: rows(H.slice(0, 4)).map((r) => ({ ...r, team: ['EDM', 'TOR', 'BOS', 'NYR'][r.rank % 4] })), total: 4 }))
  await grab('buckets-list', await cards.rankedCard('nba', { label: 'TEST board', sub: 'TEST data', rows: rows(H.slice(0, 4)).map((r) => ({ ...r, team: ['BOS', 'NY', 'GS', 'LAL'][r.rank % 4] })), total: 4 }))
  // LAMP and BUCKETS on the same kit (fix15): the player card, the ranked list, the game card
  for (const [k, sport, D, word] of [['nhl', 'nhl', NHL, 'goals'], ['nba', 'nba', NBA, 'points']]) {
    await grab(k + '-player', await cards.statPlayerCard(sport, D.player))
    await grab(k + '-player-hit', await cards.statPlayerCard(sport, D.hit))
    await grab(k + '-player-miss', await cards.statPlayerCard(sport, D.miss))
    await grab(k + '-player-void', await cards.statPlayerCard(sport, D.void))
    await grab(k + '-player-off', await cards.statPlayerCard(sport, D.off))
    const [first, ...rest] = D.rows
    await grab(k + '-board', await cards.rankedCard(sport, { label: 'Rankings · TEST', day: '2026-10-08', sub: '212 ranked · TEST data', lead: { ...first, scoreLabel: 'TEST SCORE', line: '3.84 S/GP  ·  0.52 G/GP  ·  21:07 TOI  ·  9 PP G' }, rows: rest, total: 212 }))
    // a graded list whose lead missed: its ring, face and result are the greys, never the accent
    await grab(k + '-board-miss', await cards.rankedCard(sport, { label: 'Rankings · TEST', day: '2026-10-08', sub: 'TEST data', lead: { ...first, result: { text: 'MISS', hot: false }, miss: true, scoreLabel: 'TEST SCORE' }, rows: D.gameRows, total: 4 }))
    await grab(k + '-board-hit', await cards.rankedCard(sport, { label: 'Rankings · TEST', day: '2026-10-08', sub: 'TEST data', lead: { ...first, result: { text: '2 G', hot: true }, scoreLabel: 'TEST SCORE' }, rows: D.gameRows, total: 4 }))
    await grab(k + '-game', await cards.rankedCard(sport, { label: 'Game card', day: '2026-10-08', sub: 'EDM @ CGY · TEST', banner: { away: 'EDM', home: 'CGY', when: '9:00 PM', proj: { label: 'EXPECTED ' + word.toUpperCase(), away: '3.4', home: '2.9', total: '6.3' } }, rows: D.rows.slice(0, 6).map((r, i) => ({ ...r, rank: i + 1 })), total: 6 }))
    await grab(k + '-game-final', await cards.rankedCard(sport, { label: 'Game card', day: '2026-10-08', sub: 'EDM @ CGY · TEST', banner: { away: 'EDM', home: 'CGY', when: 'FINAL 4–2', proj: { label: 'EXPECTED ' + word.toUpperCase(), away: '3.4', home: '2.9', total: '6.3' } }, rows: D.gameRows, total: 4 }))
    await grab(k + '-game-noproj', await cards.rankedCard(sport, { label: 'Game card', day: '2026-10-08', sub: 'EDM @ CGY · TEST', banner: { away: 'EDM', home: 'CGY', when: '9:00 PM' }, rows: D.rows.slice(0, 4), total: 4 }))
  }
  // an absurd name must be logged as clipped, not silently cut
  await grab('long-name', await cards.rankedCard('mlb', { label: 'TEST', rows: [{ rank: 1, name: 'Test Hitter With An Absurdly Long Name That Cannot Possibly Fit On One Row', team: 'NYY', opp: 'BOS', id: 1, status: 'board', score: 50 }], total: 1 }))
  // the registry, as the kit reads it
  const reg = await imp('/lib/routes.js')
  const acc = await imp('/lib/sportAccent.js')
  const brands = Object.fromEntries(['mlb', 'nfl', 'nhl', 'nba'].map((k) => [k, { ...kit.cardBrand(k), regName: reg.BRAND[k].name, regIcon: reg.BRAND[k].icon, regAccent: acc.SPORT_ACCENT[k] }]))
  // the download wrappers end in a PNG on an <a download>
  const saved = []
  HTMLAnchorElement.prototype.click = function () { saved.push({ name: this.download, head: String(this.href).slice(0, 22), href: String(this.href) }) }
  const sc = await imp('/components/shareCard.js')
  const nc = await imp('/components/nfl/shareCard.js')
  await sc.downloadShareCard(H); await sc.downloadPlayerCard(H[0]); await sc.downloadBoardCard(H, { title: 'THE BOARD', type: 'hr' })
  await sc.downloadGameCard({ away: 'BOS', home: 'NYY', players: H.slice(0, 3) }); await sc.downloadTrackRecordCard(F.record)
  await sc.downloadPitcherCard(F.pitcher); await nc.downloadNflPickCard(F.nflHit); await nc.downloadNflPickCard(F.nflPre)
  // LAMP and BUCKETS: the wrappers, fed rows in the shape the tabs hold (TEST names, made-up numbers)
  const lc = await imp('/components/lamp/shareCard.js')
  const bc = await imp('/components/buckets/shareCard.js')
  const nr = (i, team, opp, status, score, extra = {}) => ({ playerId: 7000000 + i, name: 'Test Skater ' + i, pos: 'C', team, opp, status, score, rank: i, legs: { shotsPg: 3.1, goalsPg: 0.41, toi: 1150 }, ppg: 4, context: { nightRank: i, nightOf: 212, oppGaPg: 3.05 }, form: { drought: 2 }, dressed: true, goals: null, hit: null, ...extra })
  const ng = { game: { id: 1, season: 20252026, date: '2026-10-08', state: 'pre', startUtc: '2026-10-09T01:00:00Z', away: { abbrev: 'EDM', score: 0 }, home: { abbrev: 'CGY', score: 0 } }, locked: true, graded: false, proj: { away: { goals: 3.4 }, home: { goals: 2.9 }, total: 6.3 }, rows: [nr(1, 'EDM', 'CGY', 'called', 91), nr(2, 'CGY', 'EDM', 'called', 84), nr(3, 'EDM', 'CGY', 'board', 77), nr(4, 'CGY', 'EDM', 'board', 70), nr(5, 'EDM', 'CGY', 'off', null)] }
  const gg = { ...ng, graded: true, game: { ...ng.game, state: 'final', away: { abbrev: 'EDM', score: 4 }, home: { abbrev: 'CGY', score: 2 } }, rows: [nr(1, 'EDM', 'CGY', 'called', 91, { goals: 2, hit: true }), nr(2, 'CGY', 'EDM', 'called', 84, { goals: 0, hit: false }), nr(3, 'EDM', 'CGY', 'board', 77, { dressed: false })] }
  const fr = { gp: 68, g: 31, a: 44, pts: 75, shots: 261, toi: 1267, ppg: 9 }
  await lc.downloadLampPlayerCard({ p: { id: 7000001, name: 'Test Skater 1', team: 'EDM', number: 97, pos: 'C', shoots: 'L', headshot: null }, row: ng.rows[0], g: ng, fr, l5: 3, l10: 5, drought: 2, where: 'vs CGY', board: true, seasonLabel: '2025-26', day: '2026-10-08' })
  await lc.downloadLampPlayerCard({ p: { id: 7000001, name: 'Test Skater 1', team: 'EDM', number: 97, pos: 'C', shoots: 'L', headshot: null }, row: gg.rows[1], g: gg, fr, l5: 0, l10: 1, drought: 6, where: '@ CGY', board: true, seasonLabel: '2025-26', day: '2026-10-08' })
  await lc.downloadLampBoardCard(ng.rows.filter((r) => r.score != null).map((r) => ({ r, g: ng })), { market: 'GOAL', date: '2026-10-08', total: 212 })
  await lc.downloadLampGameCard(ng, { date: '2026-10-08' }); await lc.downloadLampGameCard(gg, { date: '2026-10-08' })
  const br = (i, team, opp, status, score, extra = {}) => ({ playerId: String(9000000 + i), gameId: '401', name: 'Test Guard ' + i, team, opp, home: true, status, score, nightRank: i, legs: { ptsPg: 27.1, minPg: 35.2, fgaPg: 19.4 }, locked: true, xpts: 26.4, ...extra })
  const bg = { id: '401', away: { abbrev: 'NY', score: 0 }, home: { abbrev: 'BOS', score: 0 }, start: '2026-10-09T00:30:00Z', state: 'pre' }
  const brows = [br(1, 'BOS', 'NY', 'called', 88), br(2, 'NY', 'BOS', 'called', 80), br(3, 'BOS', 'NY', 'board', 71)]
  await bc.downloadBucketsPlayerCard({ card: { id: '9000001', name: 'Test Guard 1', team: 'BOS', pos: 'G', jersey: '7', height: '6-4' }, row: brows[0], game: bg, season: { gp: 64, min: 35.2, pts: 27.4, reb: 5.1, ast: 6.8 }, last5: [1, 2, 3, 4, 5].map((i) => ({ pts: 20 + i, reb: 4, ast: 7 })), xpts: { xpts: 26.9, minRecent: 34.8, rate: 0.77 }, where: 'vs NY', board: true, seasonWord: '2025-26', rankOf: 164, day: '2026-10-08' })
  await bc.downloadBucketsBoardCard(brows, { market: 'pts', date: '2026-10-08', total: 164 })
  await bc.downloadBucketsGameCard({ g: bg, rows: brows, tm: { total: 221.4, away: { pts: 109.2 }, home: { pts: 112.2 } }, market: 'pts', date: '2026-10-08' })
  await bc.downloadBucketsGameCard({ g: bg, rows: brows, tm: null, market: 'pts', date: '2026-10-08' })
  // the NHL's pictures come through the same-origin path (assets.nhle.com sends no CORS header)
  const logoOk = Boolean(await kit.loadImage(kit.logoUrl('nhl', 'EDM')))
  const rawBlocked = Boolean(await kit.loadImage('https://assets.nhle.com/logos/nhl/svg/EDM_dark.svg', { timeout: 4000 })) === false
  const statusWords = (await imp('/lib/callStatus.js')).STATUS_WORD
  return { out, brands, saved, statusWords, logoOk, rawBlocked, exports: { sc: Object.keys(sc), nc: Object.keys(nc), lc: Object.keys(lc), bc: Object.keys(bc) } }
`))

const { out, brands, saved, statusWords, logoOk, rawBlocked, exports } = rendered
const WORDS = Object.values(statusWords)
const BAD_DEV = /\bbot\b|payload|model[ _-]?version|🤖|\bjson\b|\bapi\b/i
const BAD_PUBLIC = /https?:|www\.|\.com\b|\.app\b|\.vercel|#[A-Za-z]/
const MARGIN = 20

for (const [name, r] of Object.entries(out)) {
  writeFileSync(join(OUT, `${name}.png`), Buffer.from(r.png.split(',')[1], 'base64'))
  const T = r.log.texts
  const tag = name.padEnd(13)
  check(r.w === 1080 && r.h === 1350, `${tag} is 1080 x 1350`)
  if (name !== 'long-name') check(r.log.clipped.length === 0, `${tag} clips nothing${r.log.clipped.length ? `: ${JSON.stringify(r.log.clipped[0])}` : ''}`)
  else check(r.log.clipped.length === 1 && /…$/.test(r.log.clipped[0].shown), `${tag} an absurd name is logged as clipped, with its ellipsis`)
  check(r.log.raised.length === 0, `${tag} nothing was drawn under 24px`)
  const small = T.filter((t) => t.size < 24)
  check(small.length === 0, `${tag} every line is >= 24px (${T.length} lines, smallest ${Math.min(...T.map((t) => t.size))}px)`)
  const off = T.filter((t) => t.x0 < MARGIN - 1 || t.x1 > 1080 - MARGIN + 1 || t.y0 < 0 || t.y1 > 1350)
  check(off.length === 0, `${tag} nothing off the card${off.length ? `: ${JSON.stringify(off[0].text)}` : ''}`)
  const wide = T.filter((t) => t.maxW != null && t.w > t.maxW + 1)
  check(wide.length === 0, `${tag} no line wider than its box${wide.length ? `: ${JSON.stringify(wide[0].text)}` : ''}`)
  let hit = null
  for (let i = 0; i < T.length && !hit; i += 1) for (let j = i + 1; j < T.length; j += 1) {
    const a = T[i], b = T[j]
    const ox = Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0), oy = Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0)
    // the glyph box is ±0.62 of the size; two lines only collide when they share real area
    if (ox > 2 && oy > Math.min(a.size, b.size) * 0.35) { hit = [a.text, b.text]; break }
  }
  check(!hit, `${tag} no text on top of other text${hit ? `: ${JSON.stringify(hit)}` : ''}`)
  // status words: a line that IS a status word is spelled by STATUS_WORD; the variants the old cards drew are banned
  const isWord = (t) => WORDS.includes(t.text.replace(/^\s*·\s*/, '').trim())
  const variants = T.filter((t) => !isWord(t) && /\bCALLED IT\b|\bOFF THE\b|\b(ON|NOT ON) THE [A-Z]+ BOARD\b|\b[A-Z]+ CALLED\b/.test(t.text.toUpperCase().replace('⚾ ', '')) && t.text === t.text.toUpperCase())
  check(variants.length === 0, `${tag} status words are STATUS_WORD only${variants.length ? `: ${JSON.stringify(variants[0].text)}` : ` (${T.filter(isWord).length} drawn)`}`)
  const dev = T.filter((t) => BAD_DEV.test(t.text)); check(dev.length === 0, `${tag} no developer words${dev.length ? `: ${JSON.stringify(dev[0].text)}` : ''}`)
  const pub = T.filter((t) => BAD_PUBLIC.test(t.text)); check(pub.length === 0, `${tag} no URL or hashtag${pub.length ? `: ${JSON.stringify(pub[0].text)}` : ''}`)
  const prob = T.filter((t) => /probabilit|\d\s*%\s*chance|chance of/i.test(t.text) && !/not a probability/i.test(t.text)); check(prob.length === 0, `${tag} prints no probability${prob.length ? `: ${JSON.stringify(prob[0].text)}` : ''}`)
  const foot = T.filter((t) => t.text === `DASH · ${r.brand.name}`)
  check(foot.length === 1, `${tag} footer reads "DASH · ${r.brand.name}"`)
  check(T.some((t) => t.text.startsWith(`${r.brand.icon} `) && t.text === t.text.toUpperCase()), `${tag} header is "${r.brand.icon} LABEL IN CAPS"`)
}

// the registry is where the words and accent come from
for (const [k, b] of Object.entries(brands)) check(b.name === b.regName && b.icon === b.regIcon && b.accent === b.regAccent, `cardBrand(${k}) = registry (${b.name} ${b.icon})`)
check(out['lamp-list'].brand.name === 'LAMP' && out['buckets-list'].brand.name === 'BUCKETS', 'the same kit draws LAMP and BUCKETS from the registry')

// status chips carry the game's own word, from STATUS_WORD
const statusWordsOnList = out.watchlist.log.texts.map((t) => t.text.replace(/^\s*·\s*/, '').trim()).filter((t) => WORDS.includes(t))
check(new Set(statusWordsOnList).size === 3, `watchlist shows all three words (${[...new Set(statusWordsOnList)].join(' / ')})`)

// a miss must not look like a win: no accent on its stamp or its CALLED chip
const near = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]) < 30
const hexRgb = (hex) => { const v = parseInt(hex.slice(1), 16); return [v >> 16, (v >> 8) & 255, v & 255] }
const acc = hexRgb(out['pick-hit'].brand.accent)
check(near(out['pick-hit'].px.chip, acc), 'HIT: its CALLED chip is filled in the accent')
check(near(out['pick-hit'].px.stamp, acc), 'HIT: its stamp is filled in the accent')
check(!near(out['pick-miss'].px.chip, acc), 'MISS: its CALLED chip is NOT the accent fill')
check(!near(out['pick-miss'].px.stamp, acc), 'MISS: its stamp is NOT the accent fill')
check(out['pick-miss'].log.texts.some((t) => t.text === 'MISS') && out['pick-void'].log.texts.some((t) => t.text === 'VOID'), 'MISS and VOID say so in words')
check(out['player-noscore'].log.clipped.length === 0, 'a hitter with no signature and no starter still lays out')

// LAMP and BUCKETS: the same look rules, in the same colours
for (const k of ['nhl', 'nba']) {
  const A = hexRgb(out[`${k}-player`].brand.accent)
  check(near(out[`${k}-player-hit`].px.chip, A) && near(out[`${k}-player-hit`].px.stamp2, A) && near(out[`${k}-player-hit`].px.ring, A), `${k}: a HIT wears the accent (chip, stamp, ring)`)
  check(!near(out[`${k}-player-miss`].px.chip, A) && !near(out[`${k}-player-miss`].px.stamp2, A) && !near(out[`${k}-player-miss`].px.ring, A), `${k}: a MISS is greys (chip, stamp and ring are NOT the accent)`)
  check(out[`${k}-player-miss`].log.texts.some((t) => t.text === 'MISS') && out[`${k}-player-void`].log.texts.some((t) => t.text === 'VOID'), `${k}: MISS and VOID say so in words`)
  check(out[`${k}-player-off`].log.texts.some((t) => t.text === 'NOT ON THE BOARD'), `${k}: a player off the board says NOT ON THE BOARD (from STATUS_WORD)`)
  check(out[`${k}-player`].log.texts.some((t) => /^#\d+ OF \d+ TONIGHT$/.test(t.text)), `${k}: the player card carries his place on the night`)
  const gm = out[`${k}-game`].log.texts.map((t) => t.text)
  check(gm.includes('3.4') && gm.includes('2.9') && gm.some((t) => /^EXPECTED (GOALS|POINTS)  ·  6\.3 TOTAL$/.test(t)), `${k}: the game card prints each club's expected number and the total`)
  check(!out[`${k}-game-noproj`].log.texts.some((t) => /EXPECTED/.test(t.text)), `${k}: a game with no team-model number draws no strip (never a placeholder)`)
  const fin = out[`${k}-game-final`].log.texts.map((t) => t.text)
  check(fin.includes('MISS') && fin.includes('VOID'), `${k}: a graded game card shows MISS and VOID rows`)
  check(near(out[`${k}-player`].px.ring, A), `${k}: a called player's ring is the accent`)
  check(near(out[`${k}-board`].px.ringLead, A) && near(out[`${k}-board-hit`].px.ringLead, A), `${k}: a called lead's ring is the accent (pregame and graded hit)`)
  check(!near(out[`${k}-board-miss`].px.ringLead, A), `${k}: a lead that missed has no accent ring`)
  check(out[`${k}-board-miss`].log.texts.some((t) => t.text === 'RESULT') && out[`${k}-board-miss`].log.texts.some((t) => t.text === 'MISS'), `${k}: a graded lead shows its result in words`)
}
check(logoOk, 'the NHL club mark loads through the same-origin path (/cdn/nhle)')
check(rawBlocked, 'the NHL asset host straight from a canvas is refused (why the same-origin path exists)')
check(exports.lc.sort().join() === 'downloadLampBoardCard,downloadLampGameCard,downloadLampPlayerCard' && exports.bc.sort().join() === 'downloadBucketsBoardCard,downloadBucketsGameCard,downloadBucketsPlayerCard', 'LAMP and BUCKETS each export exactly their three downloads')

// the downloads
const pngSize = (href) => { const b = Buffer.from(href.split(',')[1], 'base64'); return [b.readUInt32BE(16), b.readUInt32BE(20)] }
check(saved.length === 17 && saved.every((s) => s.head === 'data:image/png;base64,' && /\.png$/.test(s.name)), `the 17 download calls each save a PNG (${saved.map((s) => s.name).join(', ')})`)
saved.slice(8).forEach((s, i) => { const [w, h] = pngSize(s.href); check(w === 1080 && h === 1350, `wrapper PNG ${s.name} is 1080 x 1350`); writeFileSync(join(OUT, `wrapper-${i}-${s.name}`), Buffer.from(s.href.split(',')[1], 'base64')) })
check(!exports.sc.some((k) => /Pools|Pairs|Storylines/.test(k)), 'the Pools, Pairs and Storylines cards stay removed')

// source rules
const ROOT = new URL('..', import.meta.url).pathname
const code = (f) => readFileSync(join(ROOT, f), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\s\/\/.*$/, '')).join('\n')
for (const f of ['lib/cards/kit.js', 'lib/cards/cards.js', 'components/shareCard.js', 'components/nfl/shareCard.js', 'components/lamp/shareCard.js', 'components/buckets/shareCard.js', 'components/CardButton.js']) {
  const c = code(f)
  check(!/\bsport\s*[!=]==?\s*['"]/.test(c) && !/\bsportKey\([^)]*\)\s*[!=]==?\s*['"]/.test(c), `${f}: no sport ternary`)
  check(!/#[0-9a-fA-F]{3,8}\b/.test(c.replace(/['"]#['"]/g, '')) , `${f}: no hex literal`)
  check(!/\bbot\b|🤖|payload|model[_ ]?version/i.test(c.replace(/'[^']*not a probability[^']*'/g, '')), `${f}: no developer words in code`)
  check(!/\b(CALLED|ON THE BOARD|NOT ON THE BOARD)\b/.test(c), `${f}: never spells a status word (STATUS_WORD only)`)
}
// the posted images (1200 x 675, rendered on the server) share the words
for (const f of ['lib/dash/homerCard.js', 'lib/nfl/tdCard.js', 'lib/nfl/spotlightCard.js', 'lib/nhl/goalCard.js']) {
  const c = code(f)
  check(!/🤖|THE BOT\b|T H E   B O T|MOONSHOT CALLED IT|LAMP CALLED IT|ON THE LAMP BOARD/.test(c), `${f}: no robot, no "the bot", no made-up status words`)
  check(!/\/called['"`]|dashnetwork\.vercel\.app|\$\{site\}/.test(c.replace(/site = 'dashnetwork\.vercel\.app'/g, '')), `${f}: no URL printed on the image`)
}
for (const f of readdirSync(join(ROOT, 'lib/cards'))) check(f.endsWith('.js'), `lib/cards/${f}`)

console.log(`\nPNGs for a look: ${OUT}`)
console.log(failed ? `${failed} FAILED` : 'all green')
process.exit(failed ? 1 : 0)
