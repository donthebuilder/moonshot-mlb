#!/usr/bin/env node
// TAP-EVERYTHING CRAWLER (2026-10-08). RUN BEFORE ANY PUSH THAT TOUCHES UI:  node scripts/check-interactions.mjs --base http://localhost:3294
// Why: the phone checks only LOAD pages. NFL Rankings answered "showOpts is not defined" for every market but
// Anytime TD for two days because nothing ever TAPPED a chip. This opens every page of every sport (the registry's
// tabs, plus a real player / team / game deep link), then taps what a person would tap -- up to 10 controls in
// the page (chips, pills, sub-tabs, toggles, sort headers, "show more", rows/cards), and, after each, up to 3
// controls that tap revealed (one level deeper) -- and the header / bottom bar / More drawer once per sport.
// After EVERY tap it records:
//   ERRPANEL   "This panel hit an error" / "Application error" / any error-boundary text
//   NOTAB      "NO SUCH TAB" / not-found panels
//   PAGEERR    an uncaught page error (pageerror)
//   CONSOLE    console.error that is a ReferenceError / TypeError / "is not defined" / "Cannot read" / panel crashed
//   BLANK      the page had content and the tap left it empty
//   API5XX     a request to /api/* answered 5xx (UPSTREAM = the route said LIVE DATA DELAYED: listed, not failed)
// Findings are deduped by kind + message + sport/tab; each lists the tap sequence that reached it.
//
//   node scripts/check-interactions.mjs [--base http://localhost:3294] [--only mlb|nfl|nhl|nba] [--vp 390|1280|both]
//        [--tabs home,fullboard] [--max 12] [--deep 5] [--out interaction-report] [--browser /path]
// BUCKETS (nba) is crawled only if the server says it is open (/api/buckets/access): start your OWN local server
// with BUCKETS_PUBLIC=on. Exit 1 on any finding. Concurrency is 1, on purpose.
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import './_esm-resolve.mjs'

const req = createRequire(`${process.cwd()}/package.json`)
const { chromium } = req('playwright-core')
const { MLB_TABS, NFL_TABS, NHL_TABS, NBA_TABS, appHref, playerHref } = await import('../lib/routes.js')

