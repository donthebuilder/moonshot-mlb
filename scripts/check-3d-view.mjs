#!/usr/bin/env node
// THE SWEEP TEST (2026-10-01, BATCH-3D-CAMERA). Donovan: "when you move to a
// certain angle you're in the stands behind home plate and you see nothing."
// Opens a 3D view, drives its camera through 12 azimuths (the full clamp,
// -100..+100 deg from the opening frame) x 3 distances (min / mid / max) x 2
// polar angles through the view's handle (window.__dash3d.setView), and counts
// FIELD PIXELS in each frame -- the playing surface's colour band (grass green
// + infield dirt for baseball; pass --field for another product's surface).
// Every frame >= --min (default 0.15) or it prints the failing view, exits 1.
//
//   node scripts/check-3d-view.mjs --base http://localhost:3123 \
//     --page "/app#sport=mlb&p=547180" --tab "Spray" --toggle "Stadium" [--width 390] [--full]
import { createRequire } from 'node:module'
import { existsSync, mkdirSync } from 'node:fs'
const req = createRequire(`${process.cwd()}/package.json`)
const { chromium } = req('playwright-core')

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const has = (k) => process.argv.includes(k)
const BASE = arg('--base', 'http://localhost:3123')
const PAGE = arg('--page', '/app#sport=mlb&p=547180')
const TAB = arg('--tab', null)
const TOGGLE = arg('--toggle', 'Stadium')
const WIDTH = Number(arg('--width', '1280'))
const MIN = Number(arg('--min', '0.15'))
const FIELD = arg('--field', 'baseball')
const OUT = arg('--out', 'mobile-report/3d')
const BROWSERS = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', '/usr/bin/google-chrome', '/usr/bin/chromium']
const executablePath = BROWSERS.find((p) => existsSync(p))
if (!executablePath) { console.error('No Chrome/Brave found'); process.exit(2) }
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const browser = await chromium.launch({ executablePath, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: WIDTH, height: WIDTH < 500 ? 844 : 900 }, isMobile: WIDTH < 500, hasTouch: WIDTH < 500 })
await page.goto(BASE + PAGE, { waitUntil: 'load' }); await page.waitForTimeout(8000)
if (TAB) await page.getByRole('button', { name: new RegExp(TAB, 'i') }).first().click(); await page.waitForTimeout(3000)
await page.getByRole('button', { name: new RegExp(TOGGLE, 'i') }).first().click(); await page.waitForTimeout(12000)
if (has('--full')) { await page.getByRole('button', { name: /full screen/i }).first().click(); await page.waitForTimeout(9000) }
// The view only renders while on screen: bring it in before driving it.
await page.locator('canvas').first().scrollIntoViewIfNeeded().catch(() => {})
const ok = await page.evaluate(() => typeof window.__dash3d?.setView === 'function')
if (!ok) { console.error('FAIL: no 3D view handle (window.__dash3d) -- did the toggle open the view?'); await browser.close(); process.exit(1) }

// colour bands, in the rendered (graded) output
const BANDS = {
  // measured on the rendered park (graded, ACES): grass is olive -- r ~ g,
  // b a little lower -- and the infield dirt is a red-brown.
  baseball: '(r,g,b) => (Math.abs(r - g) <= 10 && g - b >= 4 && g >= 16 && g <= 110) || (r - g >= 8 && g >= b - 2 && r >= 18 && r <= 150)',
  ice: '(r,g,b) => (r > 150 && g > 160 && b > 170)',
  turf: '(r,g,b) => (g > r + 6 && g > b + 2 && g > 34)',
}
const test = BANDS[FIELD] || BANDS.baseball
const fieldShare = async () => {
  const canvas = page.locator('canvas').first()
  const png = (await canvas.screenshot()).toString('base64')
  return page.evaluate(async ({ png, test }) => {
    const img = new Image(); img.src = `data:image/png;base64,${png}`; await img.decode()
    const cv = document.createElement('canvas'); cv.width = img.width; cv.height = img.height
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, cv.width, cv.height).data
    const f = new Function(`return ${test}`)()
    let n = 0, hit = 0
    for (let i = 0; i < d.length; i += 16) { n++; if (f(d[i], d[i + 1], d[i + 2])) hit++ }
    return hit / n
  }, { png, test })
}

const AZ = Array.from({ length: 12 }, (_, i) => Math.round(-100 + (200 * i) / 11))
const DIST = [0, 0.5, 1]
const POLAR = [0.55, 1]
let fails = 0, worst = 1, n = 0
for (const az of AZ) for (const dk of DIST) for (const pk of POLAR) {
  await page.evaluate(([a, d, p]) => window.__dash3d.setView(a, d, p), [az, dk, pk])
  await page.waitForTimeout(450)
  // Geometry first (the view's own ray count of the playing surface); the
  // colour band only for a view that doesn't expose one.
  // Measured twice a frame apart (the camera can still be easing in from the
  // last view on the first read); the settled, higher reading counts.
  const ray = () => page.evaluate(() => (typeof window.__dash3d.fieldShare === 'function' ? window.__dash3d.fieldShare() : null))
  let share = await ray()
  if (share != null) { await page.waitForTimeout(250); share = Math.max(share, await ray()) } else share = await fieldShare()
  n++; worst = Math.min(worst, share)
  if (share < MIN) {
    fails++
    const f = `${OUT}/fail-az${az}-d${dk}-p${pk}-${WIDTH}.png`
    await page.locator('canvas').first().screenshot({ path: f })
    console.log(`FAIL az ${az} deg, distance ${dk}, polar ${pk}: field ${(100 * share).toFixed(1)}% < ${100 * MIN}% -> ${f}`)
  }
}
console.log(`${n} views, worst field share ${(100 * worst).toFixed(1)}%, ${fails} under ${100 * MIN}%`)
await browser.close()
process.exit(fails ? 1 : 0)
