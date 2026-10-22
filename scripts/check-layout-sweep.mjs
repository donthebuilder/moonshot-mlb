#!/usr/bin/env node
// LAYOUT SWEEP DETECTOR (2026-10-22, claude/DASH-LAYOUT-SWEEP-PROMPT-2026-10-22.txt). Donovan on the MLB player card: "everything is
// like chips of repeated data ... it just takes up half the screen", "repeated data of the line before", a button row "taking a whole
// row with it not being symmetrical", and on desktop the page should "almost engulf the whole screen" when it opens. "There's a lot of
// places in the site like that." This finds those places. It COUNTS; it never fails the run (exit 0 unless the browser can't start).
//
//   node scripts/check-layout-sweep.mjs --base http://localhost:3000            every page (lib/routes.js), 390x844 and 1440x900
//   node scripts/check-layout-sweep.mjs --base ... --pages "/app#sport=mlb&tab=games,/called?sport=mlb"
//   node scripts/check-layout-sweep.mjs --base ... --tabs games                  that tab on every sport (appHref, never a hand list)
//   node scripts/check-layout-sweep.mjs --base ... --only nfl                    one product (mlb|nfl|nhl|nba|public)
//   --vp 390 | 1440 | 390,1440        viewports (default both)
//   --shots <dir>                     also save the first screen of each page there (<slug>-<vp>.png)
//   --browser /path/to/chrome         default: the Mac's Chrome, then Brave, then scripts/_browser.mjs EXTRA_PATHS
//
// CHECKS, per page and viewport (same browser lookup and route list as scripts/check-mobile.mjs):
//   REPEATS     the same number twice in the first two screens next to the same or a similar label (a stat tile and a chip, a tile and
//               a sentence). Ignores 0, 1, dates, times, years, table cells and chart text; the same number in two items of one list
//               (two game cards, two rows) is two facts, not a repeat.
//   ORPHANS     a wrapping row of buttons / chips (3+ children) whose last visual line holds 1-2 of them under a line of 3+.
//   FIRST ROW   the y of the first table row, chart (canvas / svg 150x80+), tab row or list item; phone wants < ~650, desktop < 900.
//   EMPTY       desktop only: the share of the first screen (or the open modal) with nothing on it: no text, image, chart or control.
//   WALLS       chip rows stacked more than two deep right above a chart or table.
//   CLIPPED     an element cut to "…" (text-overflow: ellipsis with scrollWidth > clientWidth).
//
// OUTPUT: layout-report/index.md (one section per page, worst first) + layout-report/report.json, and one line per check on stdout.
// layout-report/ is gitignored.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import './_esm-resolve.mjs'
import { MAC_CHROME, MAC_BRAVE, EXTRA_PATHS } from './_browser.mjs'

const req = createRequire(`${process.cwd()}/package.json`)
const { chromium } = req('playwright-core')
const { MLB_TABS, NFL_TABS, NHL_TABS, NBA_TABS, appHref } = await import('../lib/routes.js')

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BASE = (arg('--base') || 'http://localhost:3000').replace(/\/$/, '')
const ONLY = arg('--only')
const PAGES = arg('--pages')
const TABS = arg('--tabs')
const SHOTS = arg('--shots')
const CONCURRENCY = Number(arg('--concurrency', 3))
const OUT = 'layout-report'
const BROWSERS = [arg('--browser'), MAC_CHROME, MAC_BRAVE, ...EXTRA_PATHS].filter(Boolean)
const executablePath = BROWSERS.find((p) => existsSync(p))
if (!executablePath) { console.error('No Chrome/Brave found; pass --browser /path/to/chrome'); process.exit(2) }

const ALL_VP = {
  390: { name: '390', width: 390, height: 844, phone: true },
  1440: { name: '1440', width: 1440, height: 900, phone: false },
}
const VIEWPORTS = String(arg('--vp', '390,1440')).split(',').map((v) => ALL_VP[v.trim()]).filter(Boolean)
const UA_PHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
// the first useful row should start before this y (phone: the prompt's ~650px; desktop: inside the first screen)
const FIRST_ROW_MAX = { 390: 650, 1440: 900 }
const EMPTY_MAX = 0.33

