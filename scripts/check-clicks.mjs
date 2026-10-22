#!/usr/bin/env node
// EVERYTHING I CLICK GOES TO THE RIGHT PLACE (Donovan 2026-10-17: "make sure when I click on things they go to the right place").
//   npx next start -p 3113 &   node scripts/check-clicks.mjs [--base http://localhost:3113] [--widths 390,1280] [--quick]
//        [--pages "/,/app#sport=nfl&tab=picks"] [--no-member] [--no-aliases] [--out report.md] [--chrome /path/to/chrome]
// Playwright (playwright-core) at 390x844 and 1280x900. /api/dash/state is mocked twice: FREE ({signedIn:false}) and MEMBER
// ({signedIn:true, who:{member:true}}). Whatever data the server can reach renders; nothing is made up, and a page with no
// data simply has fewer links. For every anchor on the front page, the public pages and every tab of the app shell of
// MOONSHOT / TUDDY / LAMP (tabs come from lib/routes.js), plus every nav BUTTON (bottom bar, More sheet, header) it checks:
//   (a) the click lands on an existing route: no 404 / 500, not blank, not the app's "That page isn't on the board"
//   (b) the landing matches the link: the sport (title brand), the tab (aliases resolved), the player / game / team asked for
//   (c) browser Back returns to the page and state the click started from (and a click made a history entry to go back to)
//   (d) the landing URL loaded fresh (a shared link) renders the same thing, on a phone and on a desktop
//   (e) no href points at a retired address: /start, /c, an alias tab key, the ?sport= shape of /app
//   (f) external links: target=_blank + rel=noopener, host on the allow-list (whop / discord / x / the contact mailto)
//   (g) nothing fixed (bottom bar, slip chip, nudge) sits on a link's tap point once the page is scrolled to it
// It also loads every legacy address (/start, /c, /app?sport=, every alias tab key) and checks where it lands.
// Prints one row per link (PASS / FAIL + reason) and exits 1 on any FAIL. Not in scripts/gate.sh: it is a ~10 min run, add it deliberately.
import { createRequire } from 'node:module'
import { existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MAC_BRAVE, EXTRA_PATHS } from './_browser.mjs'
process.emitWarning = () => {}   // lib/ is typeless ESM; node's reparse warning is noise here
const req = createRequire(import.meta.url)
const { chromium } = req('playwright-core')
await import('./_esm-resolve.mjs')
const R = await import('../lib/routes.js')
const LV = await import('../lib/ledger/views.js')

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const has = (k) => process.argv.includes(k)
const BASE = arg('--base', 'http://localhost:3113').replace(/\/$/, '')
const WIDTHS = String(arg('--widths', '390,1280')).split(',').map(Number)
const QUICK = has('--quick')
const OUT = arg('--out', join(tmpdir(), 'check-clicks-report.md'))
const CHROME = arg('--chrome', [process.env.CHROME_PATH, '/opt/pw-browsers/chromium-1194/chrome-linux/chrome', MAC_BRAVE, ...EXTRA_PATHS].find((p) => p && existsSync(p)))
const ONLY = (arg('--pages', '') || '').split(',').map((s) => s.trim()).filter(Boolean)

// ── what is allowed to leave the site ──
const EXTERNAL_HOSTS = ['whop.com', 'discord.gg', 'discord.com', 'x.com', 'twitter.com', 'github.com']   // github: the bot's public record files (the Calibration table's source line)
const hostOk = (h) => EXTERNAL_HOSTS.some((x) => h === x || h.endsWith(`.${x}`))
const RETIRED_PATHS = ['/start', '/c']          // redirect shims only (app/start, app/c): nothing on the site may point at them
const SPORTS = R.SPORT_KEYS                      // public sports; hidden BUCKETS is never linked
const TABS = { mlb: R.MLB_TABS, nfl: R.NFL_TABS, nhl: R.NHL_TABS, ...(SPORTS.includes('nba') ? { nba: R.NBA_TABS } : {}) }   // BUCKETS once it is public (10-20)

// ── the pages whose links are harvested ──
const FRONT = ['/', '/called', '/called?sport=nfl', '/called?sport=nhl', '/members', '/terms', '/m', '/m?sport=nfl', '/m?sport=nhl', '/login']
const shellPages = (sports, tabs = true) => sports.flatMap((s) => [R.appHref(s, 'home'), ...(tabs ? (TABS[s] || []).filter((t) => t !== 'home').map((t) => `/app#sport=${s}&tab=${t}`) : [])])
const FREE_PAGES = ONLY.length ? ONLY : [...FRONT, ...shellPages(SPORTS)]
const MEMBER_PAGES = ONLY.length ? ONLY : ['/', '/m', ...shellPages(SPORTS, false), '/app#sport=mlb&tab=you', '/app#sport=mlb&tab=binder']

const rows = []   // { w, auth, from, label, href, kind, res, why }
const add = (r) => rows.push(r)
const fp = new Map()   // landing URL -> { w -> fingerprint }  for (d) across widths