const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BASE = (arg('--base') || 'http://localhost:3000').replace(/\/$/, '')
const ONLY = arg('--only')
const TABS_ONLY = arg('--tabs') ? arg('--tabs').split(',') : null
const MAX = Number(arg('--max', 10))
const DEEP = Number(arg('--deep', 3))
const OUT = arg('--out', 'interaction-report')
const VP = arg('--vp', 'both')
const BROWSERS = [arg('--browser'), '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)
const executablePath = BROWSERS.find((p) => existsSync(p))
if (!executablePath) { console.error('No Brave/Chrome found; pass --browser'); process.exit(2) }
const VIEWPORTS = [{ name: '390', width: 390, height: 844, mobile: true }, { name: '1280', width: 1280, height: 800, mobile: false }].filter((v) => VP === 'both' || v.name === VP)
const UA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'

async function getJson(url) { try { const r = await fetch(url); return r.ok ? r.json() : null } catch { return null } }

// ── pages to open, per sport ───────────────────────────────────────────────
async function pagesFor() {
  const out = { mlb: [], nfl: [], nhl: [], nba: [] }
  const tabs = { mlb: MLB_TABS, nfl: NFL_TABS, nhl: NHL_TABS, nba: NBA_TABS }
  for (const s of Object.keys(out)) for (const t of tabs[s]) if (!TABS_ONLY || TABS_ONLY.includes(t)) out[s].push({ tab: t, path: appHref(s, t) })
  const noData = []
  if (TABS_ONLY) return { out, noData }
  const DATA = 'https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current'
  const [slate, week, board] = await Promise.all([getJson(`${DATA}/today_slim.json`), getJson(`${DATA}/nfl_week.json`), getJson(`${BASE}/api/lamp/board`)])
  const mlbP = Array.isArray(slate) ? slate[0] : (slate?.rows || slate?.players || [])[0]
  if (mlbP?.player_id) out.mlb.push({ tab: 'player(deep)', path: playerHref('mlb', mlbP.player_id) }); else noData.push('mlb: no live player for a deep link')
  const nflP = week?.players?.[0]
  if (nflP?.player_id) out.nfl.push({ tab: 'player(deep)', path: playerHref('nfl', nflP.player_id) }); else noData.push('nfl: no live player for a deep link')
  const g = (board?.games || []).find((x) => x.rows?.length)
  if (g) {
    out.nhl.push({ tab: 'player(deep)', path: playerHref('nhl', g.rows[0].playerId) })
    out.nhl.push({ tab: 'team(deep)', path: `/app#sport=nhl&tab=team&team=${g.game.home.abbrev}` })
    out.nhl.push({ tab: 'game(deep)', path: `/app#sport=nhl&tab=game&game=${g.game.id}` })
  } else noData.push('nhl: no games with rows tonight')
  if (!(await getJson(`${BASE}/api/buckets/access`))?.open) { out.nba = []; noData.push('nba: BUCKETS closed on this server (start with BUCKETS_PUBLIC=on)') } else {
    const lead = (await getJson(`${BASE}/api/buckets/leaders`))?.categories?.[0]?.leaders?.[0]
    if (lead) {
      out.nba.push({ tab: 'player(deep)', path: playerHref('nba', lead.id) })
      out.nba.push({ tab: 'team(deep)', path: `/app#sport=nba&tab=team&team=${lead.team}` })
      const log = (await getJson(`${BASE}/api/buckets/player?id=${lead.id}`))?.log?.[0]
      if (log) out.nba.push({ tab: 'game(deep)', path: `/app#sport=nba&tab=game&game=${log.id}` })
    } else noData.push('nba: no leaders for deep links')
  }
  return { out, noData }
}

// ── in-page helpers ────────────────────────────────────────────────────────
const SKIP = /sign ?out|log ?out|delete|subscribe|upgrade|checkout|billing|publish|post to|send |unlock|buy |copy link|share/i
function collectInPage({ scope, skip }) {
  const skipRe = new RegExp(skip, 'i')
  const root = scope === 'main' ? (document.querySelector('#board-main, main') || document.body) : document.body
  const inMain = (el) => { const m = document.querySelector('#board-main, main'); return m && m.contains(el) }
  const vis = (el) => {
    if (el.closest('.sr-only, .skip-link, [aria-hidden="true"], [inert]')) return false
    const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0 || s.pointerEvents === 'none') return false
    const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4
  }
  const items = []
  const counts = {}
  document.querySelectorAll('[data-xi]').forEach((e) => e.removeAttribute('data-xi'))
  const all = [...root.querySelectorAll('*')]
  for (const el of all) {
    if (scope === 'chrome' && inMain(el)) continue
    const tag = el.tagName.toLowerCase()
    const role = el.getAttribute('role') || ''
    const cur = getComputedStyle(el).cursor
    const parentCur = el.parentElement ? getComputedStyle(el.parentElement).cursor : ''
    const isCtl = ['button', 'select', 'summary', 'input', 'textarea'].includes(tag) || ['button', 'tab', 'switch', 'checkbox', 'radio', 'menuitem', 'option'].includes(role) || tag === 'th'
    const isA = tag === 'a'
    const isPtr = cur === 'pointer' && parentCur !== 'pointer'
    if (!isCtl && !isA && !isPtr) continue
    if (!vis(el)) continue
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue
    if (tag === 'input' && ['hidden', 'file', 'password', 'submit', 'email'].includes(el.type)) continue
    if (isA) {
      const href = el.getAttribute('href') || ''
      if (el.target === '_blank' || /^(mailto:|tel:|javascript:)/.test(href)) continue
      if (/^https?:\/\//.test(href) && !href.startsWith(location.origin)) continue
    }
    const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || el.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 48)
    if (skipRe.test(text) || skipRe.test(el.getAttribute('aria-label') || '')) continue
    const kind = (isCtl && tag !== 'th') ? 'ctl' : (tag === 'th' ? 'sort' : 'nav')
    const sig = `${tag}|${role}|${text}|${(typeof el.className === 'string' ? el.className : '').split(/\s+/)[0] || ''}`
    const n = counts[sig] = (counts[sig] ?? -1) + 1
    const id = `${sig}#${n}`
    items.push({ sig, n, id, kind, tag, text })
  }
  return items
}
async function tagByPos(page, item, scope) {
  // re-find by the same collection logic, then mark the target so playwright can click it
  return page.evaluate(({ scope, skip, sig, n }) => {
    const root = scope === 'main' ? (document.querySelector('#board-main, main') || document.body) : document.body
    const m = document.querySelector('#board-main, main')
    document.querySelectorAll('[data-xi]').forEach((e) => e.removeAttribute('data-xi'))
    const skipRe = new RegExp(skip, 'i')
    const counts = {}
    for (const el of root.querySelectorAll('*')) {
      if (scope === 'chrome' && m && m.contains(el)) continue
      const tag = el.tagName.toLowerCase(); const role = el.getAttribute('role') || ''
      const cur = getComputedStyle(el).cursor
      const parentCur = el.parentElement ? getComputedStyle(el.parentElement).cursor : ''
      const isCtl = ['button', 'select', 'summary', 'input', 'textarea'].includes(tag) || ['button', 'tab', 'switch', 'checkbox', 'radio', 'menuitem', 'option'].includes(role) || tag === 'th'
      if (!isCtl && tag !== 'a' && !(cur === 'pointer' && parentCur !== 'pointer')) continue
      if (el.closest('.sr-only, .skip-link, [aria-hidden="true"], [inert]')) continue
      const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0 || s.pointerEvents === 'none') continue
      const r = el.getBoundingClientRect(); if (r.width <= 4 || r.height <= 4) continue
      if (el.disabled || el.getAttribute('aria-disabled') === 'true') continue
      if (tag === 'input' && ['hidden', 'file', 'password', 'submit', 'email'].includes(el.type)) continue
      if (tag === 'a') {
        const href = el.getAttribute('href') || ''
        if (el.target === '_blank' || /^(mailto:|tel:|javascript:)/.test(href)) continue
        if (/^https?:\/\//.test(href) && !href.startsWith(location.origin)) continue
      }
      const text = (el.innerText || el.getAttribute('aria-label') || el.getAttribute('title') || el.placeholder || '').trim().replace(/\s+/g, ' ').slice(0, 48)
      if (skipRe.test(text) || skipRe.test(el.getAttribute('aria-label') || '')) continue
      const sg = `${tag}|${role}|${text}|${(typeof el.className === 'string' ? el.className : '').split(/\s+/)[0] || ''}`
      const k = counts[sg] = (counts[sg] ?? -1) + 1
      if (sg === sig && k === n) { el.setAttribute('data-xi', '1'); return true }
    }
    return false
  }, { scope, skip: SKIP.source, sig: item.sig, n: item.n }).catch(() => false)
}
const probeInPage = () => {
  const m = document.querySelector('#board-main, main') || document.body
  const t = (m.innerText || '')
  const all = (document.body.innerText || '')
  const panel = all.match(/This panel hit an error[^\n]*/)
  let err = null
  if (panel) {
    const after = (all.split(/come back to retry it\./i)[1] || '').trim().split('\n')[0]
    err = `${panel[0]} | ${after}`
  } else {
    const m = all.match(/Application error[^\n]*|Unhandled Runtime Error[^\n]*|Something went wrong[^\n]*|This page couldn.t load[^\n]*|Internal Server Error/i)
    if (m) err = m[0]
  }
  return {
    url: location.href,
    len: t.trim().length,
    err,
    noTab: /NO SUCH TAB/.test(all) ? (all.match(/NO SUCH TAB[^\n]*(\n[^\n]*)?/) || ['NO SUCH TAB'])[0].replace(/\n/g, ' ') : null,
  }
}