// ── the route list (the registry, never a hand list of sports) ───────────────
async function getJson(url) { try { const r = await fetch(url); return r.ok ? r.json() : null } catch { return null } }
async function routes() {
  if (PAGES) return PAGES.split(',').map((p) => ({ group: 'pages', path: p.trim() }))
  const nbaOpen = Boolean((await getJson(`${BASE}/api/buckets/access`))?.open)
  const sports = [['mlb', MLB_TABS], ['nfl', NFL_TABS], ['nhl', NHL_TABS], ...(nbaOpen ? [['nba', NBA_TABS]] : [])]
  const list = []
  const add = (group, path) => { if ((!ONLY || ONLY === group) && !list.some((x) => x.path === path)) list.push({ group, path }) }
  if (TABS) {
    for (const t of TABS.split(',').map((x) => x.trim()).filter(Boolean)) for (const [s] of sports) add(s, appHref(s, t))
    return list
  }
  for (const [s, tabs] of sports) for (const t of tabs) add(s, appHref(s, t))
  for (const p of ['/', '/called?sport=mlb', '/called?sport=nfl', '/called?sport=nhl', '/nhl/standings', '/nhl/leaders', '/nhl/goalies']) add('public', p)
  return list
}

// ── the checks, in the page ─────────────────────────────────────────────────
function inPage({ phone }) {
  const W = window.innerWidth
  const H = window.innerHeight
  const SY = window.scrollY
  const srOnly = (el) => el.closest('.sr-only, .skip-link, [aria-hidden="true"]') != null
  const vis = (el) => {
    if (!el || srOnly(el)) return false
    const s = getComputedStyle(el)
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false
    const r = el.getBoundingClientRect(); return r.width > 1 && r.height > 1
  }
  // the site's own frame (header, nav, the bottom bar, anything fixed) is not the page
  const fixed = [...document.body.querySelectorAll('*')].filter((el) => getComputedStyle(el).position === 'fixed' && !el.matches('[role=dialog], [aria-modal="true"]'))
  const isChrome = (el) => el.closest('header, nav, footer, .mobile-tabbar, [class*="tabbar"], .skip-link') != null || fixed.some((f) => f.contains(el) && !f.querySelector('[role=dialog], [aria-modal="true"]'))
  const txt = (el) => (el.innerText || el.textContent || el.getAttribute?.('aria-label') || '').trim().replace(/\s+/g, ' ')
  const label = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : ''} "${txt(el).slice(0, 40)}"`
  const pageY = (r) => Math.round(r.top + SY)

  // an open modal: the checks look inside it
  const modal = [...document.querySelectorAll('[role=dialog], [aria-modal="true"]')].find((m) => vis(m) && m.getBoundingClientRect().width > W * 0.4)
  const root = modal || document.body

  // ── FIRST ROW ──
  const rowCands = []
  const addCand = (el, kind) => { if (vis(el) && !isChrome(el)) rowCands.push({ el, kind, y: pageY(el.getBoundingClientRect()) }) }
  root.querySelectorAll('table tbody tr, table tr, [role=row]').forEach((el) => addCand(el, 'table row'))
  root.querySelectorAll('canvas').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width >= 150 && r.height >= 80) addCand(el, 'chart') })
  root.querySelectorAll('svg').forEach((el) => { if (el.parentElement?.closest('svg')) return; const r = el.getBoundingClientRect(); if (r.width >= 150 && r.height >= 80) addCand(el, 'chart') })
  root.querySelectorAll('[role=tablist]').forEach((el) => addCand(el, 'tab row'))
  root.querySelectorAll('[role=list] > *, main li').forEach((el) => addCand(el, 'list item'))
  rowCands.sort((a, b) => a.y - b.y)
  const first = rowCands[0] || null
  const firstRow = first ? { y: first.y, kind: first.kind, what: label(first.el) } : null

  // ── REPEATS ──
  const MONTH = /(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s*$/i
  const STOP = new Set(['THE', 'OF', 'VS', 'IN', 'AT', 'ON', 'AND', 'OR', 'TO', 'A', 'AN', 'FOR', 'HIS', 'HE', 'IS', 'BY', 'WITH', 'ALL', 'THIS', 'THAT', 'IT', 'AS', 'FROM'])
  const tokens = (s) => new Set((String(s).toUpperCase().match(/[A-Z][A-Z]+/g) || []).filter((t) => !STOP.has(t)))
  const occ = []
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const s = n.nodeValue
    if (!s || !/\d/.test(s)) continue
    const el = n.parentElement
    if (!el || el.closest('td, th, svg, option, select, script, style, noscript, textarea, input') || !vis(el) || isChrome(el)) continue
    const range = document.createRange(); range.selectNodeContents(n)
    const r = range.getBoundingClientRect()
    if (r.width < 1 || pageY(r) > 2 * H) continue
    const re = /[+\-−]?\$?(?:\d[\d,]*(?:\.\d+)?|\.\d+)%?/g
    let m
    while ((m = re.exec(s))) {
      const raw = m[0]
      const before = s.slice(0, m.index); const after = s.slice(m.index + raw.length)
      if (/[:/]\s*$/.test(before) || /^\s*[:/]\d/.test(after)) continue            // 7:05, 10/22, 0/2
      if (/^\s*(am|pm|a\.m|p\.m|h\b|m\b|s\b|d\b|min|sec|hr ago|days?\b|ago)/i.test(after)) continue   // times and ages
      if (MONTH.test(before)) continue                                                // Oct 22
      if (/[A-Za-z]$/.test(before) && !/\s$/.test(before)) continue                   // part of a word / code (B2B, x1)
      const v = parseFloat(raw.replace(/[$,]/g, '').replace('−', '-'))
      if (!Number.isFinite(v)) continue
      const abs = Math.abs(v)
      if (abs === 0 || abs === 1) continue
      if (/^\d{4}$/.test(raw) && v >= 1900 && v <= 2100) continue                    // a year
      const key = `${raw.endsWith('%') ? '%' : ''}${Math.round(abs * 1000) / 1000}`
      // (a fresh regex: String.replace on the loop's own /g regex resets its lastIndex and the loop never ends)
      const NUMS = /[+\-−]?\$?(?:\d[\d,]*(?:\.\d+)?|\.\d+)%?/g
      let ctx = s.replace(NUMS, ' ').trim()
      if ((ctx.match(/[A-Za-z]/g) || []).length < 2) ctx = txt(el.parentElement || el).slice(0, 60).replace(NUMS, ' ')
      if ((ctx.match(/[A-Za-z]/g) || []).length < 2 && el.parentElement?.previousElementSibling) ctx = txt(el.parentElement.previousElementSibling).slice(0, 40)
      occ.push({ key, raw, el, ctx: ctx.replace(/\s+/g, ' ').trim().slice(0, 50), toks: tokens(ctx) })
    }
  }
  const sig = (el) => `${el.tagName}.${typeof el.className === 'string' ? el.className : ''}`
  // two items of one list (two game cards, two rows of a strip): the same number there is two facts
  const sameListItems = (a, b) => {
    let lca = a; while (lca && !lca.contains(b)) lca = lca.parentElement
    if (!lca || lca === a || lca === b) return false
    const ca = [...lca.children].find((c) => c.contains(a)); const cb = [...lca.children].find((c) => c.contains(b))
    if (!ca || !cb || ca === cb || sig(ca) !== sig(cb)) return false
    return [...lca.children].filter((c) => sig(c) === sig(ca)).length >= 3
  }
  const byKey = {}
  for (const o of occ) (byKey[o.key] ||= []).push(o)
  const repeats = []
  for (const [key, list] of Object.entries(byKey)) {
    if (list.length < 2) continue
    const hits = new Set()
    for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
      const a = list[i]; const b = list[j]
      if (a.el === b.el || a.el.contains(b.el) || b.el.contains(a.el)) continue
      if (![...a.toks].some((t) => b.toks.has(t))) continue
      if (sameListItems(a.el, b.el)) continue
      hits.add(i); hits.add(j)
    }
    if (hits.size >= 2) repeats.push({ n: list[0].raw, times: hits.size, where: [...hits].slice(0, 4).map((i) => list[i].ctx) })
  }

  // ── ORPHANS ──
  const isControl = (el) => el.matches('button, a[href], [role=button], [role=tab], label, select, input')
  const chipish = (c) => {
    if (isControl(c)) return true
    const inner = c.querySelectorAll('button, a[href], [role=button], [role=tab]')
    if (inner.length === 1) return true
    const r = c.getBoundingClientRect()
    return inner.length === 0 && r.height <= 48 && txt(c).length > 0 && txt(c).length <= 28 && c.children.length <= 3
  }
  const orphans = []
  for (const el of root.querySelectorAll('*')) {
    const s = getComputedStyle(el)
    if (!/flex/.test(s.display) || !/wrap/.test(s.flexWrap) || s.flexDirection.startsWith('column')) continue
    if (!vis(el) || isChrome(el)) continue
    const kids = [...el.children].filter((c) => vis(c) && !['absolute', 'fixed'].includes(getComputedStyle(c).position))
    if (kids.length < 3) continue
    const chips = kids.filter(chipish)
    if (chips.length < kids.length * 0.6 || chips.length < 3) continue
    if (kids.some((c) => c.getBoundingClientRect().height > 64)) continue
    const lines = []
    // one visual line = items whose boxes overlap vertically (a label baseline-aligned 3px lower is on the same line as its chips)
    for (const c of kids.map((k) => ({ k, r: k.getBoundingClientRect() })).sort((a, b) => a.r.top - b.r.top)) {
      const l = lines.find((x) => Math.min(x.bottom, c.r.bottom) - Math.max(x.top, c.r.top) > Math.min(x.bottom - x.top, c.r.height) * 0.5)
      if (l) { l.items.push(c.k); l.top = Math.min(l.top, c.r.top); l.bottom = Math.max(l.bottom, c.r.bottom) } else lines.push({ top: c.r.top, bottom: c.r.bottom, items: [c.k] })
    }
    lines.sort((a, b) => a.top - b.top)
    if (lines.length < 2) continue
    const last = lines[lines.length - 1]; const prev = lines[lines.length - 2]
    if (last.items.length <= 2 && prev.items.length >= 3) {
      orphans.push({ y: pageY(el.getBoundingClientRect()), lines: lines.map((l) => l.items.length).join('+'), last: last.items.map((k) => txt(k).slice(0, 16)).join(' | '), what: label(el) })
    }
  }

  // ── CLIPPED ──
  const clipped = []
  for (const el of root.querySelectorAll('*')) {
    if (el.children.length > 3) continue
    const s = getComputedStyle(el)
    if (s.textOverflow !== 'ellipsis' || !(el.scrollWidth > el.clientWidth + 1) || !vis(el) || isChrome(el)) continue
    clipped.push({ y: pageY(el.getBoundingClientRect()), what: label(el), full: txt(el).slice(0, 50) })
  }

  // ── WALLS ──
  const chipCtl = [...root.querySelectorAll('button, [role=button], [role=tab], a[href], select')].filter((el) => {
    if (!vis(el) || isChrome(el)) return false
    const r = el.getBoundingClientRect(); const t = txt(el)
    return r.height >= 14 && r.height <= 48 && r.width < 300 && t.length >= 1 && t.length <= 28
  }).map((el) => ({ el, r: el.getBoundingClientRect() }))
  const chipLines = []
  for (const c of chipCtl.sort((a, b) => a.r.top - b.r.top)) {
    const cy = c.r.top + c.r.height / 2
    const l = chipLines.find((x) => Math.abs(x.cy - cy) <= 6 && c.r.left < x.right + 40 && c.r.right > x.left - 40)
    if (l) { l.n += 1; l.left = Math.min(l.left, c.r.left); l.right = Math.max(l.right, c.r.right); l.top = Math.min(l.top, c.r.top); l.bottom = Math.max(l.bottom, c.r.bottom); l.texts.push(txt(c.el).slice(0, 12)) }
    else chipLines.push({ cy, n: 1, left: c.r.left, right: c.r.right, top: c.r.top, bottom: c.r.bottom, texts: [txt(c.el).slice(0, 12)] })
  }
  const realLines = chipLines.filter((l) => l.n >= 2)
  const anchors = rowCands.filter((c) => c.kind === 'chart' || c.kind === 'table row')
  const seenAnchor = new Set()
  const walls = []
  for (const a of anchors) {
    const host = a.el.closest('table') || a.el
    if (seenAnchor.has(host)) continue
    seenAnchor.add(host)
    const ar = host.getBoundingClientRect()
    const above = realLines.filter((l) => l.bottom <= ar.top + 2 && l.right > ar.left && l.left < ar.right).sort((x, y) => y.bottom - x.bottom)
    if (!above.length || ar.top - above[0].bottom > 120) continue
    let depth = 1
    for (let i = 1; i < above.length; i++) { if (above[i - 1].top - above[i].bottom < 40) depth += 1; else break }
    if (depth > 2) walls.push({ y: pageY(ar), depth, kind: a.kind, rows: above.slice(0, depth).reverse().map((l) => l.texts.slice(0, 4).join(' ')).slice(0, 4) })
    if (seenAnchor.size >= 6) break
  }

  // ── EMPTY (desktop): what share of the first screen has nothing on it ──
  let empty = null
  if (!phone) {
    const box = modal ? modal.getBoundingClientRect() : { left: 0, top: 0, right: W, bottom: H }
    const L = Math.max(0, box.left); const T = Math.max(0, box.top); const R = Math.min(W, box.right); const B = Math.min(H, box.bottom)
    const CELL = 10; const PAD = 8
    const cols = Math.ceil((R - L) / CELL); const rows = Math.ceil((B - T) / CELL)
    if (cols > 0 && rows > 0) {
      const grid = new Uint8Array(cols * rows)
      const mark = (r) => {
        const x0 = Math.max(0, Math.floor((r.left - PAD - L) / CELL)); const x1 = Math.min(cols - 1, Math.floor((r.right + PAD - L) / CELL))
        const y0 = Math.max(0, Math.floor((r.top - PAD - T) / CELL)); const y1 = Math.min(rows - 1, Math.floor((r.bottom + PAD - T) / CELL))
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) grid[y * cols + x] = 1
      }
      const onScreen = (r) => r.width > 0 && r.height > 0 && r.bottom > T && r.top < B && r.right > L && r.left < R
      const tw = document.createTreeWalker(modal || document.body, NodeFilter.SHOW_TEXT)
      for (let n = tw.nextNode(); n; n = tw.nextNode()) {
        if (!n.nodeValue || !n.nodeValue.trim() || !n.parentElement || !vis(n.parentElement)) continue
        const range = document.createRange(); range.selectNodeContents(n)
        for (const r of range.getClientRects()) if (onScreen(r)) mark(r)
      }
      const bodyBg = getComputedStyle(document.body).backgroundColor
      for (const el of (modal || document.body).querySelectorAll('img, svg, canvas, video, iframe, input, select, textarea, button, [role=img], [style*="background-image"], *')) {
        const r = el.getBoundingClientRect()
        if (!onScreen(r) || !vis(el)) continue
        if (el.matches('img, svg, canvas, video, iframe, input, select, textarea, button, [role=img]')) { mark(r); continue }
        // a small filled or bordered box (a chip, a tile, a dot, a bar) is something on screen; a big panel's background is not
        if (r.width * r.height > 40000) continue
        const s = getComputedStyle(el)
        const filled = s.backgroundColor && !/rgba\(\d+, \d+, \d+, 0\)|transparent/.test(s.backgroundColor) && s.backgroundColor !== bodyBg
        const bordered = parseFloat(s.borderTopWidth) > 0 && s.borderTopStyle !== 'none' && !/rgba\(\d+, \d+, \d+, 0\)/.test(s.borderTopColor)
        if (filled || bordered || s.backgroundImage !== 'none') mark(r)
      }
      let on = 0; for (const v of grid) on += v
      empty = Math.round((1 - on / grid.length) * 100) / 100
    }
  }

  return { firstRow, repeats, orphans, clipped, walls, empty, modal: Boolean(modal) }
}

// ── run ──────────────────────────────────────────────────────────────────
const list = await routes()
mkdirSync(OUT, { recursive: true })
if (SHOTS) mkdirSync(SHOTS, { recursive: true })
const browser = await chromium.launch({ executablePath, headless: true })
const results = []
const jobs = []
for (const r of list) for (const vp of VIEWPORTS) jobs.push({ ...r, vp })
let next = 0
const t0 = Date.now()
const slug = (p) => p.replace(/^\/app#/, '').replace(/[^a-z0-9]+/gi, '_').replace(/^_|_$/g, '').slice(0, 60) || 'root'
await Promise.all(Array.from({ length: CONCURRENCY }, async () => {
  while (next < jobs.length) {
    const j = jobs[next++]
    const ctx = await browser.newContext(j.vp.phone
      ? { viewport: { width: j.vp.width, height: j.vp.height }, userAgent: UA_PHONE, isMobile: true, hasTouch: true, deviceScaleFactor: 2 }
      : { viewport: { width: j.vp.width, height: j.vp.height }, deviceScaleFactor: 1 })
    const page = await ctx.newPage()
    const res = { group: j.group, path: j.path, vp: j.vp.name, error: null }
    try {
      await page.goto(`${BASE}${j.path}`, { waitUntil: 'domcontentloaded', timeout: 30000 })
      await page.waitForLoadState('networkidle', { timeout: 9000 }).catch(() => {})
      await page.waitForTimeout(1500)
      Object.assign(res, await page.evaluate(inPage, { phone: j.vp.phone }))
      if (SHOTS) await page.screenshot({ path: `${SHOTS}/${slug(j.path)}-${j.vp.name}.png` })
    } catch (e) {
      res.error = e.message.split('\n')[0].slice(0, 160)
    }
    results.push(res)
    await ctx.close()
    process.stdout.write(res.error ? 'x' : '.')
  }
}))
await browser.close()

// ── report ───────────────────────────────────────────────────────────────
const late = (r) => !r.firstRow || r.firstRow.y > FIRST_ROW_MAX[r.vp]
const emptyBad = (r) => r.empty != null && r.empty > EMPTY_MAX
const score = (r) => (r.repeats?.length || 0) + 2 * (r.orphans?.length || 0) + 3 * (r.walls?.length || 0) + 0.5 * (r.clipped?.length || 0) + (late(r) ? 3 : 0) + (emptyBad(r) ? 3 : 0)
const pages = {}
for (const r of results) (pages[r.path] ||= { path: r.path, group: r.group, vps: [] }).vps.push(r)
const ordered = Object.values(pages).map((p) => ({ ...p, score: p.vps.reduce((s, r) => s + score(r), 0) })).sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
const tot = { repeats: 0, orphans: 0, walls: 0, clipped: 0, late: 0, empty: 0, errors: 0 }
for (const r of results) {
  if (r.error) { tot.errors += 1; continue }
  tot.repeats += r.repeats.length; tot.orphans += r.orphans.length; tot.walls += r.walls.length; tot.clipped += r.clipped.length
  if (late(r)) tot.late += 1
  if (emptyBad(r)) tot.empty += 1
}
const fr = (r) => (r.firstRow ? `${r.firstRow.y} (${r.firstRow.kind})` : 'none found')
const lines = [
  `# Layout sweep -- ${new Date().toISOString().slice(0, 16)}Z`,
  '',
  `Base ${BASE} · viewports ${VIEWPORTS.map((v) => v.name).join(', ')} · ${results.length} page loads · ${Math.round((Date.now() - t0) / 1000)}s`,
  '',
  '| check | count |', '|---|---|',
  `| REPEATS (same number, similar label, first two screens) | ${tot.repeats} |`,
  `| ORPHANS (wrapped row ending in 1-2 under 3+) | ${tot.orphans} |`,
  `| WALLS (3+ chip rows above a chart / table) | ${tot.walls} |`,
  `| CLIPPED (ellipsis with room cut) | ${tot.clipped} |`,
  `| FIRST ROW late (phone > ${FIRST_ROW_MAX[390]}, desktop > ${FIRST_ROW_MAX[1440]}, or none) | ${tot.late} |`,
  `| EMPTY first screen on desktop (> ${Math.round(EMPTY_MAX * 100)}%) | ${tot.empty} |`,
  `| load errors | ${tot.errors} |`,
  '',
  '## First-useful-row y',
  '| page | 390 | 1440 | desktop empty |', '|---|---|---|---|',
  ...ordered.map((p) => { const a = p.vps.find((r) => r.vp === '390'); const b = p.vps.find((r) => r.vp === '1440'); return `| ${p.path} | ${a ? fr(a) : '-'} | ${b ? fr(b) : '-'} | ${b?.empty != null ? `${Math.round(b.empty * 100)}%` : '-'} |` }),
  '',
  '## Pages, worst first',
]
for (const p of ordered) {
  lines.push('', `### ${p.path}  (score ${p.score})`)
  for (const r of p.vps.sort((a, b) => a.vp.localeCompare(b.vp))) {
    lines.push('', `**${r.vp}** · first row ${r.error ? '-' : fr(r)}${r.empty != null ? ` · empty ${Math.round(r.empty * 100)}%` : ''}${r.modal ? ' · modal' : ''}`)
    if (r.error) { lines.push(`- LOAD ${r.error}`); continue }
    for (const x of r.repeats) lines.push(`- REPEAT ${x.n} ×${x.times}: ${x.where.map((w) => `"${w}"`).join(' / ')}`)
    for (const x of r.orphans) lines.push(`- ORPHAN y=${x.y} lines ${x.lines}, last line: ${x.last} -- ${x.what}`)
    for (const x of r.walls) lines.push(`- WALL y=${x.y} ${x.depth} chip rows above a ${x.kind}: ${x.rows.join(' / ')}`)
    // clipped cells of one table column are one finding with N rows: grouped by element and class
    const cg = {}
    for (const x of r.clipped) (cg[x.what.split(' "')[0]] ||= []).push(x)
    for (const [k, xs] of Object.entries(cg).sort((a, b) => b[1].length - a[1].length)) lines.push(`- CLIPPED ×${xs.length} ${k} (first y=${xs[0].y}): ${xs.slice(0, 3).map((x) => `"${x.full.slice(0, 30)}"`).join(', ')}`)
  }
}
writeFileSync(`${OUT}/index.md`, `${lines.join('\n')}\n`)
writeFileSync(`${OUT}/report.json`, JSON.stringify(results, null, 1))
console.log(`\n${results.length} loads -> ${OUT}/index.md`)
console.log(`REPEATS ${tot.repeats}`)
console.log(`ORPHANS ${tot.orphans}`)
console.log(`WALLS ${tot.walls}`)
console.log(`CLIPPED ${tot.clipped}`)
console.log(`FIRST ROW late ${tot.late} of ${results.length - tot.errors}`)
console.log(`EMPTY desktop first screen > ${Math.round(EMPTY_MAX * 100)}%: ${tot.empty}`)
if (tot.errors) console.log(`LOAD errors ${tot.errors}`)
process.exit(0)
