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
import { FIX } from './card-fixtures.mjs'

const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null }
const OUT = arg('--out') || join(tmpdir(), 'dash-cards')
mkdirSync(OUT, { recursive: true })

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

const rendered = await withCards(async ({ run }) => run(`
  const F = ${JSON.stringify(FIX)}
  const cards = await imp('/lib/cards/cards.js')
  const kit = await imp('/lib/cards/kit.js')
  const H = F.hitters
  const out = {}
  const grab = async (k, card, extra = {}) => {
    const g = card.c.getContext('2d')
    const px = (x, y) => Array.from(g.getImageData(x, y, 1, 1).data.slice(0, 3))
    out[k] = { png: card.c.toDataURL('image/png'), w: card.c.width, h: card.c.height, log: card.log, brand: card.brand, px: { chip: px(${56 + 280 + 10}, ${150 + 62}), stamp: px(76, 600) }, ...extra }
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
  // an absurd name must be logged as clipped, not silently cut
  await grab('long-name', await cards.rankedCard('mlb', { label: 'TEST', rows: [{ rank: 1, name: 'Test Hitter With An Absurdly Long Name That Cannot Possibly Fit On One Row', team: 'NYY', opp: 'BOS', id: 1, status: 'board', score: 50 }], total: 1 }))
  // the registry, as the kit reads it
  const reg = await imp('/lib/routes.js')
  const acc = await imp('/lib/sportAccent.js')
  const brands = Object.fromEntries(['mlb', 'nfl', 'nhl', 'nba'].map((k) => [k, { ...kit.cardBrand(k), regName: reg.BRAND[k].name, regIcon: reg.BRAND[k].icon, regAccent: acc.SPORT_ACCENT[k] }]))
  // the download wrappers end in a PNG on an <a download>
  const saved = []
  HTMLAnchorElement.prototype.click = function () { saved.push({ name: this.download, head: String(this.href).slice(0, 22) }) }
  const sc = await imp('/components/shareCard.js')
  const nc = await imp('/components/nfl/shareCard.js')
  await sc.downloadShareCard(H); await sc.downloadPlayerCard(H[0]); await sc.downloadBoardCard(H, { title: 'THE BOARD', type: 'hr' })
  await sc.downloadGameCard({ away: 'BOS', home: 'NYY', players: H.slice(0, 3) }); await sc.downloadTrackRecordCard(F.record)
  await sc.downloadPitcherCard(F.pitcher); await nc.downloadNflPickCard(F.nflHit); await nc.downloadNflPickCard(F.nflPre)
  const statusWords = (await imp('/lib/callStatus.js')).STATUS_WORD
  return { out, brands, saved, statusWords, exports: { sc: Object.keys(sc), nc: Object.keys(nc) } }
`))

const { out, brands, saved, statusWords, exports } = rendered
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

// the downloads
check(saved.length === 8 && saved.every((s) => s.head === 'data:image/png;base64,' && /\.png$/.test(s.name)), `the 8 download wrappers each save a PNG (${saved.map((s) => s.name).join(', ')})`)
check(!exports.sc.some((k) => /Pools|Pairs|Storylines/.test(k)), 'the Pools, Pairs and Storylines cards stay removed')

// source rules
const ROOT = new URL('..', import.meta.url).pathname
const code = (f) => readFileSync(join(ROOT, f), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).map((l) => l.replace(/\s\/\/.*$/, '')).join('\n')
for (const f of ['lib/cards/kit.js', 'lib/cards/cards.js', 'components/shareCard.js', 'components/nfl/shareCard.js']) {
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
