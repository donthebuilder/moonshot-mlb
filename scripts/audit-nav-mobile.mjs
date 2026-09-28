#!/usr/bin/env node
// NAV + MOBILE AUDIT (2026-09-27, BATCH-NAV-MOBILE-AUDIT-PLAN 00A). Checks the
// site against DASH-DIRECTION-STANDARDS.md sections B (navigation) and C
// (mobile), and is the regression test every later batch runs.
//
//   node scripts/audit-nav-mobile.mjs --base https://dashnetwork.vercel.app
//   node scripts/audit-nav-mobile.mjs --only sweep|clicks|journeys|perf
//   node scripts/audit-nav-mobile.mjs --pages "/app#sport=nfl&tab=boards,/start"   (sweep + clicks on these)
//   --perf-base https://dashnetwork.vercel.app   (perf against production while
//        the rest runs on a local `next start`: hundreds of loads cost Vercel)
//   --concurrency 3   --browser /path/to/chrome
//
// Logged out throughout (no accounts). Output: mobile-report/audit/
// results.json (every check, raw), index.md (scorecard + every failure) and
// shots/. Exit 1 when any P0/P1 is found.
//
// 1. SWEEP  every registered tab of MOONSHOT / TUDDY / LAMP (lib/routes.js,
//    never a hand list), the public pages, and one player / team / game /
//    goalie page per sport from live data, at 320x640, 375x812, 430x932 and
//    1280x900:
//      BLEED     the page scrolls sideways, or an element sticks out past the
//                right edge with no clipping/scrolling ancestor
//      OVERLAP   two visible text boxes intersect (not parent/child)
//      COVERED   the fixed bottom bar covers the last content
//      OFFSCREEN a button/link past the right edge that nothing scrolls to
//      SMALL     tap targets under 44px (phones; under 32px both ways = bad)
//      NAMES     a known player / team / game (from the data files) that is
//                not tappable
//      CONSOLE   a page error
// 2. CLICKS (375 + 1280, nav tabs only)
//      a  up to 3 player names, 2 team codes, 1 game per page: click, then
//         does what opened match the name, and does the URL carry its ID and
//         the same sport? (MLB p=, NFL player=, NHL player= / team= / game=)
//      b  up to 10 cursor:pointer elements: does a click change anything
//         (URL, DOM, a dialog, a new tab)? A pointer with no action = dead.
// 3. JOURNEYS (375; every step re-checked by refresh and by opening its URL
//    in a fresh tab): home -> Live -> game -> player -> team -> back x3;
//    board filter + sort -> player -> back; sport switches; dates; push and
//    X links per sport; invalid ids / tabs / dates; a live page left open
//    for two refreshes; a date race on a slow network.
// 4. PERF (375, slow 4G + 4x CPU): LCP, CLS, JS bytes, requests per route;
//    /api calls per minute on a live page (from journey 7).
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import './_esm-resolve.mjs'

