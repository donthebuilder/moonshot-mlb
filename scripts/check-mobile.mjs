#!/usr/bin/env node
// PHONE CHECKS (mobile pass Part B, 2026-09-27 -- CLAUDE.md "Mobile is a
// testable product feature"). Loads every page on a phone and reports what a
// person would see as broken.
//
//   node scripts/check-mobile.mjs                       local build, 390x844
//   node scripts/check-mobile.mjs --base https://dashnetwork.vercel.app
//   node scripts/check-mobile.mjs --all                 + 360x780, 430x932, 844x390
//   node scripts/check-mobile.mjs --only nfl            one product (mlb|nfl|nhl|nba|public)
//   (nba only while BUCKETS is open to the server checked: /api/buckets/access)
//   node scripts/check-mobile.mjs --pages "/app#sport=nfl&tab=redzone,/called?sport=mlb"
//   --browser /path/to/chrome                           default: Chrome, then Brave
//
// ROUTES come from the registry (lib/routes.js MLB_TABS / NFL_TABS /
// NHL_TABS), never a hand list, plus the public pages and one player / team /
// game deep link per sport taken from live data.
//
// CHECKS, in the browser, per page (ERROR fails the run, WARN is listed):
//   BLEED      page scrolls sideways, or a visible element sticks out past the
//              right edge with no clipping or scrolling ancestor      ERROR
//   COVERED    at the bottom of the page, the fixed bottom bar covers the
//              last content                                          ERROR
//   CONSOLE    a page error                                          ERROR
//   SHEET      the More sheet is taller than the screen and can't scroll ERROR
//   CLIPPED    text cut off where it isn't an intended "…"           WARN
//   SMALL TAP  a visible button/link under 44px (ERROR under 32px on BOTH sides)
//   TINY       readable text (15+ chars) under 12px                   WARN
//   first-row y  the first table row / list item, recorded, not failed
//
// OUTPUT: mobile-report/index.md (page x viewport x findings) and a
// screenshot per page; exit 1 when any ERROR. mobile-report/ is gitignored.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import './_esm-resolve.mjs'

const req = createRequire(`${process.cwd()}/package.json`)
const { chromium } = req('playwright-core')
const { MLB_TABS, NFL_TABS, NHL_TABS, NBA_TABS, appHref, playerHref } = await import('../lib/routes.js')

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const has = (k) => process.argv.includes(k)
const BASE = (arg('--base') || 'http://localhost:3000').replace(/\/$/, '')
const ONLY = arg('--only')
const PAGES = arg('--pages')
const CONCURRENCY = Number(arg('--concurrency', 4))
const OUT = 'mobile-report'
const BROWSERS = [arg('--browser'), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)
const executablePath = BROWSERS.find((p) => existsSync(p))
if (!executablePath) { console.error('No Chrome/Brave found; pass --browser /path/to/chrome'); process.exit(2) }

const VIEWPORTS = [{ name: '390', width: 390, height: 844 }]
if (has('--all')) VIEWPORTS.push({ name: '360', width: 360, height: 780 }, { name: '430', width: 430, height: 932 }, { name: 'land', width: 844, height: 390 })
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

// ── the route list ─────────────────────────────────────────────────────────
async function getJson(url) { try { const r = await fetch(url); return r.ok ? r.json() : null } catch { return null } }
async function routes() {
  if (PAGES) return PAGES.split(',').map((p) => ({ group: 'pages', path: p.trim() }))
  const list = []
  const add = (group, path) => { if (!ONLY || ONLY === group) list.push({ group, path }) }
  for (const t of MLB_TABS) add('mlb', appHref('mlb', t))
  for (const t of NFL_TABS) add('nfl', appHref('nfl', t))
  for (const t of NHL_TABS) add('nhl', appHref('nhl', t))
  for (const p of ['/', '/start?sport=mlb', '/start?sport=nfl', '/start?sport=nhl', '/called?sport=mlb', '/called?sport=nfl', '/called?sport=nhl', '/nhl/standings', '/nhl/leaders', '/nhl/goalies', '/login', '/fantasy']) add('public', p)
  // One real player / team / game per sport, from live data.
  const DATA = 'https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current'
  const [slate, week, board] = await Promise.all([getJson(`${DATA}/today_slim.json`), getJson(`${DATA}/nfl_week.json`), getJson(`${BASE}/api/lamp/board`)])
  const mlbP = Array.isArray(slate) ? slate[0] : (slate?.rows || slate?.players || [])[0]
  if (mlbP?.player_id) add('mlb', playerHref('mlb', mlbP.player_id))
  const nflP = week?.players?.[0]
  if (nflP?.player_id) add('nfl', playerHref('nfl', nflP.player_id))
  const g = (board?.games || []).find((x) => x.rows?.length)
  if (g) {
    add('nhl', playerHref('nhl', g.rows[0].playerId))
    add('nhl', `/app#sport=nhl&tab=team&team=${g.game.home.abbrev}`)
    add('nhl', `/app#sport=nhl&tab=game&game=${g.game.id}`)
  }
  // BUCKETS: hidden until it opens, so only when this server says it is open
  if ((await getJson(`${BASE}/api/buckets/access`))?.open) {
    for (const t of NBA_TABS) add('nba', appHref('nba', t))
    const lead = (await getJson(`${BASE}/api/buckets/leaders`))?.categories?.[0]?.leaders?.[0]
    if (lead) { add('nba', playerHref('nba', lead.id)); add('nba', `/app#sport=nba&tab=team&team=${lead.team}`) }
    const log = lead ? (await getJson(`${BASE}/api/buckets/player?id=${lead.id}`))?.log?.[0] : null
    if (log) add('nba', `/app#sport=nba&tab=game&game=${log.id}`)
  }
  return list
}