// ── the crawl ──────────────────────────────────────────────────────────────
const findings = new Map()  // key -> {kind,msg,where:Set}
const stats = {}            // `${sport}@${vp}` -> {pages, taps}
const noteStat = (k, f) => { stats[k] ??= { pages: 0, taps: 0, deep: 0, skipped: 0, synthetic: 0 }; stats[k][f]++ }
let current = { sport: '', vp: '', tab: '', seq: [] }
function record(kind, msg) {
  msg = String(msg).replace(/\s+/g, ' ').slice(0, 220)
  const key = `${kind}|${msg}|${current.sport}/${current.tab}`
  const where = `${current.vp}: ${current.seq.join(' > ') || '(on load)'}`
  if (!findings.has(key)) findings.set(key, { kind, msg, sport: current.sport, tab: current.tab, where: [] })
  const f = findings.get(key); if (f.where.length < 4 && !f.where.includes(where)) f.where.push(where)
}
const CON_BAD = /ReferenceError|TypeError|is not defined|Cannot read|Cannot access|panel crashed|is not a function|is not iterable|Minified React error|Hydration failed/i
const CON_IGNORE = /Failed to load resource|favicon|net::ERR|\bCSP\b|Content Security|violates the following|webkit-playlist|ResizeObserver|NotAllowedError|AbortError/i