const req = createRequire(`${process.cwd()}/package.json`)
const { chromium } = req('playwright-core')
const { MLB_TABS, NFL_TABS, NHL_TABS, appHref, playerHref } = await import('../lib/routes.js')
const { postPath, withQuery } = await import('../lib/dash/postLink.js')

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BASE = (arg('--base') || 'http://localhost:3000').replace(/\/$/, '')
const ONLY = arg('--only')
const PAGES = arg('--pages')
const CONCURRENCY = Number(arg('--concurrency', 3))
const OUT = 'mobile-report/audit'
const BROWSERS = [arg('--browser'), '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)
const executablePath = BROWSERS.find((p) => existsSync(p))
if (!executablePath) { console.error('No Chrome/Brave found; pass --browser /path/to/chrome'); process.exit(2) }
const run = (part) => !ONLY || ONLY === part
const PERF_BASE = (arg('--perf-base') || BASE).replace(/\/$/, '')

const VIEWPORTS = [
  { name: '320', width: 320, height: 640, phone: true },
  { name: '375', width: 375, height: 812, phone: true },
  { name: '430', width: 430, height: 932, phone: true },
  { name: '1280', width: 1280, height: 900, phone: false },
]
const VP = Object.fromEntries(VIEWPORTS.map((v) => [v.name, v]))
const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const ctxOpts = (vp) => (vp.phone
  ? { viewport: { width: vp.width, height: vp.height }, userAgent: UA_PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
  : { viewport: { width: vp.width, height: vp.height } })

// ── known entities, from the data (never guessed) ──────────────────────────
const RAW = 'https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current'
const getJson = async (u) => { try { const r = await fetch(u); return r.ok ? r.json() : null } catch { return null } }
const [slate, week, lampPlayers, lampBoard] = await Promise.all([getJson(`${RAW}/today_slim.json`), getJson(`${RAW}/nfl_week.json`), getJson(`${BASE}/api/lamp/players`), getJson(`${BASE}/api/lamp/board`)])
const ENT = { mlb: new Map(), nfl: new Map(), nhl: new Map() }   // name -> id
const TEAMS = new Set()
const mlbRows = Array.isArray(slate) ? slate : slate?.rows || slate?.players || []
for (const r of mlbRows) { if (r?.name && r?.player_id) ENT.mlb.set(r.name, String(r.player_id)); if (r?.team) TEAMS.add(r.team); if (r?.pitcher_name && r?.pitcher_id) ENT.mlb.set(r.pitcher_name, String(r.pitcher_id)) }
for (const p of week?.players || []) { if (p?.name && p.position !== 'DEF') ENT.nfl.set(p.name, String(p.player_id)); if (p?.team) TEAMS.add(p.team) }
for (const p of lampPlayers?.players || []) { const id = p.id ?? p.playerId ?? p.player_id; if (p?.name && id) ENT.nhl.set(p.name, String(id)); if (p?.team) TEAMS.add(p.team) }
const ALL_NAMES = new Map([...ENT.nhl, ...ENT.nfl, ...ENT.mlb])
console.log(`known: MLB ${ENT.mlb.size}, NFL ${ENT.nfl.size}, NHL ${ENT.nhl.size} names; ${TEAMS.size} team codes`)
const firstOf = (m) => [...m.entries()][0] || [null, null]

// ── the page list ─────────────────────────────────────────────────────────
function pageList() {
  if (PAGES) return PAGES.split(',').map((p) => ({ group: 'pages', path: p.trim(), nav: true }))
  const list = []
  const add = (group, path, nav = false) => list.push({ group, path, nav })
  for (const t of MLB_TABS) add('mlb', appHref('mlb', t), true)
  for (const t of NFL_TABS) add('nfl', appHref('nfl', t), true)
  for (const t of NHL_TABS) add('nhl', appHref('nhl', t), true)
  for (const p of ['/', '/start?sport=mlb', '/start?sport=nfl', '/start?sport=nhl', '/called?sport=mlb', '/called?sport=nfl', '/called?sport=nhl', '/nhl/standings', '/nhl/leaders', '/nhl/goalies']) add('public', p)
  const [, mlbId] = firstOf(ENT.mlb); if (mlbId) add('mlb', playerHref('mlb', mlbId))
  const [, nflId] = firstOf(ENT.nfl); if (nflId) add('nfl', playerHref('nfl', nflId))
  const g = (lampBoard?.games || []).find((x) => x.rows?.length)
  const [, nhlId] = firstOf(ENT.nhl)
  if (nhlId) add('nhl', playerHref('nhl', nhlId))
  const goalie = (lampPlayers?.players || []).find((p) => p.pos === 'G' || p.position === 'G')
  if (goalie) add('nhl', playerHref('nhl', goalie.id ?? goalie.playerId ?? goalie.player_id))
  if (g) { add('nhl', `/app#sport=nhl&tab=team&team=${g.game.home.abbrev}`); add('nhl', `/app#sport=nhl&tab=game&game=${g.game.id}`) }
  else add('nhl', '/app#sport=nhl&tab=team&team=TOR')
  return list
}

// ── in-page checks ────────────────────────────────────────────────────────
function inPage({ names, teams }) {
  const W = window.innerWidth
  const N = new Set(names); const T = new Set(teams)
  const GAME = /^([A-Z]{2,3})\s*(?:@|v|vs\.?)\s*([A-Z]{2,3})$/
  const out = { pageBleed: document.documentElement.scrollWidth > W + 1, scrollWidth: document.documentElement.scrollWidth, bleed: [], overlap: [], offscreen: [], small: [], smallBad: [], names: { total: 0, bad: [] } }
  const hidden = (el) => el.closest('.sr-only, .skip-link, [aria-hidden="true"], svg, title, script, style') != null
  const vis = (el) => { if (hidden(el)) return false; const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false; const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1 }
  const label = (el) => `${el.tagName.toLowerCase()} "${(el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 36)}"`
  const scroller = (el) => { for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) { const s = getComputedStyle(a); if (['hidden', 'auto', 'scroll', 'clip'].includes(s.overflowX)) return a } return null }
  const inFixed = (el) => { for (let a = el; a && a !== document.body; a = a.parentElement) { const p = getComputedStyle(a).position; if (p === 'fixed' || p === 'sticky') return true } return false }
  const tappable = (el) => {
    if (el.closest('a,button,[role=button],[role=link],summary,[onclick],select,option,label')) return true
    for (let e = el, i = 0; e && i < 6; e = e.parentElement, i++) if (getComputedStyle(e).cursor === 'pointer') return true
    return false
  }
  const leaves = []
  for (const el of document.body.querySelectorAll('*')) {
    if (!vis(el)) continue
    const r = el.getBoundingClientRect()
    if (r.right > W + 1 && r.left < W && !scroller(el) && getComputedStyle(el).position !== 'fixed' && out.bleed.length < 10) out.bleed.push(`${label(el)} right=${Math.round(r.right)}`)
    if (el.children.length === 0) {
      const t = (el.textContent || '').trim()
      if (t.length >= 2) leaves.push({ el, r, t })
      if (t && t.length <= 40 && !el.closest('header,nav')) {
        const kind = N.has(t) ? 'player' : T.has(t) ? 'team' : (GAME.test(t) && T.has(t.match(GAME)[1]) && T.has(t.match(GAME)[2])) ? 'game' : null
        if (kind) { out.names.total++; if (!tappable(el)) out.names.bad.push(`${kind}:${t}`) }
      }
    }
  }
  // OVERLAP: text that visibly sits on other text. Measured per LINE
  // (getClientRects -- a wrapped inline span's bounding box covers both
  // lines and "overlaps" its neighbours), each line box cut to what its
  // clipping/scrolling ancestors actually show (a collapsed panel's text
  // takes layout but is not on screen), outside fixed/sticky bars, and only
  // where the browser says the element is visible. Two boxes must intersect
  // by more than a quarter of the smaller one.
  const clipBoxes = (el) => {
    if (el.checkVisibility && !el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })) return []
    let boxes = [...el.getClientRects()].map((r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom }))
    for (let a = el.parentElement; a && a !== document.body && boxes.length; a = a.parentElement) {
      const st = getComputedStyle(a)
      if (st.overflowX === 'visible' && st.overflowY === 'visible') continue
      const c = a.getBoundingClientRect()
      boxes = boxes.map((x) => ({ l: Math.max(x.l, c.left), t: Math.max(x.t, c.top), r: Math.min(x.r, c.right), b: Math.min(x.b, c.bottom) }))
        .filter((x) => x.r - x.l > 2 && x.b - x.t > 2)
    }
    return boxes.filter((x) => (x.r - x.l) * (x.b - x.t) > 30)
  }
  const texts = leaves.filter((x) => !inFixed(x.el)).map((x) => ({ ...x, boxes: clipBoxes(x.el) })).filter((x) => x.boxes.length)
  const rows = new Map()
  texts.forEach((tx, i) => { for (const bx of tx.boxes) for (let y = Math.floor((bx.t + scrollY) / 100); y <= Math.floor((bx.b + scrollY) / 100); y++) { if (!rows.has(y)) rows.set(y, new Set()); rows.get(y).add(i) } })
  const seen = new Set()
  for (const set of rows.values()) {
    const idx = [...set]
    for (let a = 0; a < idx.length && out.overlap.length < 12; a++) for (let b = a + 1; b < idx.length && out.overlap.length < 12; b++) {
      const key = idx[a] < idx[b] ? `${idx[a]}|${idx[b]}` : `${idx[b]}|${idx[a]}`
      if (seen.has(key)) continue; seen.add(key)
      const A = texts[idx[a]], B2 = texts[idx[b]]
      if (A.el.contains(B2.el) || B2.el.contains(A.el)) continue
      let hit = null
      for (const x of A.boxes) for (const y of B2.boxes) {
        const iw = Math.min(x.r, y.r) - Math.max(x.l, y.l), ih = Math.min(x.b, y.b) - Math.max(x.t, y.t)
        if (iw > 2 && ih > 2 && iw * ih > 0.25 * Math.min((x.r - x.l) * (x.b - x.t), (y.r - y.l) * (y.b - y.t))) { hit = x; break }
      }
      if (hit) out.overlap.push(`"${A.t.slice(0, 24)}" x "${B2.t.slice(0, 24)}" at y=${Math.round(hit.t + scrollY)}`)
    }
  }
  for (const el of document.querySelectorAll('a[href], button, [role=button], select, input:not([type=hidden])')) {
    if (!vis(el)) continue
    const r = el.getBoundingClientRect()
    if (r.left >= W - 1 && !scroller(el) && getComputedStyle(el).position !== 'fixed' && out.offscreen.length < 8) out.offscreen.push(label(el))
    if (r.width < 44 || r.height < 44) { out.small.push(label(el)); if (r.width < 32 && r.height < 32) out.smallBad.push(`${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}`) }
  }
  const row = document.querySelector('table tbody tr, main li, [role=list] > *')
  out.firstRowY = row ? Math.round(row.getBoundingClientRect().top + window.scrollY) : null
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
  let lowest = null
  for (const el of document.querySelectorAll('body *')) {
    if (el.children.length || !(el.textContent || '').trim()) continue
    let fixed = false; for (let a = el; a; a = a.parentElement) if (getComputedStyle(a).position === 'fixed') { fixed = true; break }
    if (fixed) continue
    const r = el.getBoundingClientRect(); if (r.height <= 0) continue
    if (!lowest || r.bottom > lowest.r.bottom) lowest = { el, r }
  }
  if (!lowest) return null
  return lowest.r.bottom > barTop + 1 ? `"${(lowest.el.textContent || '').trim().slice(0, 40)}" bottom=${Math.round(lowest.r.bottom)} under bar top=${Math.round(barTop)}` : null
}