// ── the checks, run inside the page ───────────────────────────────────────
function inPage() {
  const W = window.innerWidth
  const H = window.innerHeight
  const out = { bleed: [], clipped: [], small: [], tiny: [], covered: null, firstRowY: null, pageBleed: document.documentElement.scrollWidth > W + 1 }
  // Screen-reader-only text and the focus-only skip link are not on screen.
  const srOnly = (el) => el.closest('.sr-only, .skip-link, [aria-hidden="true"]') != null
  const vis = (el) => { if (srOnly(el)) return false; const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 }
  const label = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : ''} "${(el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 40)}"`
  // clipped or scrolled horizontally by an ancestor = contained, not bleeding
  const contained = (el) => {
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const s = getComputedStyle(a)
      if (['hidden', 'auto', 'scroll', 'clip'].includes(s.overflowX)) return true
    }
    return false
  }
  const all = [...document.body.querySelectorAll('*')]
  for (const el of all) {
    if (!vis(el)) continue
    const r = el.getBoundingClientRect()
    const s = getComputedStyle(el)
    if (r.right > W + 1 && r.left < W && !contained(el) && s.position !== 'fixed' && out.bleed.length < 12) out.bleed.push(`${label(el)} right=${Math.round(r.right)}`)
    const leafText = el.children.length === 0 && (el.textContent || '').trim().length > 0
    if (leafText) {
      if (el.scrollWidth > el.clientWidth + 1 && s.overflow !== 'visible' && s.overflowX !== 'visible' && out.clipped.length < 20) {
        out.clipped.push(`${label(el)}${s.textOverflow === 'ellipsis' ? ' (ellipsis)' : ''}`)
      }
      const fs = parseFloat(s.fontSize)
      if ((el.textContent || '').trim().length >= 15 && fs < 12 && out.tiny.length < 20) out.tiny.push(`${label(el)} ${fs}px`)
    }
  }
  for (const el of document.querySelectorAll('a[href], button, [role=button]')) {
    if (!vis(el)) continue
    const r = el.getBoundingClientRect()
    if (r.top > document.documentElement.scrollHeight) continue
    if (r.width < 44 || r.height < 44) out.small.push({ el: label(el), w: Math.round(r.width), h: Math.round(r.height), err: r.width < 32 && r.height < 32 })
  }
  const row = document.querySelector('table tbody tr, main li, [role=list] > *')
  if (row) out.firstRowY = Math.round(row.getBoundingClientRect().top + window.scrollY)
  return out
}

function coveredAtBottom() {
  window.scrollTo(0, document.documentElement.scrollHeight)
  const H = window.innerHeight
  const bars = [...document.querySelectorAll('body *')].filter((el) => {
    const s = getComputedStyle(el); if (s.position !== 'fixed') return false
    const r = el.getBoundingClientRect(); return r.bottom >= H - 2 && r.top > H * 0.6 && r.width > window.innerWidth * 0.6 && r.height < H * 0.3
  })
  if (!bars.length) return null
  const barTop = Math.min(...bars.map((b) => b.getBoundingClientRect().top))
  // the lowest in-flow element with content
  let lowest = null
  for (const el of document.querySelectorAll('main *, #__next *, body > div *')) {
    const s = getComputedStyle(el)
    if (s.position === 'fixed' || el.closest('[style*="position: fixed"]')) continue
    if (bars.some((b) => b.contains(el))) continue
    if (el.children.length || !(el.textContent || '').trim()) continue
    const r = el.getBoundingClientRect()
    if (r.height <= 0) continue
    if (!lowest || r.bottom > lowest.r.bottom) lowest = { el, r }
  }
  if (!lowest) return null
  return lowest.r.bottom > barTop + 1 ? `"${(lowest.el.textContent || '').trim().slice(0, 40)}" bottom=${Math.round(lowest.r.bottom)} under bar top=${Math.round(barTop)}` : null
}

async function checkSheet(page) {
  const more = page.getByRole('button', { name: /^(more|•••)$/i }).first()
  if (!(await more.count())) return null
  try { await more.click({ timeout: 2000 }) } catch { return null }
  await page.waitForTimeout(600)
  return page.evaluate(() => {
    const H = window.innerHeight
    const sheets = [...document.querySelectorAll('[role=dialog], body *')].filter((el) => {
      const s = getComputedStyle(el); if (s.position !== 'fixed') return false
      const r = el.getBoundingClientRect(); return r.height > H * 0.4 && r.width > window.innerWidth * 0.6
    })
    for (const el of sheets) {
      const r = el.getBoundingClientRect()
      if (r.height <= H + 1) continue
      const scrolls = [el, ...el.querySelectorAll('*')].some((x) => ['auto', 'scroll'].includes(getComputedStyle(x).overflowY) && x.scrollHeight > x.clientHeight)
      if (!scrolls) return `sheet ${Math.round(r.height)}px tall on a ${H}px screen and nothing in it scrolls`
    }
    return null
  })
}

// ── run ──────────────────────────────────────────────────────────────────
const list = await routes()
mkdirSync(`${OUT}/shots`, { recursive: true })
const browser = await chromium.launch({ executablePath, headless: true })
const results = []
const jobs = []
for (const vp of VIEWPORTS) for (const r of list) jobs.push({ ...r, vp })
let next = 0
const t0 = Date.now()
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < jobs.length) {
    const j = jobs[next++]
    const ctx = await browser.newContext({ viewport: { width: j.vp.width, height: j.vp.height }, userAgent: UA, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)))
    const res = { group: j.group, path: j.path, vp: j.vp.name, errors: [], warns: [], firstRowY: null }
    try {
      await page.goto(`${BASE}${j.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {})
      await page.waitForTimeout(1200)
      const f = await page.evaluate(inPage)
      res.firstRowY = f.firstRowY
      if (f.pageBleed) res.errors.push('BLEED page scrolls sideways')
      for (const b of f.bleed) res.errors.push(`BLEED ${b}`)
      for (const c of f.clipped) res.warns.push(`CLIPPED ${c}`)
      for (const t of f.tiny) res.warns.push(`TINY ${t}`)
      const smallErr = f.small.filter((s) => s.err)
      for (const s of smallErr.slice(0, 8)) res.errors.push(`SMALL TAP ${s.el} ${s.w}x${s.h}`)
      if (f.small.length - smallErr.length) res.warns.push(`SMALL TAP ${f.small.length - smallErr.length} target(s) under 44px (${f.small.filter((s) => !s.err).slice(0, 3).map((s) => `${s.el} ${s.w}x${s.h}`).join('; ')})`)
      await page.screenshot({ path: `${OUT}/shots/${j.group}-${j.vp.name}-${j.path.replace(/[^a-z0-9]+/gi, '_').slice(0, 60)}.png` })
      const cov = await page.evaluate(coveredAtBottom)
      if (cov) res.errors.push(`COVERED ${cov}`)
      if (j.vp.name === '390' && j.group !== 'public') {
        const sheet = await checkSheet(page)
        if (sheet) res.errors.push(`SHEET ${sheet}`)
      }
    } catch (e) {
      res.errors.push(`LOAD ${e.message.split('\n')[0].slice(0, 140)}`)
    }
    for (const e of errors) res.errors.push(`CONSOLE ${e}`)
    results.push(res)
    await ctx.close()
    process.stdout.write(res.errors.length ? 'x' : '.')
  }
}))
await browser.close()