async function settle(page, ms = 700) {
  await page.waitForTimeout(ms)
  for (let i = 0; i < 8; i++) { const p = await page.evaluate(probeInPage).catch(() => null); if (p && p.len > 60) return; await page.waitForTimeout(500) }
}
async function load(page, path) {
  await page.goto('about:blank').catch(() => {})
  await page.goto(BASE + path, { waitUntil: 'domcontentloaded', timeout: 45000 }).catch((e) => record('LOADFAIL', e.message))
  await settle(page, 1100)
}
async function check(page, before, label) {
  const p = await page.evaluate(probeInPage).catch(() => null)
  if (!p) { record('PAGEGONE', `page not evaluable after ${label}`); return null }
  if (p.err) record('ERRPANEL', p.err)
  if (p.noTab && !/tab=missing/.test(page.url())) record('NOTAB', p.noTab)
  if (before && before.len >= 200 && p.len < 40 && sameTab(before.url, p.url)) {
    await page.waitForTimeout(1500)
    const q = await page.evaluate(probeInPage).catch(() => p)
    if (q.len < 40) record('BLANK', `panel was ${before.len} chars, now ${q.len} after "${label}"`)
  }
  return p
}
const tabOf = (u) => (u.match(/[#&?]tab=([^&]*)/) || [])[1] || ''
const sameTab = (a, b) => tabOf(a) === tabOf(b) && a.split('#')[0] === b.split('#')[0]

async function tap(page, item, scope, label) {
  const ok = await tagByPos(page, item, scope)
  if (!ok) return 'gone'
  const loc = page.locator('[data-xi="1"]').first()
  const before = await page.evaluate(probeInPage).catch(() => null)
  current.seq.push(label)
  if (process.env.XI_DEBUG) console.log('   tap', label)
  try {
    if (item.tag === 'input') {
      const type = await loc.getAttribute('type').catch(() => null)
      if (['checkbox', 'radio'].includes(type)) await loc.click({ timeout: 4000, force: false })
      else { await loc.click({ timeout: 4000 }); await loc.fill('a', { timeout: 2000 }).catch(() => {}); await page.waitForTimeout(600); await loc.fill('', { timeout: 2000 }).catch(() => {}) }
    } else if (item.tag === 'select') {
      const opts = await loc.locator('option').evaluateAll((os) => os.map((o) => o.value)).catch(() => [])
      for (const v of opts.slice(0, 4)) { await loc.selectOption(v, { timeout: 3000 }).catch(() => {}); await page.waitForTimeout(400); await check(page, before, `${label}=${v}`) }
    } else {
      // centre it first: a sticky controls bar would otherwise sit on top of an element scrolled to the edge
      await loc.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'center' })).catch(() => {})
      try { await loc.click({ timeout: 2000 }) } catch (e) {
        // still covered after centring: dispatch the click so the handler runs (the cover itself is the phone/desktop
        // checks' business, not this crawler's); anything else is rethrown
        if (!/intercepts pointer events/.test(e.message)) throw e
        await loc.dispatchEvent('click', {}, { timeout: 1500 })
        noteStat(`${current.sport}@${current.vp}`, 'synthetic')
      }
    }
  } catch (e) {
    // a control that is covered / detached is not an app bug by itself; note it quietly
    if (!/Timeout|detached|not visible|intercepts|outside of the viewport|not stable/i.test(e.message)) record('TAPFAIL', e.message.split('\n')[0])
    if (process.env.XI_DEBUG) console.log('   skip', label, '::', e.message.split('\n').slice(0, 12).join(' / ').slice(0, 900))
    noteStat(`${current.sport}@${current.vp}`, 'skipped'); current.seq.pop(); return 'untappable'
  }
  noteStat(`${current.sport}@${current.vp}`, 'taps')
  await settle(page, 350)
  await check(page, before, label)
  return 'ok'
}

