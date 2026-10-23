// THE REPLAY, AS A VIDEO FOR X (2026-10-22, PREPLAY R4). Donovan: "how can I download these ... so I can start posting them
// on Twitter". Opens the LAMP game page in record mode (?look=tracking&record=1: 16:9, no controls, a stepped clock),
// steps the replay one frame at a time, grabs each frame of the stage and encodes an MP4 with ffmpeg. Frame-stepped, so a
// slow machine makes the same smooth video as a fast one; it just takes longer.
//
//   node scripts/record-replay.mjs --game 2026020148 [--base https://dashnetwork.vercel.app] [--fps 30] [--out replay.mp4]
//                                  [--proxy-api https://dashnetwork.vercel.app] [--tail 3.5]
//   node scripts/record-replay.mjs --sport mlb --game 849805 --day tmrw    (2026-10-22: MOONSHOT's PREPLAY, the simulated game)
//
//   --sport      nhl (LAMP's replay, the default) or mlb (MOONSHOT's PREPLAY on the Games tab)
//   --day        mlb only: today or tmrw, the slate the game is on
//
//   --base       the site to record from (a preview link, the live site once merged, or a local `next start`)
//   --proxy-api  local runs only: send /api/* (except /api/lamp/gameplay) to this site, for a local server with no env
//   --tail       seconds of the end card after the final horn
//   --max        a test run: stop after this many seconds of video
// Needs a Chromium (scripts/_browser.mjs finds Chrome on a Mac) and ffmpeg on the PATH (brew install ffmpeg).
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { findBrowser, MAC_CHROME } from './_browser.mjs'

const arg = (k, d = null) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const game = arg('game')
const sport = arg('sport', 'nhl')
const day = arg('day', 'today')
if (sport === 'nhl' && !/^\d{10}$/.test(String(game || ''))) { console.error('usage: --game <10-digit NHL game id>'); process.exit(2) }
if (sport === 'mlb' && !/^\d{5,7}$/.test(String(game || ''))) { console.error('usage: --sport mlb --game <MLB gamePk> [--day tmrw]'); process.exit(2) }
// each stage's page, the window handle it exposes in record mode, and the routes a local run answers itself
const STAGE = {
  // --preplay: LAMP's PREPLAY (the simulated game) instead of the replay of a finished one
  nhl: { url: `/app?look=tracking&record=1${process.argv.includes('--preplay') ? '&preplay=1' : ''}#sport=nhl&tab=game&game=${game}`, handle: '__lampReplay', local: ['/api/lamp/gameplay'], name: process.argv.includes('--preplay') ? 'lamp-preplay' : 'lamp-replay' },
  // the slate opens on its first upcoming game with every section stacked (a game= link opens the Lineups view instead), so
  // the MLB stage is reached through the slate; --game picks which stage on the page when a slate has more than one
  mlb: { url: `/app?look=tracking&record=1#tab=games&day=${day === 'tmrw' ? 'tmrw' : 'today'}`, handle: '__mlbPreplay', local: ['/api/postseason'], name: 'moonshot-preplay' },
}[sport]
if (!STAGE) { console.error('--sport is nhl or mlb'); process.exit(2) }
const base = arg('base', 'https://dashnetwork.vercel.app').replace(/\/$/, '')
const fps = Number(arg('fps', 30))
const out = arg('out', `${STAGE.name}-${game}.mp4`)
const proxy = arg('proxy-api')
const tail = Number(arg('tail', 3.5))
const maxS = Number(arg('max', 0))   // a test run: stop after this many seconds of video
const W = 1280