// ── report ───────────────────────────────────────────────────────────────
results.sort((a, b) => a.group.localeCompare(b.group) || a.path.localeCompare(b.path) || a.vp.localeCompare(b.vp))
const bad = results.filter((r) => r.errors.length)
const byGroup = {}
for (const r of results) {
  const g = byGroup[r.group] ||= { pages: 0, errorPages: 0, errors: 0, warns: 0 }
  g.pages += 1; if (r.errors.length) g.errorPages += 1; g.errors += r.errors.length; g.warns += r.warns.length
}
const lines = [
  `# Mobile report -- ${new Date().toISOString().slice(0, 16)}Z`,
  '',
  `Base ${BASE} · viewports ${VIEWPORTS.map((v) => v.name).join(', ')} · ${results.length} page loads · ${Math.round((Date.now() - t0) / 1000)}s`,
  '',
  '| product | loads | pages with errors | errors | warnings |', '|---|---|---|---|---|',
  ...Object.entries(byGroup).map(([g, v]) => `| ${g} | ${v.pages} | ${v.errorPages} | ${v.errors} | ${v.warns} |`),
  '',
  '## Errors',
  ...(bad.length ? bad.flatMap((r) => [`### ${r.path} @ ${r.vp}`, ...r.errors.map((e) => `- ${e}`), '']) : ['None.', '']),
  '## Warnings',
  ...results.filter((r) => r.warns.length).flatMap((r) => [`### ${r.path} @ ${r.vp}`, ...r.warns.map((w) => `- ${w}`), '']),
  '## First-row y (recorded, not failed)',
  '| page | viewport | first row y |', '|---|---|---|',
  ...results.filter((r) => r.firstRowY != null).map((r) => `| ${r.path} | ${r.vp} | ${r.firstRowY} |`),
]
writeFileSync(`${OUT}/index.md`, `${lines.join('\n')}\n`)
console.log(`\n${results.length} loads, ${bad.length} with errors -> ${OUT}/index.md`)
for (const [g, v] of Object.entries(byGroup)) console.log(`  ${g}: ${v.errorPages}/${v.pages} pages with errors, ${v.warns} warnings`)
process.exit(bad.length ? 1 : 0)