// the app writes tab=home into a bare #sport=x once it has rendered; two addresses are the same screen when they agree on that
const sameState = (a, b) => {
  try {
    const A = new URL(a), B = new URL(b)
    if (A.pathname !== B.pathname || A.search !== B.search) return false
    const ha = Object.fromEntries(new URLSearchParams(A.hash.replace(/^#/, ''))), hb = Object.fromEntries(new URLSearchParams(B.hash.replace(/^#/, '')))
    if (ha.sport && !ha.tab) ha.tab = 'home'
    if (hb.sport && !hb.tab) hb.tab = 'home'
    const ks = new Set([...Object.keys(ha), ...Object.keys(hb)])
    return [...ks].every((k) => ha[k] === hb[k])
  } catch { return a === b }
}
// history.length does not shrink after Back and the index stops moving at Chrome's 50-entry cap, so a push is read off the Navigation API's entry KEY:
// a push makes a new entry (new key), replaceState keeps the key
const navIndex = (page) => page.evaluate(() => (window.navigation?.currentEntry ? window.navigation.currentEntry.key : '')).catch(() => '')
const kindOf = (href) => (/[?&#]p=|player=/.test(href) ? 'player' : /team=/.test(href) ? 'team' : /game=/.test(href) ? 'game' : 'link')
const hashOf = (url) => { try { return Object.fromEntries(new URLSearchParams(new URL(url).hash.replace(/^#/, ''))) } catch { return {} } }
const BRAND_OF = Object.fromEntries(Object.entries(R.BRAND).map(([k, v]) => [k, v.name]))

// the board paints a "Loading…" shell first: wait for real content (up to 10s), then a beat for the data to land
async function settle(page, ms = 2200) {
  await page.waitForLoadState('load').catch(() => {})
  await page.waitForFunction(() => (document.body?.innerText || '').trim().length > 80, null, { timeout: 10000 }).catch(() => {})
  await page.waitForTimeout(Math.min(ms, 1500))
}

// what is on screen, reduced to what a shared link must reproduce
// A legacy address (/start, /c, /app?sport=) redirects AFTER load, so a read can land mid-navigation ("Execution context was
// destroyed"): wait for the new page and read again, instead of the whole run dying (2026-10-21).
async function snapshot(page) {
  for (let i = 0; ; i++) {
    try { return await snapshotOnce(page) } catch (e) {
      if (i >= 4 || !/context was destroyed|navigat/i.test(String(e?.message || e))) throw e
      await page.waitForLoadState('load').catch(() => {}); await page.waitForTimeout(800)
    }
  }
}
async function snapshotOnce(page) {
  return page.evaluate(() => {
    const t = document.body?.innerText || ''
    const h = Object.fromEntries(new URLSearchParams(location.hash.replace(/^#/, '')))
    return {
      path: location.pathname, search: location.search, hash: location.hash, title: document.title, h,
      len: t.trim().length,
      notFound: [...document.querySelectorAll('h1,h2')].some((e) => /isn['’]t on the board|page could not be found|^404/i.test(e.textContent || '')) || /^(not found|404|application error)|internal server error/i.test(document.title) || /Application error: a client-side exception/i.test(t),
      dialog: !!document.querySelector('[role=dialog],[aria-modal=true]'),
      text: t.slice(0, 20000),
    }
  })
}
const fingerprint = (s) => JSON.stringify({ path: s.path, sport: s.h.sport || '', tab: s.h.tab || '', p: s.h.p || '', player: s.h.player || '', game: s.h.game || '', team: s.h.team || '', lv: s.h.lv || '', brand: (s.path !== '/app' ? '' : s.title.match(/·\s*(MOONSHOT|TUDDY|LAMP|BUCKETS)\s*·/) || [])[1] || '', nf: s.notFound, blank: s.len < 40 })

// (a)+(b): is the landing the thing the link says
function judge(href, base, label, s, status) {
  const u = new URL(href, base)
  const bad = []
  if (status >= 400) bad.push(`HTTP ${status}`)
  if (s.len < 40) bad.push('blank page')
  if (s.notFound && !/^\/(not-found)/.test(u.pathname)) bad.push('landed on a not-found / error screen')
  if (u.pathname === '/app' || u.pathname === '/app/') {
    const want = Object.fromEntries(new URLSearchParams(u.hash.replace(/^#/, '')))
    if (s.path !== '/app') bad.push(`left /app for ${s.path}`)
    if (want.sport) {
      if (want.sport !== s.h.sport) bad.push(`asked sport=${want.sport}, landed sport=${s.h.sport || '(none)'}`)
      const brand = BRAND_OF[want.sport]
      if (brand && !s.title.includes(`· ${brand} ·`)) bad.push(`title says "${s.title.slice(0, 50)}", not ${brand}`)
      const r = R.resolveTab(want.sport, want.tab)
      const peek = ['pm', 'card'].some((q) => want.player && s.h[q] === want.player)   // the card opened over the page you were on
      if (want.tab && s.h.tab !== r.tab && !(r.tab === 'home' && !s.h.tab) && !peek) bad.push(`asked tab=${want.tab} (=> ${r.tab}), landed tab=${s.h.tab || '(none)'}`)
      if (!want.tab && s.h.tab && s.h.tab !== 'home') bad.push(`no tab asked, landed tab=${s.h.tab}`)
    }
    // a player can open as the page (player=), the modal (p=) or the card laid over the page you are on (pm= / card=: components/PlayerPeek.js); all are HIM
    for (const k of ['p', 'player']) if (want[k] && !['p', 'player', 'pm', 'card'].some((q) => String(s.h[q] || '') === want[k])) bad.push(`asked ${k}=${want[k]}, landed ${['p', 'player', 'pm', 'card'].map((q) => s.h[q]).find(Boolean) || '(no player in the address)'}`)
    for (const k of ['game', 'team']) if (want[k] && String(s.h[k] || '') !== want[k]) bad.push(`asked ${k}=${want[k]}, landed ${k}=${s.h[k] || '(none)'}`)
    if (want.p && !s.dialog) bad.push(`asked p=${want.p}: no player card opened`)
    if (want.team && !s.text.includes(want.team) && !s.dialog) bad.push(`team ${want.team} not on the landed screen`)
  } else if (u.pathname !== s.path && !(u.pathname === '/ledger' && s.path === '/called') && !(RETIRED_PATHS.includes(u.pathname) && s.path === '/app')) {
    bad.push(`asked ${u.pathname}, landed ${s.path}${s.search}`)
  } else if (u.search && u.pathname === s.path && ['sport'].some((k) => u.searchParams.get(k) && u.searchParams.get(k) !== new URLSearchParams(s.search).get(k)) && s.path !== '/app') {
    bad.push(`asked ?${u.searchParams}, landed ${s.search || '(no query)'}`)
  }
  return bad
}

// (e) static: an address that should not be written into a page any more
function stale(href, base) {
  let u
  try { u = new URL(href, base) } catch { return [] }
  if (u.origin !== new URL(base).origin) return []
  const out = []
  if (RETIRED_PATHS.includes(u.pathname)) out.push(`points at retired ${u.pathname}`)
  if (u.pathname === '/app') {
    const q = u.searchParams
    if (q.get('sport') || q.get('tab')) out.push('uses the old /app?sport= shape (proxy redirects it)')
    const h = Object.fromEntries(new URLSearchParams(u.hash.replace(/^#/, '')))
    if (h.sport && h.tab && R.isSport(h.sport)) {
      const r = R.resolveTab(h.sport, h.tab)
      if (r.status === 'alias') out.push(`tab=${h.tab} is a retired key (now ${r.tab}${r.view ? `/${r.view}` : ''})`)
      if (r.status === 'missing') out.push(`tab=${h.tab} does not exist`)
    }
  }
  return out
}

// everything linkable on the page as it stands (the More sheet is opened first on a phone)
async function harvest(page, phone) {
  return page.evaluate(({ phone }) => {
    document.querySelectorAll('details').forEach((d) => { d.open = true })   // a link inside a closed fold is still a link
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (!el.checkVisibility || el.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true })) }
    const areaOf = (el) => (el.closest('[role=menu]') ? 'menu' : el.closest('.mobileMore') ? 'more' : el.closest('.mobileTabBar') ? 'bar' : el.closest('header') ? 'header' : el.closest('footer') ? 'footer' : el.closest('nav') ? 'nav' : 'content')
    const out = []
    const seen = new Map()
    let i = 0
    for (const el of document.querySelectorAll('a[href]')) {
      if (!vis(el)) continue
      const href = el.getAttribute('href')
      const k = href + '|' + (seen.get(href) || 0)
      seen.set(href, (seen.get(href) || 0) + 1)
      const label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
      // (g) hit-test: scroll to it, is the thing under its centre the link (or inside it)?
      let cover = ''
      const inFixed = !!el.closest('.mobileTabBar,.mobileMore,header,[role=menu]')
      if (!inFixed) {
        el.scrollIntoView({ block: 'center' })
        const r = el.getBoundingClientRect()
        const x = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), y = Math.min(innerHeight - 1, Math.max(0, r.top + Math.min(r.height / 2, 20)))
        const hit = document.elementFromPoint(x, y)
        if (hit && hit !== el && !el.contains(hit) && !hit.contains(el)) {
          const f = hit.closest('.mobileTabBar,.slipChip,.account-nudge,[class*=nudge],[class*=toast]') || hit
          cover = `${f.tagName.toLowerCase()}.${String(f.className).split(' ')[0].slice(0, 30)}`
        }
      }
      const tgt = el.getAttribute('target') || '', rel = (el.getAttribute('rel') || '').toLowerCase()
      out.push({ href, label, area: areaOf(el), target: tgt, rel, nth: seen.get(href) - 1, cover, key: k })
    }
    window.scrollTo(0, 0)
    return out
  }, { phone })
}

async function navButtons(page) {
  // the bottom bar, the More sheet and the TOP BAR of the page (stat chips and hero tiles under it are content, not navigation)
  return page.evaluate(() => {
    const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden' }
    document.querySelectorAll('[data-clk-btn]').forEach((e) => e.removeAttribute('data-clk-btn'))
    const out = []
    for (const sc of ['nav.mobileTabBar', 'aside.mobileMore', 'header']) {
      let k = 0
      for (const b of document.querySelectorAll(`${sc} button`)) {
        if (!vis(b)) continue
        const idx = k++
        const lab = (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim()
        if (/[▾▴]/.test(lab)) continue   // the account pill: its dropdown is walked as 'menu' links
        // the header's NAVIGATION: product switch, home, search, account, the day / week toggles. Its stat chips are a ticker, not links.
        if (sc === 'header' && !/switch to|\bhome\b|search|account|sign (up|in)|⚙|^this week|^next week|^today|^tmrw|^yesterday/i.test(lab)) continue
        b.setAttribute('data-clk-btn', `${sc}#${idx}`)
        out.push({ scope: sc, idx, tag: `${sc}#${idx}`, label: (b.getAttribute('aria-label') || b.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 50) })
      }
    }
    return out
  })
}

// the signed-in account pill's dropdown (components/SignUpPill.js): the button whose words end in a caret
async function openMenu(page) {
  if (await page.locator('[role=menu]').count()) return true
  const b = page.locator('header button').filter({ hasText: /[▾▴]/ }).filter({ visible: true }).first()
  if (!(await b.count())) return false
  await b.click({ timeout: 3000 }).catch(() => {})
  await page.waitForTimeout(400)
  return (await page.locator('[role=menu]').count()) > 0
}
const openFolds = (page) => page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true })).catch(() => {})
async function openMore(page) {
  if (await page.locator('aside.mobileMore.open').count()) return true   // already open: the bar's button toggles
  const b = page.locator('nav.mobileTabBar button[aria-label^="More"]').first()
  if (await b.count()) { await b.click({ timeout: 4000 }).catch(() => {}); await page.waitForTimeout(500); return true }
  return false
}

async function main() {
  if (!CHROME) { console.error('no chrome found: pass --chrome /path/to/chrome'); process.exit(2) }
  try { const r = await fetch(BASE + '/'); if (!r.ok) throw new Error(r.status) } catch (e) { console.error(`server not answering at ${BASE} (${e.message}); start: npx next start -p 3113`); process.exit(2) }
  // a server that dies mid-run would turn every later link into a "failure": stop instead
  let misses = 0
  setInterval(async () => { try { const r = await fetch(BASE + '/', { signal: AbortSignal.timeout(20000) }); misses = r.ok ? 0 : misses + 1 } catch { misses++ } if (misses >= 3) { console.error(`server at ${BASE} stopped answering: run aborted (${rows.length} links checked so far)`); process.exit(3) } }, 15000).unref()
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] })

  async function newCtx(w, member) {
    const ctx = await browser.newContext({ viewport: { width: w, height: w < 500 ? 844 : 900 }, isMobile: w < 500, hasTouch: w < 500 })
    await ctx.route('**/api/dash/state*', (r) => r.fulfill({ json: member ? { signedIn: true, configured: true, state: {}, who: { member: true } } : { signedIn: false, configured: true } }))
    // nothing leaves the box: external pages are never loaded (their links are checked on the anchor)
    await ctx.route((url) => url.origin !== new URL(BASE).origin, (r) => r.abort())
    return ctx
  }

  async function freshLoad(ctx, url, until = null) {
    const pg = await ctx.newPage()
    let status = 0
    pg.on('response', (r) => { if (r.request().isNavigationRequest() && r.frame() === pg.mainFrame()) status = r.status() })
    await pg.goto(url, { waitUntil: 'load', timeout: 45000 }).catch(() => {})
    await settle(pg, 1800)
    let s = await snapshot(pg)
    for (let i = 0; until && i < 10 && !until(s); i++) { await pg.waitForTimeout(800); s = await snapshot(pg) }   // the board lands after the shell: give it up to 8s
    await pg.close()
    return { s, status }
  }

  async function runTask(w, member) {
    const phone = w < 500
    const auth = member ? 'member' : 'free'
    const ctx = await newCtx(w, member)
    const fresh = await newCtx(w, member)
    let page = await ctx.newPage()
    let navStatus = 0
    page.on('response', (r) => { if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) navStatus = r.status() })
    const done = new Set()   // (href) already clicked in this task
    const freshDone = new Set()
    const label = (s) => `${w}/${auth}`

    let srcUrl = ''
    const ensureSrc = async () => {
      if (srcUrl && !sameState(page.url(), srcUrl)) { await page.goto(srcUrl, { waitUntil: 'load' }).catch(() => {}); await settle(page, 1500) }
    }
    // the screen as it settles: the SPA moves the hash at once but the title and the board follow; judge when it agrees or give up after 9s
    async function landed(href, base, label) {
      let s, bad
      for (let i = 0; i < 18; i++) {
        await page.waitForTimeout(500)
        s = await snapshot(page)
        bad = judge(href, base, label, s, navStatus)
        if (!bad.length) break
      }
      return { s, bad }
    }
    // (d) the landing address loaded fresh, once per address and width
    async function sharedLink(landing, s, bad) {
      const key = fingerprint(s)
      if (!freshDone.has(landing)) {
        freshDone.add(landing)
        const f = await freshLoad(fresh, landing)
        const fk = fingerprint(f.s)
        if (fk !== key) bad.push(`fresh load of ${landing.replace(BASE, '')} differs from the click: ${diffFp(key, fk)}`)
        if (f.status >= 400) bad.push(`fresh load HTTP ${f.status}`)
      }
      if (!fp.has(landing)) fp.set(landing, {})
      fp.get(landing)[w] = key
    }
    // (c) one tap = one history entry, and Back undoes it
    async function backOk(before, i0, bad, pathChanged) {
      const i1 = await navIndex(page)
      if (has('--debug')) console.error(`   nav entry ${i0} -> ${i1} (${page.url().replace(BASE, '')})`)
      if (i0 && i1 && i1 === i0) { bad.push('no history entry: Back leaves the page instead of undoing this tap'); return }
      await page.goBack({ waitUntil: 'load', timeout: 20000 }).catch(() => {})
      await page.waitForTimeout(1300)
      if (!sameState(page.url(), before)) bad.push(`Back went to ${page.url().replace(BASE, '')}, not ${before.replace(BASE, '')}`)
    }

    // a busy box can miss a tap or a card once; a real bug fails twice. One retry after a clean reload, for the reasons that load can cause.
    const TRANSIENT = /tap failed|disappeared|gone before|no player card opened|blank page|not-found|title says/
    async function retryOnce(run) {
      const n = rows.length
      await run()
      const mine = rows.slice(n)
      if (mine.length === 1 && mine[0].res === 'FAIL' && TRANSIENT.test(mine[0].why)) {
        rows.length = n
        if (srcUrl) { await page.goto(srcUrl, { waitUntil: 'load' }).catch(() => {}); await settle(page, 2500) }
        await run()
      }
    }

    async function clickAnchor(from, a) {
      const sel = `a[href=${JSON.stringify(a.href)}]`
      const base = new URL(from, BASE).href
      const rec = (res, why, extra = {}) => add({ w, auth, from, label: a.label, href: a.href, area: a.area, res, why, ...extra })
      await ensureSrc()
      if (a.area === 'more') await openMore(page)
      if (a.area === 'menu') { await page.evaluate(() => window.scrollTo(0, 0)); await openMenu(page) }
      await openFolds(page)
      let loc = page.locator(sel).filter({ visible: true }).nth(a.nth)
      // a href that follows the address (the sign-up link carries where you are) is found by its words
      for (let i = 0; i < 14 && (await loc.count()) === 0; i++) await page.waitForTimeout(500)   // the account rows arrive with /api/dash/state
      if ((await loc.count()) === 0 && a.label) loc = page.locator('a[href]').filter({ visible: true, hasText: a.label.slice(0, 24) }).first()
      if ((await loc.count()) === 0) return rec('FAIL', 'link disappeared before it could be clicked')
      const before = page.url()
      const i0 = await navIndex(page)
      const isHere = /HERE\s*$/.test(a.label) && a.area === 'more'   // the product you are already in is marked HERE in the product list: it is a marker, not a move
      if (a.area !== 'more' && a.area !== 'bar' && a.area !== 'menu') await loc.evaluate((el) => el.scrollIntoView({ block: 'center' })).catch(() => {})
      navStatus = 0
      try { await loc.click({ timeout: 6000 }) } catch (e) {
        // once more: a busy page can miss the first window; a cover or a dead target fails twice
        try { await loc.evaluate((el) => el.scrollIntoView({ block: 'center' })); await loc.click({ timeout: 6000 }) } catch (e2) { return rec('FAIL', `tap failed: ${String(e2.message).split('\n').filter((l) => /intercepts|not visible|outside|detached/.test(l))[0]?.trim() || String(e2.message).split('\n')[0].slice(0, 120)}`) }
      }
      if (isHere) { await page.waitForTimeout(500); return rec('PASS', 'the current product (marked HERE): stays put') }
      await page.waitForLoadState('load').catch(() => {})
      const { s, bad } = await landed(a.href, base, a.label)
      const after = page.url()
      await sharedLink(after, s, bad)
      if (!sameState(after, before)) await backOk(before, i0, bad)
      rec(bad.length ? 'FAIL' : 'PASS', bad.join('; ') || (sameState(after, before) ? 'already here' : `-> ${after.replace(BASE, '')}`), { landed: after.replace(BASE, '') })
    }


    async function pageRun(from) {
      const base = new URL(from, BASE).href
      let status = 0
      page.removeAllListeners('response')
      page.on('response', (r) => { if (r.request().isNavigationRequest() && r.frame() === page.mainFrame()) { status = r.status(); navStatus = status } })
      await page.goto(base, { waitUntil: 'load', timeout: 45000 }).catch(() => {})
      await settle(page, 2200)
      srcUrl = page.url()
      const T = Date.now(); const lap = (m) => { if (has('--progress')) console.error(`   [${w}/${auth}] ${m} +${Math.round((Date.now() - T) / 100) / 10}s`) }
      const s0 = await snapshot(page)
      if (status >= 400 || s0.len < 40 || (s0.notFound && !/tab=(zzz)/.test(from))) add({ w, auth, from, label: '(the page itself)', href: from, area: 'page', res: 'FAIL', why: `${status >= 400 ? `HTTP ${status}` : s0.len < 40 ? 'blank page' : 'not-found / error screen'}` })
      lap('loaded')
      let links = await harvest(page, phone)
      lap(`harvested ${links.length}`)
      if (phone && (await openMore(page))) {
        const more = (await harvest(page, phone)).filter((l) => l.area === 'more')
        const known = new Set(links.map((l) => l.key))
        links = links.concat(more.filter((l) => !known.has(l.key) || l.area === 'more'))
        await page.keyboard.press('Escape').catch(() => {})
        const close = page.locator('aside.mobileMore button[aria-label="Close More menu"]').first()
        if (await close.isVisible().catch(() => false)) await close.click({ timeout: 2000 }).catch(() => {})
        await page.waitForTimeout(300)
      }
      if (member && (await openMenu(page))) {
        links = links.concat((await harvest(page, phone)).filter((l) => l.area === 'menu'))
        await page.keyboard.press('Escape').catch(() => {})
        await page.evaluate(() => document.activeElement?.blur?.())
      }
      lap(`more opened, ${links.length} links`)
      // static checks on every link, clicks on the first of each address
      const perKind = {}
      for (const a of links) {
        const href = a.href
        const abs = (() => { try { return new URL(href, base) } catch { return null } })()
        const rec = (res, why, extra = {}) => add({ w, auth, from, label: a.label, href, area: a.area, res, why, ...extra })
        if (!abs) { rec('FAIL', 'unparseable href'); continue }
        if (a.cover && !/^skip/i.test(a.label)) { rec('FAIL', `(g) covered by ${a.cover} at its tap point`); continue }
        if (abs.protocol === 'mailto:') {
          if (!done.has(href)) { done.add(href); rec(/^mailto:[^@\s]+@[^@\s]+$/.test(href) ? 'PASS' : 'FAIL', 'mailto') }
          continue
        }
        if (abs.origin !== new URL(BASE).origin) {
          if (done.has(href)) continue
          done.add(href)
          const why = []
          if (!hostOk(abs.hostname)) why.push(`host ${abs.hostname} not on the allow-list`)
          if (a.target !== '_blank') why.push('opens in the same tab (no target=_blank)')
          if (!/\bnoopener\b/.test(a.rel)) why.push('missing rel=noopener')
          rec(why.length ? 'FAIL' : 'PASS', why.join('; ') || `external ${abs.hostname}`)
          continue
        }
        const st = stale(href, base)
        const key = `${href}`
        const k = kindOf(href)
        const shell = a.area !== 'content'
        if (done.has(key)) continue
        // pure in-page anchors: the target must exist (a skip link is hidden until focused: it is not hit-tested)
        if (href.startsWith('#') && !/^#(sport|tab)=/.test(href)) {
          done.add(key)
          const id = decodeURIComponent(href.slice(1))
          const ok = id === 'top' || (await page.evaluate((i) => !!document.getElementById(i), id))
          // sandbox: no Supabase, so the sign-up card is replaced by "Accounts aren't configured on this deploy" and has no #create-account
          const unconfigured = !ok && id === 'create-account' && (await page.evaluate(() => /aren['’]t configured/i.test(document.getElementById('sign-in')?.innerText || '')))
          rec(ok ? 'PASS' : unconfigured ? 'SKIP' : 'FAIL', ok ? 'in-page anchor' : unconfigured ? 'sandbox: accounts not configured, so the sign-up card (#create-account) is not rendered' : `no element id="${id}" on the page`)
          continue
        }
        if (!shell) { perKind[k] = (perKind[k] || 0) + 1; if (perKind[k] > (QUICK ? 2 : 5)) continue }
        done.add(key)
        if (st.length) { rec('FAIL', st.join('; ')); continue }
        await retryOnce(() => clickAnchor(from, a))
      }
      lap('links done')
      // nav buttons (bottom bar, More sheet, top bar): a tap must move the URL / open a sheet, and where it goes is judged like a link
      const btns = await navButtons(page)
      const tapButton = async (b, base) => {
        const rec = (res, why, extra = {}) => add({ w, auth, from, label: b.label, href: '(button)', area: b.scope, res, why, ...extra })
        await ensureSrc()
        if (b.scope === 'aside.mobileMore') await openMore(page)
        const before = page.url()
        const i0 = await navIndex(page)
        const fresh2 = (await navButtons(page)).find((x) => x.scope === b.scope && x.label === b.label)
        if (!fresh2) { rec('FAIL', 'button gone before it could be tapped'); return }
        if (b.scope === 'header') { await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(400) }   // the header hides itself while the page is scrolled
        const loc = page.locator(`[data-clk-btn=${JSON.stringify(fresh2.tag)}]`)
        try {
          if (b.scope === 'header') {
            // the MLB header re-measures every frame (Playwright's "stable" never settles on it), so the tap is judged by hit-test, then made with force
            const hit = await loc.evaluate((el) => { const r = el.getBoundingClientRect(); const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !h || h === el || el.contains(h) || h.contains(el) ? '' : `${h.tagName.toLowerCase()}.${String(h.className).split(' ')[0].slice(0, 30)}` })
            if (hit) { rec('FAIL', `(g) header button covered by ${hit}`); return }
            await loc.click({ timeout: 4000, force: true })
          } else await loc.click({ timeout: 4000 })
        } catch (e) {
          if (has('--debug')) console.error('   tap debug', JSON.stringify(await loc.evaluate((el) => ({ html: el.outerHTML.slice(0, 160), disabled: el.disabled, inert: !!el.closest('[inert]'), hidden: !!el.closest('[aria-hidden=true]'), pe: getComputedStyle(el).pointerEvents, rect: el.getBoundingClientRect().toJSON(), scrollY: scrollY, url: location.href })).catch(() => 'gone')), JSON.stringify(await loc.evaluate(async (el) => { const o = []; for (let i = 0; i < 12; i++) { o.push(Math.round(el.getBoundingClientRect().x * 10) / 10 + ',' + Math.round(el.getBoundingClientRect().y * 10) / 10); await new Promise((r) => setTimeout(r, 120)) } return o }).catch(() => 'gone')))
          rec('FAIL', `tap failed: ${String(e.message).split('\n').filter((l) => /intercepts|not visible|outside|detached|strict|stable/.test(l))[0]?.replace(/\u001b\[\d+m/g, '').trim().slice(0, 140) || String(e.message).split('\n')[0].slice(0, 100)}`); return }
        let s
        for (let i = 0; i < 18; i++) {   // the address moves at once; the board and the title follow
          await page.waitForTimeout(500)
          s = await snapshot(page)
          const hh = s.h
          if (s.len >= 40 && (s.path !== '/app' || !hh.sport || s.title.includes(`· ${BRAND_OF[hh.sport]} ·`)) && (i > 0 || !sameState(page.url(), before))) break
          if (i >= 3 && sameState(page.url(), before)) break
        }
        const after = page.url()
        if (sameState(after, before)) {
          const opened = s.dialog || (await page.locator('aside.mobileMore.open,.qs-overlay').count()) > 0
          rec('PASS', opened ? 'opens a sheet' : 'no URL change (toggle / action)')
          if (opened) { await page.keyboard.press('Escape').catch(() => {}); await page.waitForTimeout(300); if (await page.locator('.qs-overlay,[role=dialog]').count()) { await page.goto(srcUrl, { waitUntil: 'load' }).catch(() => {}); await settle(page, 1500) } }   // close it before the next button
          return
        }
        const bad = []
        const h = s.h
        if (s.len < 40) bad.push('blank page')
        if (s.notFound) bad.push('landed on a not-found / error screen')
        if (h.sport && h.tab) { const r = R.resolveTab(h.sport, h.tab); if (r.status === 'missing') bad.push(`landed on tab=${h.tab}, which does not exist`) }
        if (h.sport && s.path === '/app' && !s.title.includes(`· ${BRAND_OF[h.sport]} ·`)) bad.push(`url says ${h.sport} but title says "${s.title.slice(0, 40)}"`)
        await sharedLink(after, s, bad)
        await backOk(before, i0, bad)
        rec(bad.length ? 'FAIL' : 'PASS', bad.join('; ') || `-> ${after.replace(BASE, '')}`, { landed: after.replace(BASE, '') })
      }
      for (const b of btns) {
        const bk = `btn|${b.scope}|${b.label}`
        if (done.has(bk) || /close|^more|^menu|^×/i.test(b.label)) continue
        done.add(bk)
        await retryOnce(() => tapButton(b))
      }
    }

    const list = member ? MEMBER_PAGES : FREE_PAGES
    for (const p of list) {
      const t0 = Date.now()
      try {
        // one page may take 4 minutes; a hung browser tab must not stall the whole run
        let timer
        await Promise.race([pageRun(p), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('page run timed out after 240s')), 240000) })]).finally(() => clearTimeout(timer))
        if (has('--progress')) console.error(`[${w}/${auth}] ${p} ${Math.round((Date.now() - t0) / 1000)}s, ${rows.length} links so far`)
      } catch (e) {
        if (/timed out/.test(e.message)) { await page.close({ runBeforeUnload: false }).catch(() => {}); page = await ctx.newPage() } add({ w, auth, from: p, label: '(page run)', href: p, area: 'page', res: 'FAIL', why: `check crashed: ${String(e.message).split('\n')[0].slice(0, 120)}` }) }
    }
    await ctx.close(); await fresh.close()
  }

  // legacy and shared addresses: where does an old link land
  async function runLegacy() {
    const ctx = await newCtx(1280, false)
    const cases = [
      ['/start', 'mlb', 'home'], ['/start?sport=nfl', 'nfl', 'home'], ['/start?sport=nhl', 'nhl', 'home'], ['/start?sport=zzz', 'mlb', 'home'],
      ['/c?sport=nfl', 'nfl', 'home'], ['/c?sport=nhl', 'nhl', 'home'], ['/c', 'mlb', 'home'],
      ['/c?sport=mlb&kind=pick&id=660271', 'mlb', null, { p: '660271' }], ['/c?sport=nfl&kind=pick&id=4040715', 'nfl', 'players', { player: '4040715' }],
      ['/c?sport=nhl&kind=pick&id=8478402', 'nhl', 'player', { player: '8478402' }],
      ['/app?sport=nfl', 'nfl', 'home'], ['/app?sport=nhl&tab=board', 'nhl', 'board'], ['/app?sport=nfl&tab=picks', 'nfl', 'picks'], ['/ledger?sport=nfl', null, null],
      ['/app', null, null],
    ]
    for (const [u, sport, tab, extra] of cases) {
      const f = await freshLoad(ctx, BASE + u)
      const s = f.s
      const bad = []
      if (f.status >= 400 && !u.startsWith('/app')) bad.push(`HTTP ${f.status}`)
      if (s.len < 40) bad.push('blank page')
      if (s.notFound) bad.push('not-found / error screen')
      if (sport && s.h.sport !== sport) bad.push(`landed sport=${s.h.sport || '(none)'}, wanted ${sport}`)
      if (tab && (s.h.tab || 'home') !== tab) bad.push(`landed tab=${s.h.tab || '(none)'}, wanted ${tab}`)
      for (const [k, v] of Object.entries(extra || {})) if (s.h[k] !== v) bad.push(`landed ${k}=${s.h[k] || '(none)'}, wanted ${v}`)
      if (u.startsWith('/ledger') && s.path !== '/called') bad.push(`/ledger landed ${s.path}`)
      add({ w: 1280, auth: 'free', from: '(legacy address)', label: u, href: u, area: 'legacy', res: bad.length ? 'FAIL' : 'PASS', why: bad.join('; ') || `-> ${s.path}${s.hash}` })
    }
    if (!has('--no-aliases')) {
      // every retired tab key of every sport, loaded fresh as a shared link would be
      for (const sp of SPORTS) {
        const t = R.resolveTab
        const aliases = Object.keys({ mlb: R.MLB_ALIASES, nfl: R.NFL_ALIASES, nhl: R.NHL_ALIASES }[sp] || {})
        for (const k of (QUICK ? aliases.slice(0, 6) : aliases)) {
          const r = t(sp, k)
          const f = await freshLoad(ctx, `${BASE}/app#sport=${sp}&tab=${k}`, (x) => x.len >= 40 && (r.status === 'missing' || (x.h.tab || 'home') === r.tab))
          const s = f.s
          const bad = []
          if (s.len < 40) bad.push('blank page')
          if (s.notFound) bad.push('not-found / error screen')
          if (r.status === 'missing') bad.push(`registry says "${k}" does not exist (resolveTab -> missing)`)
          else if ((s.h.tab || 'home') !== r.tab) bad.push(`landed tab=${s.h.tab || '(none)'}, registry says ${r.tab}`)
          else if (r.view && r.view !== 'tonight' && s.h.lv !== r.view && !(sp !== 'mlb' && s.h.lv === LV.tabOfView(r.view))) bad.push(`landed lv=${s.h.lv || '(none)'}, registry says ${r.view}`)
          if (s.h.sport !== sp) bad.push(`landed sport=${s.h.sport}`)
          add({ w: 1280, auth: 'free', from: '(alias key)', label: `${sp} #tab=${k}`, href: `/app#sport=${sp}&tab=${k}`, area: 'alias', res: bad.length ? 'FAIL' : 'PASS', why: bad.join('; ') || `-> tab=${s.h.tab}${s.h.lv ? `&lv=${s.h.lv}` : ''}` })
        }
      }
    }
    await ctx.close()
  }

  const tasks = []
  for (const w of WIDTHS) { if (!has('--member-only')) tasks.push(runTask(w, false)); if (!has('--no-member')) tasks.push(runTask(w, true)) }
  if (!has('--member-only')) tasks.push(runLegacy())
  await Promise.all(tasks)
  await browser.close()

  // (d) phone vs desktop: the same landing URL must be the same screen
  for (const [url, byW] of fp) {
    const ks = Object.entries(byW)
    if (ks.length > 1 && new Set(ks.map(([, v]) => v)).size > 1) add({ w: 0, auth: '-', from: '(phone vs desktop)', label: url.replace(BASE, ''), href: url.replace(BASE, ''), area: 'shared', res: 'FAIL', why: `different screens: ${ks.map(([w, v]) => `${w}px ${v}`).join(' | ')}` })
  }
}

function diffFp(a, b) {
  const A = JSON.parse(a), B = JSON.parse(b)
  return Object.keys(A).filter((k) => A[k] !== B[k]).map((k) => `${k}: ${A[k]} -> ${B[k]}`).join(', ')
}

await main()

// ── the table ──
const esc = (s) => String(s ?? '').replace(/\|/g, '/').replace(/\n/g, ' ')
const order = rows.slice().sort((a, b) => (a.res === b.res ? 0 : a.res === 'FAIL' ? -1 : 1))
const lines = ['| res | width | auth | area | from | link | href | reason |', '|---|---|---|---|---|---|---|---|']
for (const r of rows) lines.push(`| ${r.res} | ${r.w} | ${r.auth} | ${esc(r.area)} | ${esc(r.from)} | ${esc(r.label).slice(0, 40)} | ${esc(r.href)} | ${esc(r.why).slice(0, 220)} |`)
writeFileSync(OUT, lines.join('\n') + '\n')
if (has('--table')) console.log(lines.join('\n'))
const fails = rows.filter((r) => r.res === 'FAIL')
const skips = rows.filter((r) => r.res === 'SKIP')
// one line per distinct failure (the same bad link on thirty pages is one bug)
const uniq = new Map()
for (const r of fails) { const k = `${r.href}|${r.why}`; if (!uniq.has(k)) uniq.set(k, { ...r, n: 0, where: new Set() }); const u = uniq.get(k); u.n++; u.where.add(`${r.w}${r.auth === 'member' ? 'm' : ''}`) }
for (const r of uniq.values()) console.log(`FAIL [${[...r.where].join(',')}] x${r.n}  ${r.area}  from ${r.from}  "${r.label.slice(0, 30)}"  ${r.href}  -- ${r.why.slice(0, 260)}`)
const byArea = {}
for (const r of rows) byArea[r.area] = (byArea[r.area] || 0) + 1
console.log(`\n${rows.length} links checked (${rows.length - fails.length - skips.length} PASS, ${fails.length} FAIL, ${skips.length} SKIP; ${uniq.size} distinct) at widths ${WIDTHS.join('/')}; by area: ${Object.entries(byArea).map(([k, v]) => `${k} ${v}`).join(', ')}`)
console.log(`full table: ${OUT}${has('--table') ? '' : '  (--table prints it)'}`)
process.exit(fails.length ? 1 : 0)
