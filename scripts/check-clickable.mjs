#!/usr/bin/env node
// EVERY NAME, TEAM AND GAME IS A LINK (2026-09-27, CLICK-EVERYTHING-PLAN).
//   node scripts/check-clickable.mjs [--base http://localhost:3108] [--pages "/app#sport=mlb&tab=ledger,..."] [--report]
// Playwright (Brave), 1280 and 390. For each page: every element whose own
// text is a KNOWN player name (tonight's MLB slate, this week's NFL file, the
// NHL rosters), a known team code, or an "AWY @ HOM" game -- and whether it,
// or an ancestor, is tappable (a/button/role=link|button/summary/onclick or a
// pointer cursor). Prints "N not tappable" per page with examples; exits 1 if
// any, unless --report. The names come from the data, never guessed; a name
// inside a sentence is not counted (the plan says so).
import { createRequire } from 'node:module'
const req = createRequire(import.meta.url)
const { chromium } = req('playwright-core')

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'http://localhost:3108')
const REPORT = process.argv.includes('--report')
const DEFAULT_PAGES = [
  '/app#sport=mlb', '/app#sport=mlb&tab=board', '/app#sport=mlb&tab=results', '/app#sport=mlb&tab=ledger',
  '/app#sport=mlb&tab=storylines', '/app#sport=mlb&tab=games', '/app#sport=mlb&tab=pitchers', '/app#sport=mlb&tab=matchups',
  '/app#sport=nfl', '/app#sport=nfl&tab=boards', '/app#sport=nfl&tab=storylines', '/app#sport=nfl&tab=matchups', '/app#sport=nfl&tab=ledger',
  '/app#sport=nhl', '/app#sport=nhl&tab=board&date=2026-09-29', '/app#sport=nhl&tab=storylines', '/app#sport=nhl&tab=ledger&date=2026-09-29', '/app#sport=nhl&tab=schedule',
  '/start', '/called',
]
const PAGES = (arg('--pages', '') || '').split(',').map((s) => s.trim()).filter(Boolean)
const pages = PAGES.length ? PAGES : DEFAULT_PAGES
const RAW = 'https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current'

const j = async (u) => { try { const r = await fetch(u); return r.ok ? r.json() : null } catch { return null } }
// BUCKETS' directory answers only while it is open to this server (BUCKETS_PUBLIC=on locally); closed, it adds nothing
const [mlb, nfl, nhl, nba] = await Promise.all([j(`${RAW}/today_slim.json`), j(`${RAW}/nfl_week.json`), j(`${BASE}/api/lamp/players`), j(`${BASE}/api/buckets/players`)])
const names = new Set(); const teams = new Set()
for (const r of (Array.isArray(mlb) ? mlb : mlb?.players || [])) { if (r?.name) names.add(r.name); if (r?.team) teams.add(r.team); if (r?.pitcher_name) names.add(r.pitcher_name) }
for (const p of nfl?.players || []) { if (p?.name && p.position !== 'DEF') names.add(p.name); if (p?.team) teams.add(p.team) }
for (const p of nhl?.players || []) { if (p?.name) names.add(p.name); if (p?.team) teams.add(p.team) }
for (const p of nba?.players || []) { if (p?.name) names.add(p.name); if (p?.team) teams.add(p.team) }
console.log(`known: ${names.size} players, ${teams.size} team codes (MLB slate, NFL week, NHL rosters${nba ? ', NBA directory' : ''})`)

const browser = await chromium.launch({ executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser' })
let bad = 0
const table = []
for (const path of pages) {
  for (const w of [1280, 390]) {
    const page = await (await browser.newContext({ viewport: { width: w, height: 900 }, isMobile: w < 500, hasTouch: w < 500 })).newPage()
    try { await page.goto(BASE + path, { waitUntil: 'load', timeout: 60000 }) } catch { console.log(`${path} ${w}: did not load`); bad++; await page.context().close(); continue }
    await page.waitForTimeout(9000)
    const res = await page.evaluate(({ names, teams }) => {
      const N = new Set(names); const T = new Set(teams)
      const GAME = /^([A-Z]{2,4})\s*[@v]\s*([A-Z]{2,4})$/
      const kind = (t) => (N.has(t) ? 'player' : T.has(t) ? 'team' : (GAME.test(t) && T.has(t.match(GAME)[1]) && T.has(t.match(GAME)[2])) ? 'game' : null)
      const tappable = (el) => {
        if (el.closest('a,button,[role=button],[role=link],summary,[onclick],select,option,label')) return true
        for (let e = el, i = 0; e && i < 6; e = e.parentElement, i++) if (getComputedStyle(e).cursor === 'pointer') return true
        return false
      }
      const out = { total: 0, bad: [] }
      for (const el of document.querySelectorAll('body *')) {
        if (el.children.length) continue
        if (el.closest('header,nav,[aria-hidden="true"],title,script,style')) continue
        const t = (el.textContent || '').trim()
        if (!t || t.length > 40) continue
        const k = kind(t)
        if (!k) continue
        if (!el.offsetParent && getComputedStyle(el).position !== 'fixed') continue
        out.total++
        if (!tappable(el)) out.bad.push(`${k}:${t}`)
      }
      return out
    }, { names: [...names], teams: [...teams] })
    const uniq = [...new Set(res.bad)]
    table.push({ path, w, total: res.total, bad: res.bad.length })
    console.log(`${path} ${w}: ${res.bad.length} not tappable of ${res.total}${uniq.length ? ` -- ${uniq.slice(0, 6).join(', ')}${uniq.length > 6 ? ` +${uniq.length - 6}` : ''}` : ''}`)
    bad += res.bad.length
    await page.context().close()
  }
}
await browser.close()
console.log(`\n${bad} not tappable across ${pages.length} pages x 2 widths`)
process.exit(bad && !REPORT ? 1 : 0)
