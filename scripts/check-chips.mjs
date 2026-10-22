// CHIP AUDIT (2026-10-22, Donovan: "a full pass of making everything the same as far as the little chips and the little tappable
// things ... same shape and sizes ... cohesive ... thrown somewhere into the harness so we don't go over this again").
//
// Loads every page check-mobile loads (or --pages) at 390x844 and measures every CHIP: a button / [role=button] / link drawn as a
// small bordered or filled box with a short label (not a name link, not a table header, not the bottom bar). Each chip gets a
// family: shape (square = radius <= 4, pill = radius >= half its height, rounded between), height, font size / weight, capitals.
// THE STANDARD is lib/chips.js flatChip: square, 18-26px tall, 10px, capitals.
//
//   node scripts/check-chips.mjs --base http://localhost:3000            every page, report in chip-report/
//   node scripts/check-chips.mjs --base ... --pages "/app#sport=nba&tab=board"
//   node scripts/check-chips.mjs --base ... --max-off 400                fail when more than 400 chips are off the standard
//
// --max-off is the ratchet for the push gate: the number may only go down (write the new count in the commit).
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import './_esm-resolve.mjs'

const req = createRequire(`${process.cwd()}/package.json`)
const { chromium } = req('playwright-core')
const { MLB_TABS, NFL_TABS, NHL_TABS, NBA_TABS, appHref } = await import('../lib/routes.js')

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BASE = (arg('--base') || 'http://localhost:3000').replace(/\/$/, '')
const PAGES = arg('--pages')
const MAX_OFF = arg('--max-off') == null ? null : Number(arg('--max-off'))
const CONCURRENCY = Number(arg('--concurrency', 4))
const OUT = 'chip-report'
const BROWSERS = [arg('--browser'), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)
const executablePath = BROWSERS.find((p) => existsSync(p))
if (!executablePath) { console.error('No Chrome/Brave found; pass --browser /path/to/chrome'); process.exit(2) }
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

async function getJson(url) { try { const r = await fetch(url); return r.ok ? r.json() : null } catch { return null } }
async function routes() {
  if (PAGES) return PAGES.split(',').map((p) => p.trim())
  const list = [...MLB_TABS.map((t) => appHref('mlb', t)), ...NFL_TABS.map((t) => appHref('nfl', t)), ...NHL_TABS.map((t) => appHref('nhl', t)), '/', '/called?sport=mlb']
  if ((await getJson(`${BASE}/api/buckets/access`))?.open) list.push(...NBA_TABS.map((t) => appHref('nba', t)))
  return list
}

// in the page: every chip, measured
function measure() {
  const out = []
  const vis = (el) => { const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 }
  const where = (el) => { for (let a = el.parentElement; a; a = a.parentElement) { const l = a.getAttribute && (a.getAttribute('aria-label') || (a.tagName === 'SECTION' && a.querySelector('div')?.textContent?.slice(0, 30))); if (l) return String(l).slice(0, 40) } return '' }
  for (const el of document.querySelectorAll('button, [role=button], a[href]')) {
    if (!vis(el) || el.classList.contains('tap-link') || el.closest('th, nav, .mobile-tabbar, [class*="tabbar"]')) continue
    const text = (el.innerText || '').trim().replace(/\s+/g, ' ')
    if (!text || text.length > 28) continue
    const r = el.getBoundingClientRect()
    if (r.height < 14 || r.height > 48 || r.width > 260) continue
    const s = getComputedStyle(el)
    const bordered = parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none' && !/rgba\(\d+, \d+, \d+, 0\)/.test(s.borderTopColor)
    const filled = s.backgroundColor && !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(s.backgroundColor)
    if (!bordered && !filled) continue
    const rad = parseFloat(s.borderTopLeftRadius) || 0
    const h = Math.round(r.height)
    const shape = rad <= 4 ? 'square' : rad >= h / 2 - 1 ? 'pill' : 'rounded'
    const caps = s.textTransform === 'uppercase' || (text === text.toUpperCase() && /[A-Z]/.test(text))
    out.push({ text: text.slice(0, 24), where: where(el), shape, h, fs: parseFloat(s.fontSize), fw: Number(s.fontWeight), caps })
  }
  return out
}

const standard = (c) => c.shape === 'square' && c.h >= 18 && c.h <= 26 && c.fs === 10 && c.caps
const family = (c) => `${c.shape} · ${Math.round(c.h / 4) * 4}px tall · ${c.fs}px ${c.fw >= 700 ? 'bold' : 'regular'}${c.caps ? ' CAPS' : ''}`

const list = await routes()
const browser = await chromium.launch({ executablePath, headless: true })
const chips = []
let next = 0
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < list.length) {
    const path = list[next++]
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    try {
      await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {})
      await page.waitForTimeout(1200)
      for (const c of await page.evaluate(measure)) chips.push({ ...c, path })
    } catch (e) { console.error(`skip ${path}: ${e.message.slice(0, 80)}`) }
    await ctx.close()
  }
}))
await browser.close()

const fams = new Map()
for (const c of chips) { const f = family(c); const x = fams.get(f) || { n: 0, std: standard(c), ex: [], pages: new Set() }; x.n += 1; x.pages.add(c.path); if (x.ex.length < 4) x.ex.push(`"${c.text}"${c.where ? ` in ${c.where}` : ''} (${c.path})`); fams.set(f, x) }
const off = chips.filter((c) => !standard(c)).length
const lines = [`# Chip audit · ${new Date().toISOString().slice(0, 16)} · ${list.length} pages at 390`, '', `${chips.length} chips · ${chips.length - off} on the standard (lib/chips.js flatChip) · **${off} off it** · ${fams.size} looks`, '']
for (const [f, x] of [...fams].sort((a, b) => b[1].n - a[1].n)) lines.push(`- ${x.std ? '✅' : '❌'} **${f}** — ${x.n} on ${x.pages.size} pages · e.g. ${x.ex.join('; ')}`)
mkdirSync(OUT, { recursive: true })
writeFileSync(`${OUT}/index.md`, lines.join('\n') + '\n')
writeFileSync(`${OUT}/chips.json`, JSON.stringify(chips))
console.log(lines.slice(0, 3).join('\n'))
console.log(`families: ${fams.size} -> ${OUT}/index.md`)
if (MAX_OFF != null && off > MAX_OFF) { console.error(`FAIL: ${off} chips off the standard, the ceiling is ${MAX_OFF}`); process.exit(1) }