// What the screen is showing, to compare with the URL.
function signature() {
  const vis = (el) => { const s = getComputedStyle(el); const r = el.getBoundingClientRect(); return s.display !== 'none' && s.visibility !== 'hidden' && r.width > 1 && r.height > 1 }
  let brand = null
  for (const w of ['MOONSHOT', 'TUDDY', 'LAMP']) {
    const hit = [...document.querySelectorAll('body *')].find((el) => el.children.length === 0 && (el.textContent || '').trim() === w && vis(el) && el.getBoundingClientRect().top < 120 && parseFloat(getComputedStyle(el).fontSize) >= 15)
    if (hit) { brand = w; break }
  }
  const dlg = [...document.querySelectorAll('[role=dialog], .modal-box, [aria-modal="true"]')].find(vis)
  const active = [...document.querySelectorAll('[aria-current="page"], nav [aria-selected="true"], [role=tab][aria-selected="true"]')].filter(vis).map((e) => (e.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 24)).filter(Boolean)
  const h = [...document.querySelectorAll('h1, h2')].find(vis)
  const text = (document.body.innerText || '').replace(/\s+/g, ' ')
  return {
    url: location.pathname + location.search + location.hash,
    brand, active: active.slice(0, 3),
    dialog: dlg ? (dlg.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 120) : null,
    heading: h ? (h.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 80) : null,
    notFound: /not found|no such|isn.t a page|unavailable|doesn.t exist|couldn.t find|unknown/i.test(text.slice(0, 4000)),
    scrollY: Math.round(window.scrollY),
  }
}

const hashOf = (u) => { try { return new URLSearchParams(new URL(u, BASE).hash.slice(1)) } catch { return new URLSearchParams() } }
const sportOfUrl = (u) => hashOf(u).get('sport') || (new URL(u, BASE).searchParams.get('sport')) || null
const idInUrl = (u) => { const h = hashOf(u); return h.get('p') || h.get('player') || null }

async function settle(page, ms = 1500) {
  await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {})
  await page.waitForTimeout(ms)
}
async function open(_unused, vp, path) {
  const ctx = await (await B()).newContext(ctxOpts(vp))
  const page = await ctx.newPage()
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message.slice(0, 160)))
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
  await settle(page)
  return { ctx, page, errors }
}

const findings = []   // { sev, area, page, vp, what, repro, expected, actual }
const F = (f) => findings.push(f)
const shotName = (s) => s.replace(/[^a-z0-9]+/gi, '_').slice(0, 70)
mkdirSync(`${OUT}/shots`, { recursive: true })
// A 40-minute run outlives a browser now and then: relaunch on disconnect
// rather than failing every page after the crash.
const launch = () => chromium.launch({ executablePath, headless: true })
let browserRef = await launch()
let relaunching = null
async function B() {
  if (browserRef.isConnected()) return browserRef
  relaunching ||= launch().then((b) => { browserRef = b; relaunching = null; console.log('\n(browser relaunched)'); return b })
  return relaunching
}
const t0 = Date.now()
const results = { base: BASE, at: new Date().toISOString(), sweep: [], clicks: [], journeys: [], perf: [] }

async function pool(jobs, fn) {
  let next = 0
  await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
    while (next < jobs.length) { const j = jobs[next++]; try { await fn(j) } catch (e) { F({ sev: 'P2', area: 'harness', page: j.path, vp: j.vp?.name, what: `audit step crashed: ${String(e.message || e).split('\n')[0].slice(0, 140)}` }) } }
  }))
}

// ── 1. SWEEP ──────────────────────────────────────────────────────────────
const list = pageList()
if (run('sweep')) {
  const jobs = []
  for (const vp of VIEWPORTS) for (const p of list) jobs.push({ ...p, vp })
  await pool(jobs, async (j) => {
    let o
    try { o = await open(null, j.vp, j.path) } catch (e) { F({ sev: 'P1', area: 'load', page: j.path, vp: j.vp.name, what: `did not load: ${e.message.split('\n')[0].slice(0, 120)}` }); return }
    const { ctx, page, errors } = o
    try {
    const f = await page.evaluate(inPage, { names: [...ALL_NAMES.keys()], teams: [...TEAMS] })
    await page.screenshot({ path: `${OUT}/shots/sweep-${j.vp.name}-${shotName(j.path)}.png` })
    const cov = j.vp.phone ? await page.evaluate(coveredAtBottom) : null
    const r = { path: j.path, group: j.group, vp: j.vp.name, ...f, small: f.small.length, covered: cov, errors }
    results.sweep.push(r)
    const at = { page: j.path, vp: j.vp.name }
    if (f.pageBleed) F({ sev: 'P1', area: 'overflow', ...at, what: `page scrolls sideways (${f.scrollWidth}px on ${j.vp.width})`, actual: f.bleed.slice(0, 3).join('; ') })
    else if (f.bleed.length) F({ sev: 'P2', area: 'overflow', ...at, what: 'element sticks out past the right edge', actual: f.bleed.slice(0, 3).join('; ') })
    if (f.overlap.length) F({ sev: j.vp.phone ? 'P2' : 'P3', area: 'overlap', ...at, what: `${f.overlap.length} overlapping text box pair(s)`, actual: f.overlap.slice(0, 4).join('; ') })
    if (cov) F({ sev: 'P2', area: 'covered', ...at, what: 'bottom bar covers the last content', actual: cov })
    if (f.offscreen.length) F({ sev: 'P2', area: 'offscreen', ...at, what: 'controls past the right edge, nothing scrolls to them', actual: f.offscreen.join('; ') })
    if (j.vp.phone && f.smallBad.length) F({ sev: 'P3', area: 'tap', ...at, what: `${f.smallBad.length} tap target(s) under 32px both ways (${f.small.length} under 44)`, actual: f.smallBad.slice(0, 4).join('; ') })
    if (f.names.bad.length) F({ sev: 'P2', area: 'names', ...at, what: `${f.names.bad.length} of ${f.names.total} names/teams/games not tappable`, actual: [...new Set(f.names.bad)].slice(0, 6).join(', ') })
    if (errors.length) F({ sev: 'P1', area: 'console', ...at, what: 'page error', actual: errors.slice(0, 2).join(' | ') })
    } finally { await ctx.close().catch(() => {}) }
    process.stdout.write('.')
  })
  console.log(`\nsweep: ${results.sweep.length} loads`)
}