let chromium
try { ({ chromium } = await import('playwright-core')) } catch { ({ chromium } = await import('playwright')) }
const browser = await chromium.launch({
  executablePath: findBrowser([MAC_CHROME]),
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--hide-scrollbars'],
})
const page = await browser.newPage({ viewport: { width: W + 30, height: 1000 }, deviceScaleFactor: 1 })
page.on('pageerror', (e) => console.error('page error:', e.message.slice(0, 200)))
if (proxy) {
  await page.route('**/api/**', async (r) => {
    const u = new URL(r.request().url())
    if (STAGE.local.some((p) => u.pathname.startsWith(p))) return r.continue()
    try { await r.fulfill({ response: await r.fetch({ url: proxy + u.pathname + u.search }) }) } catch { await r.abort() }
  })
}
await page.goto(`${base}${STAGE.url}`, { waitUntil: 'domcontentloaded', timeout: 120000 })
await page.waitForFunction((h) => !!window[h], STAGE.handle, { timeout: 180000 })
await page.waitForTimeout(6000)   // logos and faces
// nothing fixed (the dock, the slip, the avatar) may sit over the stage
await page.addStyleTag({ content: '[data-replay-stage]{margin:0!important} nextjs-portal{display:none!important}' })
await page.evaluate(() => {
  for (const el of document.querySelectorAll('body *')) {
    const cs = getComputedStyle(el)
    if ((cs.position === 'fixed' || cs.position === 'sticky') && !el.closest('[data-replay-stage]')) el.style.visibility = 'hidden'
  }
})
const stage = page.locator('[data-replay-stage]')
// the MLB slate opens on its first upcoming game, whatever --game says: say so and stop rather than film the wrong game
if (sport === 'mlb') {
  const shown = await page.evaluate((h) => window[h].game?.(), STAGE.handle)
  if (String(shown) !== String(game)) { console.error(`the slate opened game ${shown}, not ${game}: open ${game} on the Games tab (it is not the slate's first upcoming game)`); await browser.close(); process.exit(1) }
}
// SPEED (2026-10-22): everything that is not the stage or one of its ancestors comes out of the page (display: none), so
// a frame does not re-lay-out and re-paint a slate of 61-column tables; then each frame is a fixed clip of the screen
// (no per-frame scroll and stability wait).
await page.evaluate(() => {
  let el = document.querySelector('[data-replay-stage]')
  while (el && el.parentElement && el !== document.body) {
    for (const sib of el.parentElement.children) if (sib !== el && !['SCRIPT', 'STYLE', 'LINK'].includes(sib.tagName)) sib.style.display = 'none'
    el = el.parentElement
  }
  window.scrollTo(0, 0)
})
await page.waitForTimeout(1500)
await stage.scrollIntoViewIfNeeded()
const box = await stage.boundingBox()
const clip = { x: Math.round(box.x), y: Math.round(box.y), width: Math.round(box.width), height: Math.round(box.height) }
console.log(`stage ${Math.round(box.width)}x${Math.round(box.height)} · ${fps} fps · ${base}`)

const dir = join(tmpdir(), `${STAGE.name}-${game}-${Date.now()}`)
mkdirSync(dir, { recursive: true })
const settle = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))))
const H = STAGE.handle
await page.evaluate((h) => window[h].start(), H)
let n = 0, after = -1
const t0 = Date.now()
for (;;) {
  await page.evaluate(([h, ms]) => window[h].step(ms), [H, 1000 / fps])
  await settle()
  writeFileSync(join(dir, `f${String(n).padStart(6, '0')}.png`), await page.screenshot({ type: 'png', clip }))
  n += 1
  if (after < 0 && await page.evaluate((h) => window[h].done(), H)) after = n
  if (after >= 0 && n - after >= tail * fps) break
  if (n % (fps * 5) === 0) console.log(`${(n / fps).toFixed(0)} s of video · ${((Date.now() - t0) / 1000).toFixed(0)} s spent`)
  if (n === 10) console.log(`first 10 frames: ${((Date.now() - t0) / 10000).toFixed(2)} s a frame`)
  if (maxS && n >= maxS * fps) break
  if (n > fps * 60 * 6) { console.error('over six minutes of video: stopping'); break }
}
await browser.close()

const enc = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', join(dir, 'f%06d.png'),
  '-vf', 'scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,format=yuv420p',
  '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-movflags', '+faststart', out], { stdio: 'inherit' })
if (enc.status !== 0) { console.error(`ffmpeg failed; frames kept in ${dir}`); process.exit(1) }
rmSync(dir, { recursive: true, force: true })
console.log(`wrote ${out}: ${n} frames, ${(n / fps).toFixed(1)} s`)
