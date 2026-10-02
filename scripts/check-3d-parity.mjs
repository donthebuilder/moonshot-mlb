#!/usr/bin/env node
// THE PARITY TEST (2026-10-01, BATCH-ARENA-SPLIT). The arena came out of the
// ballpark (lib/arena.js) with NO visible change allowed. This renders the MLB
// 3D views from two servers -- BEFORE (origin/main, built in a worktree; git
// stash is banned) and AFTER (this tree) -- and diffs them pixel by pixel.
// Every frame must differ in < --max (default 0.5%) of its pixels, or it names
// the frame and exits 1. Kept for the NHL / NFL batches: they re-run it to
// prove they did not touch MLB.
//
// Deterministic on purpose: Math.random is seeded and the animation clock is
// frozen before the page loads, identically on both servers, so the stars,
// the crowd speckle, the flags and the handheld drift land the same way.
//
//   node scripts/check-3d-parity.mjs --before http://localhost:3124 --after http://localhost:3123
import { createRequire } from 'node:module'
import { existsSync, mkdirSync } from 'node:fs'
const req = createRequire(`${process.cwd()}/package.json`)
const { chromium } = req('playwright-core')

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BEFORE = arg('--before'), AFTER = arg('--after', 'http://localhost:3123')
const PAGE = arg('--page', '/app#sport=mlb&p=547180')
const MAX = Number(arg('--max', '0.005'))
const OUT = arg('--out', 'mobile-report/3d-parity')
const PARKS = (arg('--parks', 'Fenway Park,Coors Field,Great American Ball Park')).split(',')
if (!BEFORE) { console.error('--before <url> required (a server built from origin/main)'); process.exit(2) }
const BROWSERS = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', '/usr/bin/google-chrome', '/usr/bin/chromium']
const executablePath = BROWSERS.find((p) => existsSync(p))
if (!existsSync(OUT)) mkdirSync(OUT, { recursive: true })

const FREEZE = () => {
  let s = 1234567
  Math.random = () => { s = (s * 1103515245 + 12345) % 2147483648; return s / 2147483648 }
  const T = 5000
  performance.now = () => T
  window.requestAnimationFrame = (cb) => setTimeout(() => cb(T), 16)
}

const browser = await chromium.launch({ executablePath, headless: true, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })

async function frames(base, view, park) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
  await page.addInitScript(FREEZE)
  await page.goto(base + PAGE, { waitUntil: 'load' }); await page.waitForTimeout(8000)
  const out = {}
  if (view === 'spray') {
    await page.getByRole('button', { name: /spray/i }).first().click(); await page.waitForTimeout(3000)
    if (park) await page.locator('select').filter({ hasText: 'his real park' }).first().selectOption(park)
    await page.getByRole('button', { name: /stadium/i }).first().click()
  } else {
    await page.getByRole('button', { name: /EV Log/i }).first().click(); await page.waitForTimeout(3000)
    await page.getByRole('button', { name: /Zone in 3D/i }).first().click()
  }
  await page.waitForTimeout(12000)
  const canvas = page.locator('canvas').first()
  await canvas.scrollIntoViewIfNeeded(); await page.waitForTimeout(1500)
  const shots = view === 'spray' ? ['open', 'top'] : ['open', 'top']
  for (const k of shots) {
    if (k !== 'open') {
      // the same camera move on both sides: the BEFORE build may have no
      // presets, so drive the camera through OrbitControls directly
      await page.evaluate((v) => {
        const c = window.__dash3d?.controls
        if (!c) return
        const t = c.target
        if (v === 'spray') c.object.position.set(t.x + 1, t.y + 520, t.z - 1)
        else c.object.position.set(t.x + 0.01, t.y + 24, t.z - 0.5)
        c.update()
      }, view)
      await page.waitForTimeout(1500)
    }
    out[k] = (await canvas.screenshot()).toString('base64')
  }
  await page.close()
  return out
}

async function diff(a, b, name) {
  const page = await browser.newPage()
  const r = await page.evaluate(async ({ a, b }) => {
    const load = async (src) => { const i = new Image(); i.src = `data:image/png;base64,${src}`; await i.decode(); return i }
    const [ia, ib] = await Promise.all([load(a), load(b)])
    const w = Math.min(ia.width, ib.width), h = Math.min(ia.height, ib.height)
    const px = (img) => { const c = document.createElement('canvas'); c.width = w; c.height = h; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, w, h).data }
    const da = px(ia), db = px(ib)
    let bad = 0
    for (let i = 0; i < da.length; i += 4) {
      if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 24) bad++
    }
    return { share: bad / (w * h), size: `${ia.width}x${ia.height} vs ${ib.width}x${ib.height}` }
  }, { a, b })
  await page.close()
  return r
}

let fails = 0, n = 0
const cases = [...PARKS.map((p) => ['spray', p]), ['zone', null]]
for (const [view, park] of cases) {
  const [fa, fb] = [await frames(BEFORE, view, park), await frames(AFTER, view, park)]
  for (const k of Object.keys(fa)) {
    const { share, size } = await diff(fa[k], fb[k])
    n++
    const tag = `${view}${park ? ` · ${park}` : ''} · ${k}`
    const ok = share < MAX
    if (!ok) fails++
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${tag}: ${(100 * share).toFixed(3)}% of pixels differ (${size})`)
  }
}
console.log(`${n} frames, ${fails} over ${(100 * MAX).toFixed(1)}%`)
await browser.close()
process.exit(fails ? 1 : 0)
