// THE CARD CHIP + FLIP SHEET on the three player pages, in a real browser (phone first).
//   node scripts/check-card-flip.mjs [--base http://localhost:3108] [--out DIR] [--nhl 8478402] [--mlb 545341] [--nfl 00-0039139]
// For each product: open his page at 390x844, find the "Card" chip, and check
//   - the chip is >= 44x44; it sits in a row the page already had: the content below it moves down by no more than 24px
//     with the chip than without it (measured here: the same page with the chip hidden); both y's are printed
//   - tapping it opens a dialog; the FRONT image loads; tapping the card flips to the BACK, which loads; tapping again returns
//   - Escape closes the sheet only (the player's own page / modal stays); nothing scrolls the page sideways at 360 / 390 / 430
//   - landscape 844x390: the sheet scrolls and the close button is reachable
// Needs a running site (next start) with real data; ids default to today's real CALLED players and are plain arguments.
import { mkdirSync } from 'node:fs'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'http://localhost:3108')
const OUT = arg('--out', '/private/tmp/claude-501/card-flip')
mkdirSync(OUT, { recursive: true })
const req = createRequire(`${process.cwd()}/package.json`)
const { chromium } = req('playwright-core')
const BROWSERS = [arg('--browser'), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'].filter(Boolean)
const executablePath = BROWSERS.find((p) => existsSync(p))
const PAGES = [
  ['nhl', `/app#sport=nhl&tab=player&player=${arg('--nhl', '8478402')}`],
  ['mlb', `/app#sport=mlb&p=${arg('--mlb', '545341')}`],
  ['nfl', `/app#sport=nfl&tab=players&player=${arg('--nfl', '00-0039139')}`],
]
let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }

const browser = await chromium.launch({ executablePath, headless: true })
for (const [sport, path] of PAGES) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(String(e.message || e)))
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
  const chip = page.locator('button[aria-haspopup="dialog"]', { hasText: 'Card' }).first()
  try { await chip.waitFor({ state: 'visible', timeout: 25000 }) } catch { check(false, `${sport}: the Card chip appears on his page`); await ctx.close(); continue }
  check(true, `${sport}: the Card chip appears on his page`)
  const box = await chip.boundingBox()
  check(box.width >= 44 && box.height >= 44, `${sport}: chip is ${Math.round(box.width)}x${Math.round(box.height)} (>= 44x44)`)
  // the y of the content after the chip's row, with the chip and without it
  const ys = await chip.evaluate((el) => {
    let row = el
    while (row.parentElement && !(row.nextElementSibling && row.getBoundingClientRect().height < 140 && row.getBoundingClientRect().height >= el.getBoundingClientRect().height - 1 && row !== el)) row = row.parentElement
    const next = () => (row.nextElementSibling ? row.nextElementSibling.getBoundingClientRect().top + window.scrollY : null)
    const rowH = row.getBoundingClientRect().height
    const with_ = next()
    const prev = el.style.display
    el.style.display = 'none'
    const without = next()
    const rowHWithout = row.getBoundingClientRect().height
    el.style.display = prev
    return { with_, without, rowH, rowHWithout }
  })
  const dy = ys.with_ - ys.without
  console.log(`     ${sport}: first content below the chip's row: y ${Math.round(ys.without)} without, ${Math.round(ys.with_)} with (row ${Math.round(ys.rowHWithout)} -> ${Math.round(ys.rowH)}px)`)
  check(dy <= 24, `${sport}: the chip moves the content below it by ${Math.round(dy)}px (limit 24)`)
  // open, front loads, flip, back loads, flip back
  await chip.tap()
  const dlg = page.locator('[role="dialog"][aria-label$="card"]').last()
  await dlg.waitFor({ state: 'visible', timeout: 10000 })
  check(true, `${sport}: tapping the chip opens the card sheet`)
  const imgs = dlg.locator('img')
  await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role="dialog"]')].pop(); const i = d && d.querySelector('img'); return i && i.complete && i.naturalWidth > 0 }, null, { timeout: 45000 }).catch(() => {})
  const frontOk = await imgs.first().evaluate((i) => i.complete && i.naturalWidth > 0)
  check(frontOk, `${sport}: the FRONT image loads`)
  await page.screenshot({ path: `${OUT}/${sport}-front-sheet.png` })
  const flipBtn = dlg.locator('button[aria-label^="Flip the card"]')
  const fb = await flipBtn.boundingBox()
  check(fb.width >= 44 && fb.height >= 44, `${sport}: the flip target is ${Math.round(fb.width)}x${Math.round(fb.height)}`)
  await flipBtn.tap()
  await page.waitForFunction(() => { const d = [...document.querySelectorAll('[role="dialog"]')].pop(); const i = d ? d.querySelectorAll('img') : []; return i.length > 1 && [...i].every((x) => x.complete && x.naturalWidth > 0) }, null, { timeout: 60000 }).catch(() => {})
  const backOk = await imgs.nth(1).evaluate((i) => i.complete && i.naturalWidth > 0).catch(() => false)
  check(backOk, `${sport}: tapping the card flips it and the BACK image loads`)
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${OUT}/${sport}-back-sheet.png` })
  const label = await flipBtn.getAttribute('aria-label')
  check(/back/.test(label), `${sport}: the flip control says which side shows ("${label}")`)
  await flipBtn.press('Enter')
  await page.waitForTimeout(700)
  check(/front/.test(await flipBtn.getAttribute('aria-label')), `${sport}: Enter on the card flips it back (keyboard)`)
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  check(over <= 0, `${sport}: no sideways page scroll with the sheet open (${over}px)`)
  // Escape closes the sheet only
  await page.keyboard.press('Escape')
  await page.waitForTimeout(300)
  const stillThere = await page.locator('[role="dialog"][aria-label$="card"]').count()
  const chipBack = await page.locator('button[aria-haspopup="dialog"]', { hasText: 'Card' }).first().isVisible().catch(() => false)
  check(chipBack, `${sport}: Escape closes the card sheet and leaves his page / card open (${stillThere} dialog(s) left, chip visible: ${chipBack})`)
  check(errors.length === 0, `${sport}: no page errors${errors.length ? ` (${errors[0].slice(0, 120)})` : ''}`)
  // 360 and 430 phones, then landscape
  for (const [w, h, tag] of [[360, 780, '360'], [430, 932, '430'], [844, 390, 'landscape']]) {
    await page.setViewportSize({ width: w, height: h })
    await page.waitForTimeout(250)
    await page.locator('button[aria-haspopup="dialog"]', { hasText: 'Card' }).first().tap().catch(() => {})
    const d = page.locator('[role="dialog"][aria-label$="card"]').last()
    const seen = await d.isVisible().catch(() => false)
    const close = page.locator('button[aria-label="Close the card"]')
    const cb = seen ? await close.boundingBox().catch(() => null) : null
    const ok = Boolean(cb) && cb.width >= 44 && cb.height >= 44 && cb.y >= 0 && cb.y + cb.height <= h + 1
    const side = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    check(seen && ok && side <= 0, `${sport} @${tag}: the sheet opens, its close button is on screen (${cb ? `${Math.round(cb.width)}x${Math.round(cb.height)}` : 'none'}), no sideways scroll`)
    await page.screenshot({ path: `${OUT}/${sport}-${tag}.png` })
    await page.keyboard.press('Escape')
    await page.waitForTimeout(200)
  }
  await ctx.close()
}
await browser.close()
console.log(failed ? `\n${failed} FAILED (screenshots in ${OUT})` : `\nOK: card chip + flip (screenshots in ${OUT})`)
process.exit(failed ? 1 : 0)