// ── 2. CLICKS ─────────────────────────────────────────────────────────────
// A hash-only goto is a same-document navigation the app may not reset on;
// go through about:blank so every target starts from a clean load.
async function reopen(page, path) {
  await page.goto('about:blank').catch(() => {})
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await settle(page, 1000)
}
async function clickNames(_unused, vp, p) {
  const out = []
  const sport = sportOfUrl(p.path)
  const { ctx, page } = await open(null, vp, p.path)
  const targets = await page.evaluate(({ names, teams }) => {
    const N = new Set(names); const T = new Set(teams)
    const GAME = /^([A-Z]{2,3})\s*(?:@|v|vs\.?)\s*([A-Z]{2,3})$/
    const pick = { player: [], team: [], game: [] }
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length || el.closest('header,nav,[aria-hidden="true"]')) continue
      const t = (el.textContent || '').trim(); if (!t || t.length > 40) continue
      const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) continue
      const kind = N.has(t) ? 'player' : T.has(t) ? 'team' : GAME.test(t) ? 'game' : null
      if (!kind) continue
      if (pick[kind].some((x) => x.t === t)) continue
      const tag = `name-${Object.values(pick).flat().length}`
      el.setAttribute('data-audit-name', tag)
      pick[kind].push({ t, tag })
    }
    return [...pick.player.slice(0, 3), ...pick.team.slice(0, 2).map((x) => ({ ...x, team: true })), ...pick.game.slice(0, 1).map((x) => ({ ...x, game: true }))]
  }, { names: [...ALL_NAMES.keys()], teams: [...TEAMS] })
  // before/after are both the site-relative path + query + hash (signature()'s
  // shape) -- comparing page.url()'s absolute form with it never matched.
  const rel = (u) => { try { const x = new URL(u); return x.pathname + x.search + x.hash } catch { return u } }
  for (const t of targets) {
    const before = rel(page.url())
    const kind = t.team ? 'team' : t.game ? 'game' : 'player'
    await page.evaluate(({ text, tag }) => {
      if (document.querySelector(`[data-audit-name="${tag}"]`)) return
      for (const el of document.querySelectorAll('body *')) {
        if (el.children.length || el.closest('header,nav,[aria-hidden="true"]')) continue
        const r = el.getBoundingClientRect()
        if ((el.textContent || '').trim() === text && r.width > 1 && r.height > 1) { el.setAttribute('data-audit-name', tag); return }
      }
    }, { text: t.t, tag: t.tag })
    const loc = page.locator(`[data-audit-name="${t.tag}"]`)
    let clicked = false; let why = null
    const popup = page.context().waitForEvent('page', { timeout: 1500 }).catch(() => null)
    try { await loc.scrollIntoViewIfNeeded({ timeout: 2000 }); await loc.click({ timeout: 2500 }); clicked = true } catch (e) { why = (String(e.message).match(/intercepts pointer events|not visible|outside of the viewport|detached|Timeout/) || ['unclickable'])[0] }
    const newTab = await popup
    await page.waitForTimeout(1300)
    const sig = await page.evaluate(signature)
    const res = { page: p.path, vp: vp.name, kind, text: t.t, clicked, why, before, after: sig.url, dialog: sig.dialog, heading: sig.heading, newTab: newTab ? newTab.url() : null }
    const at = { page: p.path, vp: vp.name, repro: `${p.path} @${vp.name}: tap "${t.t}"` }
    if (!clicked) { res.verdict = `not clickable (${why})`; if (why === 'intercepts pointer events') F({ sev: 'P2', area: 'covered', ...at, what: `"${t.t}" is covered by another element (a tap lands on that instead)` }) }
    else if (kind === 'player') {
      const want = ENT[sport]?.get(t.t) || ALL_NAMES.get(t.t)
      const got = idInUrl(sig.url)
      const shows = [sig.dialog, sig.heading].some((x) => x && x.includes(t.t.split(' ').slice(-1)[0]))
      const sportAfter = sportOfUrl(sig.url)
      if (sportAfter && sport && sportAfter !== sport) { res.verdict = 'wrong sport'; F({ sev: 'P0', area: 'click', ...at, what: 'player tap changed sport', expected: sport, actual: sportAfter }) }
      else if (!shows && sig.url === before) { res.verdict = 'nothing opened'; F({ sev: 'P1', area: 'click', ...at, what: 'player name tap opened nothing', expected: `${t.t}'s card/page`, actual: 'no URL change, no card' }) }
      else if (got && want && got !== want) { res.verdict = 'wrong id'; F({ sev: 'P0', area: 'click', ...at, what: 'player tap opened a different ID', expected: want, actual: got }) }
      else if (!got) { res.verdict = 'opened, URL has no id'; F({ sev: 'P1', area: 'url', ...at, what: 'player opened but the URL does not carry his ID (refresh / share loses him)', expected: `p=/player=${want || '?'}`, actual: sig.url }) }
      else res.verdict = 'ok'
    } else {
      const h = hashOf(sig.url)
      const carries = kind === 'team' ? h.get('team') : h.get('game')
      if (sig.url === before && !sig.dialog && !newTab) { res.verdict = 'nothing opened'; F({ sev: 'P2', area: 'click', ...at, what: `${kind} tap opened nothing visible`, actual: 'no URL change, no card' }) }
      else if (!carries) { res.verdict = 'opened, URL has no entity'; F({ sev: 'P1', area: 'url', ...at, what: `${kind} opened but the URL does not say which ${kind}`, expected: `${kind}=…`, actual: sig.url }) }
      else res.verdict = 'ok'
    }
    out.push(res)
    if (newTab) await newTab.close().catch(() => {})
    if (rel(page.url()) !== before || sig.dialog) await reopen(page, p.path)
  }
  // b. dead pointers
  const cands = await page.evaluate(() => {
    const out = []
    const all = [...document.querySelectorAll('body *')]
    for (const el of all) {
      if (out.length >= 10) break
      const s = getComputedStyle(el); if (s.cursor !== 'pointer') continue
      if (el.parentElement && getComputedStyle(el.parentElement).cursor === 'pointer') continue
      if (el.closest('a[href], header, nav, select, input, label')) continue
      const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4 || r.top > 4000) continue
      const tag = `audit-${out.length}`
      el.setAttribute('data-audit', tag)
      out.push({ tag, label: `${el.tagName.toLowerCase()} "${(el.innerText || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 30)}"` })
    }
    return out
  })
  for (const c of cands) {
    const loc = page.locator(`[data-audit="${c.tag}"]`)
    if (!(await loc.count())) continue
    await page.evaluate(() => { window.__mut = 0; window.__mo?.disconnect(); window.__mo = new MutationObserver((m) => { window.__mut += m.filter((x) => !(x.type === 'attributes' && String(x.attributeName).startsWith('data-audit'))).length }); window.__mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }) })
    const before = page.url()
    const popup = page.context().waitForEvent('page', { timeout: 1200 }).catch(() => null)
    let ok = true; let why = null
    try { await loc.scrollIntoViewIfNeeded({ timeout: 1500 }); await loc.click({ timeout: 2000 }) } catch (e) { ok = false; why = (String(e.message).match(/intercepts pointer events|not visible|outside of the viewport|detached|Timeout/) || ['unclickable'])[0] }
    const nt = await popup
    await page.waitForTimeout(700)
    const mut = await page.evaluate(() => window.__mut || 0)
    const changed = page.url() !== before || mut > 0 || nt
    out.push({ page: p.path, vp: vp.name, kind: 'pointer', text: c.label, clicked: ok, verdict: !ok ? `not clickable (${why})` : changed ? 'ok' : 'dead' })
    if (ok && !changed) F({ sev: 'P3', area: 'dead-pointer', page: p.path, vp: vp.name, what: 'cursor:pointer with no action', actual: c.label, repro: `${p.path} @${vp.name}: click ${c.label}` })
    if (nt) await nt.close().catch(() => {})
    if (page.url() !== before) { await reopen(page, p.path); break }
    await page.keyboard.press('Escape').catch(() => {})
  }
  await ctx.close()
  return out
}
if (run('clicks')) {
  const jobs = []
  for (const vp of [VP['375'], VP['1280']]) for (const p of list.filter((x) => x.nav)) jobs.push({ ...p, vp })
  await pool(jobs, async (j) => { results.clicks.push(...await clickNames(null, j.vp, j)); process.stdout.write('c') })
  console.log(`\nclicks: ${results.clicks.length}`)
}