const hasOverlay = (page) => page.evaluate(() => [...document.querySelectorAll('[role=presentation], [role=dialog], [aria-modal=true]')].some((e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return s.display !== 'none' && s.visibility !== 'hidden' && r.width * r.height > innerWidth * innerHeight * 0.25 })).catch(() => false)

async function crawlPage(page, sport, vp, entry, buf) {
  current = { sport, vp: vp.name, tab: entry.tab, seq: [] }
  await load(page, entry.path)
  noteStat(`${sport}@${vp.name}`, 'pages')
  await check(page, null, 'load')
  const startUrl = page.url()
  const base = await page.evaluate(collectInPage, { scope: 'main', skip: SKIP.source }).catch(() => [])
  const baseIds = new Set(base.map((b) => b.id))
  // first MAX controls: controls/sorts first, then at most 3 rows/links
  const ctl = base.filter((b) => b.kind !== 'nav' && b.n < 2).slice(0, MAX)
  const navAll = base.filter((b) => b.kind === 'nav')
  const nav = [...new Set([navAll[0], navAll[1], navAll[Math.floor(navAll.length / 2)], navAll[navAll.length - 1]].filter(Boolean))]
  for (const item of [...ctl, ...nav]) {
    current.seq = []
    const r = await tap(page, item, 'main', `[${item.kind}] ${item.text || item.tag}`)
    if (r !== 'ok') continue
    // one level deeper: what this tap revealed
    const now = await page.evaluate(collectInPage, { scope: 'main', skip: SKIP.source }).catch(() => [])
    const fresh = now.filter((n) => !baseIds.has(n.id) && n.kind !== 'nav' && n.n < 1).slice(0, DEEP)
    const moved = !sameTab(startUrl, page.url())
    if (!moved) for (const d of fresh) {
      const rr = await tap(page, d, 'main', `[${d.kind}] ${d.text || d.tag}`)
      if (rr === 'ok') noteStat(`${sport}@${vp.name}`, 'deep')
      if (!sameTab(startUrl, page.url())) break
    }
    let overlay = await hasOverlay(page)
    if (overlay) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(300); overlay = await hasOverlay(page) }
    if (moved || overlay || page.url() !== startUrl || (await page.evaluate(probeInPage).catch(() => ({}))).err) {
      current.seq = []; await load(page, entry.path)
    }
  }
}

async function crawlChrome(page, sport, vp) {
  current = { sport, vp: vp.name, tab: '(chrome)', seq: [] }
  const home = appHref(sport, sport === 'mlb' ? 'home' : (sport === 'nfl' ? 'home' : 'home'))
  await load(page, home)
  noteStat(`${sport}@${vp.name}`, 'pages')
  await check(page, null, 'load')
  const top = await page.evaluate(collectInPage, { scope: 'chrome', skip: SKIP.source }).catch(() => [])
  for (const item of top.slice(0, 24)) {
    current.seq = []
    const r = await tap(page, item, 'chrome', `[chrome ${item.kind}] ${item.text || item.tag}`)
    if (r !== 'ok') continue
    // a drawer / sheet may have opened: tap what it holds, one tap at a time, resetting after each navigation
    const inner = (await page.evaluate(collectInPage, { scope: 'chrome', skip: SKIP.source }).catch(() => [])).filter((n) => !top.some((t) => t.id === n.id))
    if (inner.length) {
      for (const d of inner.slice(0, 40)) {
        current.seq = [`[chrome ${item.kind}] ${item.text || item.tag}`]
        await load(page, home)
        await tagByPos(page, item, 'chrome'); await page.locator('[data-xi="1"]').first().click({ timeout: 3000 }).catch(() => {})
        await settle(page, 400)
        const rr = await tap(page, d, 'chrome', `[drawer ${d.kind}] ${d.text || d.tag}`)
        if (rr === 'ok') noteStat(`${sport}@${vp.name}`, 'deep')
      }
    }
    await load(page, home)
  }
}

