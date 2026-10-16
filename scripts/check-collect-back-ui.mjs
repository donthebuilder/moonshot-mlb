// THE FLIP SHEET'S BACKS, in a real browser at phone sizes (components/player/CardSheet.js). DATA IS A FIXTURE: /api/card/* answers PNGs rendered earlier by scripts/render-collect-back-preview.mjs, so this proves
// the LAYOUT and the WIRING (which URL each button asks for, the fallback), not the live render.
//   node scripts/check-collect-back-ui.mjs --previews <folder with nhl-hat-*-stats.png / -brand.png> [--base http://localhost:3108]
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'http://localhost:3108')
const PREVIEWS = arg('--previews', '/private/tmp/claude-501/back')
const req = createRequire(`${process.cwd()}/package.json`)
const { chromium } = req('playwright-core')
const executablePath = [arg('--browser'), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'].filter(Boolean).find((p) => existsSync(p))
const card = { moment: 'nhl_hat_trick', id: '2026020091:8480801', sport: 'nhl', tier: 'elite', tierWord: 'ELITE', holo: true, shimmer: false, kicker: 'HAT TRICK', line: '3 GOALS', day: '2026-10-01', dayWord: 'Oct 1', status: null, playerId: '8480801', name: 'Brady Tkachuk', team: 'FLA', opp: 'CBJ', game: '2026020091' }
let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const browser = await chromium.launch({ executablePath, headless: true })
for (const [w, h, mode] of [[360, 780], [390, 844], [430, 932], [844, 390], [390, 844, 'fallback']]) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
  const page = await ctx.newPage()
  const asked = []
  const failStats = mode === 'fallback'   // a fresh browser context: the stat-table back 404s, as for a moment the collectible rules do not know
  await page.route('**/api/card/recent**', (r) => r.fulfill({ json: { total: 1, counts: {}, cards: [card] } }))
  await page.route('**/api/card/binder**', (r) => r.fulfill({ json: { total: 1, cards: [card] } }))
  await page.route('**/api/card/stamps**', (r) => r.fulfill({ json: { stamps: [] } }))
  await page.route('**/api/card/image**', (r) => { asked.push(r.request().url()); r.fulfill({ contentType: 'image/png', body: readFileSync(`${PREVIEWS}/nhl-hat-base-stats.png`) }) })
  await page.route('**/api/card/special**', (r) => {
    const u = new URL(r.request().url()); asked.push(u.pathname + u.search)
    if (u.searchParams.get('side') === 'back') {
      if (failStats && u.searchParams.get('face') === 'stats') return r.fulfill({ status: 404, json: { error: 'NOT FOUND' } })
      return r.fulfill({ contentType: 'image/png', body: readFileSync(`${PREVIEWS}/nhl-hat-elite-${u.searchParams.get('face')}.png`) })
    }
    return r.fulfill({ contentType: 'image/png', body: readFileSync(`${PREVIEWS}/nhl-hat-elite-stats.png`) })
  })
  const tag = `${w}x${h}${mode ? ' ' + mode : ''}`
  const open = async () => {
    await page.goto(`${BASE}/app#sport=nhl&tab=binder`, { waitUntil: 'domcontentloaded' })
    await page.getByText('ALL CARDS', { exact: true }).first().click({ timeout: 15000 }).catch(() => null)
    await page.waitForSelector('[data-binder-tile] button', { timeout: 20000 })
    await page.locator('[data-binder-tile] button').first().tap()
    await page.waitForSelector('[role=dialog] img', { timeout: 10000 })
  }
  await open()
  const dlg = page.locator('[role=dialog]')
  if (mode === 'fallback') {
    await dlg.getByRole('button', { name: 'Stat table' }).tap()
    await page.waitForTimeout(800)
    check(asked.some((u) => /\/api\/card\/image\?.*side=back/.test(u)), "fallback: a collectible back that 404s falls back to the player's own back (no dead image)")
    await ctx.close()
    continue
  }
  const buttons = await dlg.locator('button').evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { t: e.textContent.trim(), w: r.width, h: r.height, clip: e.scrollWidth > e.clientWidth + 1 } }))
  const labels = ['Front', 'Stat table', 'Card back', 'Save']
  for (const l of labels) { const b = buttons.find((x) => x.t.includes(l)); check(Boolean(b) && b.h >= 44 && b.w >= 44 && !b.clip, `${tag} button "${l}": ${b ? `${Math.round(b.w)}x${Math.round(b.h)}${b.clip ? ' CLIPPED' : ''}` : 'missing'}`) }
  await dlg.getByRole('button', { name: 'Stat table' }).tap()
  await page.waitForTimeout(400)
  check(asked.some((u) => /side=back&face=stats&w=720/.test(u) && /moment=nhl_hat_trick/.test(u)), `${tag} Stat table asks the collectible back of THIS card (face=stats)`)
  await dlg.getByRole('button', { name: 'Card back' }).tap()
  await page.waitForTimeout(400)
  check(asked.some((u) => /side=back&face=brand&w=720/.test(u)), `${tag} Card back asks the CALLED IT face (face=brand)`)
  const img = await dlg.locator('img').first().evaluate((i) => ({ w: i.naturalWidth, h: i.naturalHeight, ok: i.complete }))
  check(img.ok && img.w === 1000 && img.h === 1400, `${tag} the back picture loads at 1000x1400`)
  const sw = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)
  check(sw, `${tag} no sideways scroll`)
  await dlg.getByRole('button', { name: 'Front' }).tap()
  check(await dlg.locator('img').first().evaluate((i) => /side=back/.test(i.src)) === false, `${tag} Front returns to the front`)
  await ctx.close()
}
await browser.close()
console.log(failed ? `\n${failed} FAILED` : '\nall collect-back-ui checks passed')
process.exit(failed ? 1 : 0)