// ── 3. JOURNEYS ───────────────────────────────────────────────────────────
// Each step records the URL and what's on screen, then proves the URL by a
// refresh and by opening it in a fresh tab: the same brand, dialog/heading.
async function proveStep(page, step, journey) {
  if (!page.url().startsWith(BASE)) { step.sig = { url: page.url() }; step.urlHolds = null; return step.sig }
  const here = await page.evaluate(signature)
  step.sig = here
  // Live pages change between two loads; what must match is the product,
  // whether a card is open (and whose), and the page's heading word.
  const same = (a, b) => a.brand === b.brand && Boolean(a.dialog) === Boolean(b.dialog) && (a.dialog || '').slice(0, 24) === (b.dialog || '').slice(0, 24) && (a.heading || '').slice(0, 12) === (b.heading || '').slice(0, 12)
  const fresh = await (await B()).newContext(ctxOpts(VP['375']))
  const p2 = await fresh.newPage()
  await p2.goto(`${BASE}${here.url}`, { waitUntil: 'domcontentloaded', timeout: 60000 }).catch(() => {})
  await settle(p2, 2500)
  const there = await p2.evaluate(signature).catch(() => ({}))
  await fresh.close()
  step.newTab = there
  step.urlHolds = same(here, there)
  if (!step.urlHolds) F({ sev: 'P1', area: 'deep-link', page: here.url, vp: '375', what: `${journey}: "${step.name}" is not what its URL opens in a new tab`, expected: `${here.brand} · ${here.dialog?.slice(0, 40) || here.heading}`, actual: `${there.brand} · ${there.dialog?.slice(0, 40) || there.heading}`, repro: `${journey}, step "${step.name}", then open the URL in a new tab` })
  return here
}
async function tapText(page, re, { within = 'body', timeout = 3000 } = {}) {
  const loc = page.locator(within).getByText(re).first()
  if (!(await loc.count())) return false
  try { await loc.scrollIntoViewIfNeeded({ timeout }); await loc.click({ timeout }); await settle(page, 1200); return true } catch { return false }
}
async function tapKnown(page, map, kind = 'player') {
  const names = [...map.keys()]
  const hit = await page.evaluate(({ names }) => {
    const N = new Set(names)
    for (const el of document.querySelectorAll('body *')) {
      if (el.children.length || el.closest('header,nav')) continue
      const t = (el.textContent || '').trim(); const r = el.getBoundingClientRect()
      if (N.has(t) && r.width > 1 && r.height > 1) return t
    }
    return null
  }, { names })
  if (!hit) return null
  try { const l = page.getByText(hit, { exact: true }).first(); await l.scrollIntoViewIfNeeded({ timeout: 2000 }); await l.click({ timeout: 2500 }); await settle(page, 1200); return hit } catch { return null }
}

async function journey(name, fn) {
  const steps = []
  let ctx, page
  const errors = []
  try {
    ctx = await (await B()).newContext(ctxOpts(VP['375']))
    page = await ctx.newPage()
    await page.goto('about:blank')
    page.on('pageerror', (e) => errors.push(e.message.slice(0, 140)))
  } catch (e) { results.journeys.push({ name, steps: [{ name: 'could not open a browser tab', ok: false, error: String(e.message).slice(0, 120) }], errors }); return }
  const step = async (label, action) => {
    const s = { name: label }
    try { s.ok = await action(page) !== false } catch (e) { s.ok = false; s.error = String(e.message || e).split('\n')[0].slice(0, 120) }
    await proveStep(page, s, name).catch(() => {})
    steps.push(s)
    return s
  }
  try { await fn(page, step) } catch (e) { steps.push({ name: 'crashed', ok: false, error: String(e.message || e).slice(0, 140) }) }
  await page.screenshot({ path: `${OUT}/shots/journey-${shotName(name)}.png` }).catch(() => {})
  results.journeys.push({ name, steps, errors })
  if (errors.length) F({ sev: 'P1', area: 'console', page: name, vp: '375', what: 'page error during journey', actual: errors.slice(0, 2).join(' | ') })
  await ctx.close().catch(() => {})
  process.stdout.write('j')
}