// ── main ───────────────────────────────────────────────────────────────────
mkdirSync(OUT, { recursive: true })
const { out: PAGES, noData } = await pagesFor()
const browser = await chromium.launch({ executablePath, headless: true })
const t0 = Date.now()
for (const vp of VIEWPORTS) {
  const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: 1, ...(vp.mobile ? { userAgent: UA, hasTouch: false, isMobile: false } : {}) })
  const page = await ctx.newPage()
  page.on('pageerror', (e) => record('PAGEERR', e.message))
  page.on('console', (m) => { if (m.type() === 'error') { const t = m.text(); if (CON_BAD.test(t) && !CON_IGNORE.test(t)) record('CONSOLE', t) } })
  page.on('response', async (r) => {
    const u = r.url(); if (!(u.startsWith(BASE) && u.includes('/api/') && r.status() >= 500)) return
    // a route that answers "LIVE DATA DELAYED" is the honest answer to an upstream that is down or rate-limiting us
    // (the crawler itself can trip a league's 429): listed as UPSTREAM, not counted as a failure
    let body = await r.text().catch(() => '')
    if (!body) body = await ctx.request.get(u).then((x) => x.text()).catch(() => '')
    record(/LIVE DATA DELAYED|upstream/i.test(body) ? 'UPSTREAM' : 'API5XX', `${r.status()} ${new URL(u).pathname}${body ? ' ' + body.slice(0, 80) : ''}`)
  })
  page.on('dialog', (d) => d.dismiss().catch(() => {}))
  ctx.on('page', (p) => { if (p !== page) p.close().catch(() => {}) })
  for (const sport of ['mlb', 'nfl', 'nhl', 'nba']) {
    if (ONLY && ONLY !== sport) continue
    if (!PAGES[sport].length) continue
    if (!TABS_ONLY) { try { await crawlChrome(page, sport, vp) } catch (e) { record('CRAWLER', `${e.message.split('\n')[0]}`) } }
    for (const entry of PAGES[sport]) {
      try { await crawlPage(page, sport, vp, entry) } catch (e) { record('CRAWLER', `${e.message.split('\n')[0]} (crawler hiccup, not an app finding unless repeated)`) }
      process.stdout.write(`  ${vp.name} ${sport}/${entry.tab}  taps=${stats[`${sport}@${vp.name}`].taps} findings=${findings.size}\n`)
    }
  }
  await ctx.close()
}
await browser.close()

const list = [...findings.values()]
writeFileSync(`${OUT}/interactions.json`, JSON.stringify({ at: new Date().toISOString(), base: BASE, stats, noData, findings: list }, null, 2))
console.log(`\nCOVERAGE (pages opened / taps / taps one level deeper):`)
for (const [k, s] of Object.entries(stats)) console.log(`  ${k.padEnd(10)} ${s.pages} pages  ${s.taps} taps  ${s.deep} deeper  ${s.skipped} not tappable (covered/detached)  ${s.synthetic} of the taps dispatched past a covering element`)
for (const n of noData) console.log(`  NO DATA: ${n}`)
console.log(`\n${list.length} finding(s) in ${Math.round((Date.now() - t0) / 1000)}s`)
for (const f of list) console.log(`\n[${f.kind}] ${f.sport}/${f.tab}\n  ${f.msg}\n  via ${f.where.join('\n      ')}`)
process.exit(list.some((f) => f.kind !== 'UPSTREAM') ? 1 : 0)
