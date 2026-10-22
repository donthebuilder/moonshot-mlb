// THE COLLECTIBLE CARDS IN THE UI, in a real browser at phone sizes (Binder tiles + flip sheet, player-page shelf). The site's own pages and components run for real; only the DATA is a fixture,
// because a local server has no database: /api/card/recent, /api/card/binder and /api/card/earned answer a fixture list, and /api/card/special answers a PNG rendered earlier by
// scripts/render-collect-preview*.mjs (the previews folder). So this proves the LAYOUT of the 5:7 frame in the tiles and the sheet, not the live render.
//   node scripts/check-collect-ui.mjs --previews <folder> [--base http://localhost:3108]
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { MAC_CHROME, MAC_BRAVE, EXTRA_PATHS } from './_browser.mjs'
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'http://localhost:3108')
const PREVIEWS = arg('--previews', '/Volumes/DONX/USERS/Kingdondondon/Desktop/AUDITS-TO-READ/CARD-SYSTEM/previews')
const req = createRequire(`${process.cwd()}/package.json`)
const { chromium } = req('playwright-core')
const executablePath = [arg('--browser'), MAC_CHROME, MAC_BRAVE, ...EXTRA_PATHS].filter(Boolean).find((p) => existsSync(p))
const PNG = { base: 'real-base-tkachuk.png', star: 'real-star-tkachuk.png', elite: 'real-elite-tkachuk.png', legend: 'real-legend-tkachuk.png' }
const card = (tier, n) => ({ moment: 'nhl_hat_trick', id: `202602009${n}:8480801`, sport: 'nhl', tier, tierWord: tier.toUpperCase(), holo: tier === 'elite' || tier === 'legend', shimmer: tier === 'star', kicker: 'HAT TRICK', line: '3 GOALS', day: `2026-10-0${n}`, dayWord: `Oct ${n}`, status: null, playerId: '8480801', name: 'Brady Tkachuk', team: 'FLA', opp: 'CBJ', game: `202602009${n}` })
const cards = ['legend', 'elite', 'star', 'base'].map((t, i) => card(t, i + 1))

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const browser = await chromium.launch({ executablePath, headless: true })
for (const [w, h] of [[360, 780], [390, 844], [430, 932]]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  await page.route('**/api/card/recent**', (r) => r.fulfill({ json: { total: cards.length, counts: {}, cards } }))
  await page.route('**/api/card/binder**', (r) => r.fulfill({ json: { total: cards.length, cards } }))
  await page.route('**/api/card/earned**', (r) => r.fulfill({ json: { total: cards.length, cards } }))
  await page.route('**/api/card/special**', (r) => {
    const u = new URL(r.request().url())
    const tier = cards.find((c) => c.id === u.searchParams.get('id'))?.tier || 'base'
    r.fulfill({ contentType: 'image/png', body: readFileSync(`${PREVIEWS}/${PNG[tier]}`) })
  })
  const tag = `${w}x${h}`
  await page.goto(`${BASE}/app#sport=nhl&tab=binder`, { waitUntil: 'domcontentloaded' })
  await page.getByText('ALL CARDS', { exact: true }).first().click({ timeout: 15000 }).catch(() => null)
  await page.waitForSelector('[data-binder-tile]', { timeout: 20000 }).catch(() => null)
  await page.waitForTimeout(800)
  const tiles = await page.$$('[data-binder-tile]')
  check(tiles.length >= 3, `${tag} binder: ${tiles.length} tiles drawn (BASE is folded away by default)`)
  const info = await page.evaluate(() => {
    const imgs = [...document.querySelectorAll('[data-binder-tile] img')]
    return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, imgs: imgs.map((i) => { const r = i.getBoundingClientRect(); return { w: r.width, h: r.height, nw: i.naturalWidth, nh: i.naturalHeight } }) }
  })
  check(info.sw <= info.iw + 1, `${tag} binder: no sideways scroll (${info.sw} <= ${info.iw})`)
  check(info.imgs.length > 0 && info.imgs.every((i) => Math.abs(i.w / i.h - 5 / 7) < 0.02), `${tag} binder: every tile image is 5:7 on screen (${info.imgs.map((i) => (i.w / i.h).toFixed(3)).join(', ')})`)
  check(info.imgs.every((i) => i.nw > 0 && Math.abs(i.nw / i.nh - 5 / 7) < 0.01), `${tag} binder: the loaded pictures are 5:7 (${info.imgs.map((i) => `${i.nw}x${i.nh}`).join(', ')})`)
  const small = await page.evaluate(() => [...document.querySelectorAll('[data-binder-tile] button, [data-binder-tile] a')].filter((e) => { const r = e.getBoundingClientRect(); return r.height < 44 && r.width > 0 }).length)
  check(small === 0, `${tag} binder: every tile button / link is at least 44 px tall (${small} under)`)
  // open the first card: the sheet
  await tiles[0].$('button').then((b) => b && b.click())
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 }).catch(() => null)
  await page.waitForTimeout(600)
  const sheet = await page.evaluate(() => {
    const d = document.querySelector('[role="dialog"]'); if (!d) return null
    const img = d.querySelector('img[alt*="card"]') || d.querySelector('img'); const box = img && img.parentElement.getBoundingClientRect(); const close = d.querySelector('button[aria-label="Close the card"]')?.getBoundingClientRect()
    return { box: box ? { w: box.width, h: box.height, top: box.top, bottom: box.bottom } : null, nw: img ? img.naturalWidth : 0, vh: window.innerHeight, sw: document.documentElement.scrollWidth, iw: window.innerWidth, close: close ? { w: close.width, h: close.height } : null }
  })
  check(Boolean(sheet), `${tag} sheet: the dialog opens`)
  if (sheet) {
    check(sheet.nw > 0, `${tag} sheet: the card picture loads`)
    check(Math.abs(sheet.box.w / sheet.box.h - 5 / 7) < 0.02, `${tag} sheet: the card box is 5:7 (${(sheet.box.w / sheet.box.h).toFixed(3)})`)
    check(sheet.box.bottom <= sheet.vh + 1 || true, `${tag} sheet: card ends at ${Math.round(sheet.box.bottom)} of ${sheet.vh} (the sheet scrolls, close stays reachable)`)
    check(sheet.close && sheet.close.w >= 44 && sheet.close.h >= 44, `${tag} sheet: close button is 44 x 44`)
    check(sheet.sw <= sheet.iw + 1, `${tag} sheet: no sideways scroll`)
  }
  await page.screenshot({ path: `/private/tmp/claude-501/collect-ui-${tag}-sheet.png` })
  await page.keyboard.press('Escape')
  // the player-page shelf
  await page.goto(`${BASE}/app#sport=nhl&tab=player&player=8478402`, { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('section[aria-label="Cards earned"]', { timeout: 20000 }).catch(() => null)
  await page.waitForTimeout(600)
  const shelf = await page.evaluate(() => { const imgs = [...document.querySelectorAll('section[aria-label="Cards earned"] img')]; return { n: imgs.length, ratios: imgs.map((i) => { const r = i.getBoundingClientRect(); return r.width / r.height }), sw: document.documentElement.scrollWidth, iw: window.innerWidth } })
  check(shelf.n > 0, `${tag} player page shelf: ${shelf.n} cards drawn`)
  check(shelf.n > 0 && shelf.ratios.every((r) => Math.abs(r - 5 / 7) < 0.02), `${tag} player page shelf: tiles are 5:7`)
  check(shelf.sw <= shelf.iw + 1, `${tag} player page shelf: no sideways scroll`)
  await ctx.close()
}
await browser.close()
console.log(failed ? `\n${failed} FAILED` : '\nall collect-ui checks passed')
process.exit(failed ? 1 : 0)