const go = async (page, path) => {
  if (page.url().startsWith(BASE)) await page.goto('about:blank').catch(() => {})
  await page.goto(`${BASE}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 })
  await settle(page)
}

if (run('journeys')) {
  // J1: MLB home -> Live -> a game -> a player -> his team -> back x3
  await journey('J1 MLB home > Live > game > player > team > back x3', async (page, step) => {
    await step('home', (p) => go(p, '/app#sport=mlb'))
    await step('Live', (p) => tapText(p, /^Live$/))
    await step('a game', async (p) => {
      const t = await p.evaluate(() => {
        const G = /^([A-Z]{2,3})\s*(?:@|v|vs\.?)\s*([A-Z]{2,3})$/
        for (const el of document.querySelectorAll('body *')) { if (el.children.length || el.closest('header,nav')) continue; const t = (el.textContent || '').trim(); if (G.test(t) && el.getBoundingClientRect().width > 1) return t }
        return null
      })
      if (!t) { F({ sev: 'P1', area: 'journey', page: '/app#sport=mlb&tab=scoreboard', vp: '375', what: 'J1: no tappable game on Live', repro: 'MLB -> Live' }); return false }
      const before = p.url(); await tapText(p, new RegExp(`^${t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`))
      if (p.url() === before) F({ sev: 'P1', area: 'url', page: before, vp: '375', what: `J1: opening game "${t}" does not change the URL (no deep link to a game)`, repro: 'MLB -> Live -> tap a game' })
    })
    await step('a player', async (p) => { const n = await tapKnown(p, ENT.mlb); if (!n) { F({ sev: 'P2', area: 'journey', page: p.url(), vp: '375', what: 'J1: no tappable player on the game view' }); return false } })
    await step('his team', async (p) => {
      const before = p.url()
      const hit = await p.evaluate((teams) => { const T = new Set(teams); const d = [...document.querySelectorAll('[role=dialog], .modal-box, [aria-modal="true"]')].pop() || document.body; for (const el of d.querySelectorAll('*')) { if (el.children.length) continue; const t = (el.textContent || '').trim(); if (T.has(t)) return t } return null }, [...TEAMS])
      if (!hit) return false
      await tapText(p, new RegExp(`^${hit}$`), { within: '[role=dialog], .modal-box, body' })
      if (p.url() === before) F({ sev: 'P2', area: 'url', page: before, vp: '375', what: 'J1: tapping the team on a player card does not change the URL', repro: 'MLB Live -> game -> player -> team' })
    })
    for (let i = 1; i <= 3; i++) await step(`back ${i}`, async (p) => {
      await p.goBack({ timeout: 8000 }).catch(() => {}); await settle(p, 1000)
      // Live and the player card each add an entry, so Backs 1 and 2 must stay
      // on the site; a third Back may leave (home was the first site page).
      if (!p.url().startsWith(BASE) && i <= 2) { F({ sev: 'P1', area: 'back', page: '/app#sport=mlb', vp: '375', what: `J1: Back #${i} leaves the site -- the in-app steps before it did not add history entries`, repro: 'arrive on MLB home, Live, a game, a player, his team, then Back', actual: p.url() }); return false }
    })
  })

  // J2: MLB board -> team filter + sort -> player -> back
  await journey('J2 MLB board > filter + sort > player > back', async (page, step) => {
    await step('board', (p) => go(p, '/app#sport=mlb&tab=board'))
    let team = null
    await step('filter team', async (p) => { const s = p.locator('.dash-controls select').first(); if (!(await s.count())) return false; const opts = await s.locator('option').allTextContents(); team = opts[1]; await s.selectOption({ index: 1 }); await settle(p, 800) })
    let sortBefore = null
    await step('sort by a header', async (p) => { const th = p.locator('table thead th').nth(4); if (!(await th.count())) return false; await th.click({ timeout: 2500 }); await settle(p, 600); sortBefore = await p.evaluate(() => (document.body.innerText.match(/SORTED BY[^\n]*\n?[^\n]*/i) || [''])[0].slice(0, 60)) })
    await step('open player', async (p) => { const r = p.locator('table tbody tr').first(); await r.click({ timeout: 2500 }); await settle(p, 1000) })
    await step('back', async (p) => {
      await p.goBack({ timeout: 8000 }).catch(() => {}); await settle(p, 1000)
      if (!p.url().startsWith(BASE)) { F({ sev: 'P1', area: 'back', page: '/app#sport=mlb&tab=board', vp: '375', what: 'J2: Back from a player card leaves the site (opening the card added no history entry)', repro: 'arrive on the board, open a player, Back', actual: p.url() }); return false }
      const now = await p.evaluate(() => ({ team: document.querySelector('.dash-controls select')?.value || '', sort: (document.body.innerText.match(/SORTED BY[^\n]*\n?[^\n]*/i) || [''])[0].slice(0, 60), url: location.hash }))
      if (team && now.team !== team) F({ sev: 'P1', area: 'state', page: '/app#sport=mlb&tab=board', vp: '375', what: 'J2: Back from a player card drops the team filter', expected: team, actual: now.team || '(all teams)', repro: 'board -> pick a team -> open a player -> Back' })
      if (sortBefore && now.sort !== sortBefore) F({ sev: 'P2', area: 'state', page: '/app#sport=mlb&tab=board', vp: '375', what: 'J2: Back from a player card resets the sort', expected: sortBefore, actual: now.sort })
      if (team && !/team=/.test(now.url)) F({ sev: 'P2', area: 'url', page: '/app#sport=mlb&tab=board', vp: '375', what: 'J2: the team filter is not in the URL (a shared/refreshed board loses it)', actual: now.url })
    })
  })

  // J3: MLB board (team filter on) -> NFL -> NHL -> back x2
  await journey('J3 sport switch MLB > NFL > NHL > back x2', async (page, step) => {
    await step('MLB board', (p) => go(p, '/app#sport=mlb&tab=board'))
    await step('filter team', async (p) => { const s = p.locator('.dash-controls select').first(); if (await s.count()) { await s.selectOption({ index: 1 }); await settle(p, 500) } })
    const sw = async (p, word, sport) => {
      // The product switch itself (aria-label "Switch to TUDDY · NFL"), not the
      // desktop header chip a phone hides; falling back to a fresh load would
      // throw away the history this journey is testing.
      const ok = await p.evaluate((w) => { const b = document.querySelector(`button[aria-label^="Switch to ${w}"]`); if (!b) return false; b.click(); return true }, word)
      await settle(p, 1200)
      if (!ok) await go(p, `/app#sport=${sport}`)
      const sig = await p.evaluate(signature)
      if (sportOfUrl(sig.url) !== sport) F({ sev: 'P0', area: 'sport', page: sig.url, vp: '375', what: `J3: switching to ${word} leaves the URL on another sport`, expected: sport, actual: sportOfUrl(sig.url) })
      // MOONSHOT-only words (TUDDY's own team picker also says "All teams (N)",
      // and LAMP's ticker may carry a ⚾ score -- neither is a leak).
      const leak = await p.evaluate(() => /MOONSHOT · |HR score|Search player, team, or pitcher/.test(document.querySelector('main')?.innerText?.slice(0, 3000) || ''))
      if (sport !== 'mlb' && leak) F({ sev: 'P2', area: 'sport', page: sig.url, vp: '375', what: `J3: MLB content/filter visible after switching to ${word}` })
    }
    await step('to TUDDY', (p) => sw(p, 'TUDDY', 'nfl'))
    await step('to LAMP', (p) => sw(p, 'LAMP', 'nhl'))
    await step('back 1', async (p) => { await p.goBack().catch(() => {}); await settle(p, 1000); const s = sportOfUrl(p.url()); if (s !== 'nfl') F({ sev: 'P1', area: 'back', page: p.url(), vp: '375', what: 'J3: Back from LAMP does not return to TUDDY', expected: 'nfl', actual: s }) })
    await step('back 2', async (p) => { await p.goBack().catch(() => {}); await settle(p, 1000); const s = sportOfUrl(p.url()); if (s !== 'mlb') F({ sev: 'P1', area: 'back', page: p.url(), vp: '375', what: 'J3: Back from TUDDY does not return to MOONSHOT', expected: 'mlb', actual: s }) })
  })

  // J4: dates -- the day on screen, the URL and a refresh agree
  await journey('J4 dates: MLB Tmrw, NFL Next week, NHL Previous day, refresh', async (page, step) => {
    const check = async (p, label, sport) => {
      const before = await p.evaluate(() => document.body.innerText.slice(0, 1500))
      const u = p.url()
      await p.reload({ waitUntil: 'domcontentloaded' }); await settle(p, 1500)
      const after = await p.evaluate(() => document.body.innerText.slice(0, 1500))
      const dateInUrl = /date=|day=|week=/.test(new URL(u).hash + new URL(u).search)
      if (!dateInUrl) F({ sev: 'P1', area: 'date', page: u, vp: '375', what: `J4: ${label} is not in the URL -- refresh / share opens a different day`, repro: `${sport}: tap ${label}, refresh` })
      const pickBefore = (before.match(/(Tmrw|Tomorrow|Next week|Week \d+|[A-Z][a-z]{2}, [A-Z][a-z]{2} \d+)/) || [])[0]
      const pickAfter = (after.match(/(Tmrw|Tomorrow|Next week|Week \d+|[A-Z][a-z]{2}, [A-Z][a-z]{2} \d+)/) || [])[0]
      return { dateInUrl, pickBefore, pickAfter }
    }
    await step('MLB Tmrw', async (p) => { await go(p, '/app#sport=mlb&tab=board'); if (!(await tapText(p, /^Tmrw$/))) return false; return check(p, 'MOONSHOT Tmrw', 'mlb') })
    await step('NFL Next week', async (p) => { await go(p, '/app#sport=nfl&tab=boards'); if (!(await tapText(p, /^Next week$/))) return false; return check(p, 'TUDDY Next week', 'nfl') })
    await step('NHL Previous day', async (p) => { await go(p, '/app#sport=nhl&tab=board'); if (!(await tapText(p, /Previous day/))) return false; return check(p, 'LAMP Previous day', 'nhl') })
  })

  // J5: push-alert and X-post links per sport open the exact thing
  await journey('J5 push + X links per sport', async (page, step) => {
    const [mlbName, mlbId] = firstOf(ENT.mlb); const [nflName, nflId] = firstOf(ENT.nfl); const [nhlName, nhlId] = firstOf(ENT.nhl)
    const cases = [
      ['push MLB homer', `/app#sport=mlb&p=${mlbId}&view=spray`, mlbName],
      ['X MLB homer', withQuery(postPath('homer', { playerId: mlbId }), 'src=x'), mlbName],
      ['push NFL', '/app#sport=nfl&tab=watchlist', null],
      ['X NFL td', withQuery(postPath('td', { playerId: nflId }), 'src=x'), nflName],
      ['X NHL goal', withQuery(postPath('goal', { playerId: nhlId }), 'src=x'), nhlName],
      ['X MLB record', withQuery(postPath('board_results'), 'src=x'), null],
    ]
    for (const [label, path, who] of cases) {
      await step(label, async (p) => {
        await go(p, path)
        const sig = await p.evaluate(signature)
        const want = sportOfUrl(path)
        if (who && !(await p.evaluate((w) => document.body.innerText.includes(w), who))) F({ sev: 'P0', area: 'deep-link', page: path, vp: '375', what: `J5: ${label} link does not show ${who}`, expected: who, actual: sig.dialog?.slice(0, 50) || sig.heading, repro: `open ${path}` })
        if (want && sportOfUrl(sig.url) && sportOfUrl(sig.url) !== want) F({ sev: 'P0', area: 'deep-link', page: path, vp: '375', what: `J5: ${label} opens the wrong sport`, expected: want, actual: sportOfUrl(sig.url) })
      })
    }
  })

  // J6: invalid ids / tabs / dates -> an explicit not-found, never a silent bounce
  await journey('J6 invalid player / tab / date', async (page, step) => {
    const cases = [
      ['bad MLB player', '/app#sport=mlb&p=999999999'],
      ['bad NFL player', '/app#sport=nfl&tab=players&player=zzz'],
      ['bad NHL player', '/app#sport=nhl&tab=player&player=1'],
      ['bad MLB tab', '/app#sport=mlb&tab=nope'],
      ['bad NFL tab', '/app#sport=nfl&tab=nope'],
      ['bad NHL date', '/app#sport=nhl&tab=board&date=2026-13-45'],
      ['bad sport', '/app#sport=xyz&tab=board'],
    ]
    for (const [label, path] of cases) {
      await step(label, async (p) => {
        await go(p, path)
        const sig = await p.evaluate(signature)
        const shown = await p.evaluate(() => (document.querySelector('main') || document.body).innerText.replace(/\s+/g, ' ').slice(0, 160))
        if (!sig.notFound) F({ sev: 'P2', area: 'invalid', page: path, vp: '375', what: `J6: ${label} shows no not-found / unavailable state`, expected: 'NOT FOUND / UNAVAILABLE', actual: `${sig.url} · ${shown.slice(0, 90)}` })
      })
    }
  })

  // J7: a live page left open through two refreshes: scroll and open panels survive; API calls/min
  for (const [label, path] of [['MLB Live', '/app#sport=mlb&tab=scoreboard'], ['NFL Scores', appHref('nfl', 'live')]]) {
    await journey(`J7 live page held open: ${label}`, async (page, step) => {
      let api = 0
      page.on('request', (r) => { if (/\/api\//.test(r.url())) api++ })
      await step('open', (p) => go(p, path))
      await step('scroll + wait 65s', async (p) => {
        const h = await p.evaluate(() => document.documentElement.scrollHeight)
        const y = Math.min(900, Math.max(0, h - 900))
        await p.evaluate((y) => window.scrollTo(0, y), y)
        const openDetails = await p.evaluate(() => { const d = document.querySelector('details:not([open])'); if (d) { d.open = true; d.setAttribute('data-audit-open', '1'); return true } return false })
        api = 0
        await p.waitForTimeout(65000)
        const now = await p.evaluate(() => ({ y: Math.round(window.scrollY), open: document.querySelector('[data-audit-open]')?.open ?? null }))
        results.perf.push({ route: path, apiPerMin: Math.round(api * 60 / 65) })
        if (y > 50 && Math.abs(now.y - y) > 40) F({ sev: 'P1', area: 'live', page: path, vp: '375', what: `J7: ${label} jumped scroll during a refresh`, expected: `y=${y}`, actual: `y=${now.y}` })
        if (openDetails && now.open === false) F({ sev: 'P1', area: 'live', page: path, vp: '375', what: `J7: ${label} closed an open panel during a refresh` })
      })
    })
  }

  // J8: race -- day A is slow, day B asked for after it; B must win
  await journey('J8 date race on a slow network (LAMP)', async (page, step) => {
    const A = new Date(Date.now() - 86400e3 * 2).toISOString().slice(0, 10)
    const B = new Date(Date.now() - 86400e3 * 3).toISOString().slice(0, 10)
    await page.route(/\/api\/lamp\/board.*/, async (route) => { if (route.request().url().includes(A)) await new Promise((r) => setTimeout(r, 5000)); await route.continue() })
    await step('ask A then B', async (p) => {
      await p.goto(`${BASE}/app#sport=nhl&tab=board&date=${A}`, { waitUntil: 'commit', timeout: 60000 })
      await p.waitForTimeout(600)
      await p.evaluate((B) => { location.hash = `sport=nhl&tab=board&date=${B}` }, B)
      await p.waitForTimeout(8000)
      const shown = await p.evaluate(() => (document.body.innerText.match(/(Sun|Mon|Tue|Wed|Thu|Fri|Sat), [A-Z][a-z]{2} \d{1,2}/) || [''])[0])
      const want = new Date(`${B}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
      const notWant = new Date(`${A}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
      results.journeys.push({ name: 'J8 detail', A, B, shown, want })
      if (shown && shown === notWant) F({ sev: 'P1', area: 'race', page: '/app#sport=nhl&tab=board', vp: '375', what: 'J8: a slow earlier day overwrote the later one', expected: want, actual: shown, repro: `date=${A} (slow) then date=${B}` })
      else if (shown !== want) F({ sev: 'P2', area: 'race', page: '/app#sport=nhl&tab=board', vp: '375', what: 'J8: changing the date in the URL did not change the board', expected: want, actual: shown || '(no date shown)', repro: `date=${A} then edit the URL to date=${B}` })
    })
  })
  console.log(`\njourneys: ${results.journeys.length}`)
}

// ── 4. PERF ───────────────────────────────────────────────────────────────
if (run('perf')) {
  const routes = ['/app#sport=mlb', '/app#sport=mlb&tab=board', '/app#sport=nfl', '/app#sport=nfl&tab=boards', '/app#sport=nhl', '/app#sport=nhl&tab=board', '/start?sport=mlb', '/called?sport=mlb']
  for (const r of routes) {
    const ctx = await (await B()).newContext(ctxOpts(VP['375']))
    const page = await ctx.newPage()
    const cdp = await ctx.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 })
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
    const types = new Map(); let js = 0; let reqs = 0
    cdp.on('Network.responseReceived', (e) => { types.set(e.requestId, e.type) })
    cdp.on('Network.loadingFinished', (e) => { reqs++; if (types.get(e.requestId) === 'Script') js += e.encodedDataLength })
    await page.addInitScript(() => {
      window.__lcp = 0; window.__cls = 0
      new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = e.startTime }).observe({ type: 'largest-contentful-paint', buffered: true })
      new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value }).observe({ type: 'layout-shift', buffered: true })
    })
    try {
      await page.goto(`${PERF_BASE}${r}`, { waitUntil: 'load', timeout: 90000 })
      await page.waitForTimeout(6000)
      const m = await page.evaluate(() => ({ lcp: Math.round(window.__lcp), cls: Math.round(window.__cls * 1000) / 1000 }))
      const row = { route: r, lcpMs: m.lcp, cls: m.cls, jsKB: Math.round(js / 1024), requests: reqs }
      results.perf.push(row)
      if (m.lcp > 4000) F({ sev: 'P2', area: 'perf', page: r, vp: '375 slow4G', what: `LCP ${(m.lcp / 1000).toFixed(1)}s (poor > 4s)` })
      if (m.cls > 0.25) F({ sev: 'P2', area: 'perf', page: r, vp: '375 slow4G', what: `CLS ${m.cls} (poor > 0.25)` })
    } catch (e) { F({ sev: 'P2', area: 'perf', page: r, vp: '375 slow4G', what: `did not finish loading on slow 4G: ${e.message.split('\n')[0].slice(0, 80)}` }) }
    await ctx.close()
    process.stdout.write('p')
  }
  console.log('\nperf done')
}
await browserRef.close().catch(() => {})

// ── report ────────────────────────────────────────────────────────────────
const SEV = ['P0', 'P1', 'P2', 'P3']
findings.sort((a, b) => SEV.indexOf(a.sev) - SEV.indexOf(b.sev) || a.area.localeCompare(b.area) || String(a.page).localeCompare(String(b.page)))
results.findings = findings
writeFileSync(`${OUT}/results.json`, JSON.stringify(results, null, 1))
const c = results.clicks
const sc = {
  clicksTested: c.length, clicksPassed: c.filter((x) => x.verdict === 'ok').length,
  sweepLoads: results.sweep.length, pagesBleeding: new Set(results.sweep.filter((x) => x.pageBleed).map((x) => `${x.path}@${x.vp}`)).size,
  overlapPages: results.sweep.filter((x) => x.overlap?.length).length, smallTargetPages: results.sweep.filter((x) => x.smallBad?.length).length,
  namesNotTappable: results.sweep.reduce((n, x) => n + (x.names?.bad?.length || 0), 0),
  journeySteps: results.journeys.reduce((n, j) => n + (j.steps?.length || 0), 0), deepLinkFails: findings.filter((f) => f.area === 'deep-link').length,
}
const count = Object.fromEntries(SEV.map((s) => [s, findings.filter((f) => f.sev === s).length]))
const md = [
  `# Nav + mobile audit -- ${results.at.slice(0, 16)}Z`, '',
  `Base ${BASE} · ${Math.round((Date.now() - t0) / 1000)}s · viewports 320 / 375 / 430 / 1280 · logged out`, '',
  `**${count.P0} P0 · ${count.P1} P1 · ${count.P2} P2 · ${count.P3} P3**`, '',
  '| check | result |', '|---|---|',
  `| clicks tested / passed | ${sc.clicksTested} / ${sc.clicksPassed} |`,
  `| page loads (sweep) | ${sc.sweepLoads} |`,
  `| page x viewport scrolling sideways | ${sc.pagesBleeding} |`,
  `| loads with overlapping text | ${sc.overlapPages} |`,
  `| loads with tap targets < 32px | ${sc.smallTargetPages} |`,
  `| names/teams/games not tappable (sum) | ${sc.namesNotTappable} |`,
  `| journey steps / deep-link failures | ${sc.journeySteps} / ${sc.deepLinkFails} |`, '',
  '## Performance (375, slow 4G, 4x CPU)', '| route | LCP ms | CLS | JS KB | requests | API/min |', '|---|---|---|---|---|---|',
  ...results.perf.filter((p) => p.lcpMs != null).map((p) => `| ${p.route} | ${p.lcpMs} | ${p.cls} | ${p.jsKB} | ${p.requests} | |`),
  ...results.perf.filter((p) => p.apiPerMin != null).map((p) => `| ${p.route} (live, held 65s) | | | | | ${p.apiPerMin} |`), '',
  '## Findings', '| sev | area | page | vp | what | expected | actual | repro |', '|---|---|---|---|---|---|---|---|',
  ...findings.map((f) => `| ${f.sev} | ${f.area} | ${String(f.page || '').replace(/\|/g, '/')} | ${f.vp || ''} | ${String(f.what || '').replace(/\|/g, '/')} | ${String(f.expected || '').replace(/\|/g, '/')} | ${String(f.actual || '').replace(/\|/g, '/').slice(0, 160)} | ${String(f.repro || '').replace(/\|/g, '/')} |`),
]
writeFileSync(`${OUT}/index.md`, `${md.join('\n')}\n`)
console.log(`\n${count.P0} P0 · ${count.P1} P1 · ${count.P2} P2 · ${count.P3} P3 -> ${OUT}/index.md`)
process.exit(count.P0 + count.P1 ? 1 : 0)
