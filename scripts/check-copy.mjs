#!/usr/bin/env node
// THE COPY DIET (2026-10-17, Donovan: "use less words site wide"; "too much words" on the phone). Counts the WORDS a phone reader meets: per page,
// the words on screen, and the PROSE BLOCKS (a run of text of 14+ words that is not a table cell): notes, legends, footers, explainers. Then the blocks
// that repeat across pages (the same sentence on 3+ pages is one sentence too many).
//   node --import ./scripts/_esm-resolve.mjs scripts/check-copy.mjs                    local build on :3108, 390x844, every registry route
//   node --import ./scripts/_esm-resolve.mjs scripts/check-copy.mjs --only nfl         one product (mlb|nfl|nhl|nba)
//   node --import ./scripts/_esm-resolve.mjs scripts/check-copy.mjs --budget 120       fail when a page's prose words exceed N (default: report only)
//   --json out.json  writes every page's blocks
import { existsSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'http://localhost:3108')
const ONLY = arg('--only', null)
const BUDGET = Number(arg('--budget', 0)) || 0
const JSON_OUT = arg('--json', null)
const req = createRequire(import.meta.url)
const { chromium } = req('playwright-core')
const { MLB_TABS, NFL_TABS, NHL_TABS, NBA_TABS, appHref } = await import('../lib/routes.js')
const exe = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'].find((p) => existsSync(p))

const PRODUCTS = { mlb: MLB_TABS, nfl: NFL_TABS, nhl: NHL_TABS, nba: NBA_TABS }
const routes = []
for (const [sport, tabs] of Object.entries(PRODUCTS)) {
  if (ONLY && ONLY !== sport) continue
  for (const t of tabs) routes.push({ sport, tab: t, path: appHref(sport, t) })
}

const measure = () => {
  const words = (s) => (String(s).trim().match(/\S+/g) || []).length
  const vis = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' }
  const blocks = []
  const seen = new Set()
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT)
  let n
  while ((n = walker.nextNode())) {
    const tag = n.tagName
    if (['SCRIPT', 'STYLE', 'SVG', 'NOSCRIPT', 'TD', 'TH', 'BUTTON', 'INPUT', 'SELECT', 'CANVAS'].includes(tag) || n.closest('svg, table, button, nav, script')) continue
    // a text block: an element whose own direct text (and inline children's) is the run; take elements with no block-level element children
    const hasBlockChild = [...n.children].some((c) => /^(DIV|P|UL|OL|LI|SECTION|TABLE|H[1-6]|BUTTON|FORM|ARTICLE)$/.test(c.tagName))
    if (hasBlockChild) continue
    const text = (n.innerText || '').replace(/\s+/g, ' ').trim()
    const w = words(text)
    if (w < 14 || seen.has(text) || !vis(n)) continue
    seen.add(text)
    blocks.push({ w, text: text.slice(0, 160), px: Math.round(parseFloat(getComputedStyle(n).fontSize)) })
  }
  const body = (document.body.innerText || '')
  return { total: words(body), blocks }
}

const b = await chromium.launch({ executablePath: exe, headless: true })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true })
const p = await ctx.newPage()
const pages = []
for (const r of routes) {
  await p.goto(BASE + r.path, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
  await p.waitForTimeout(2500)
  const m = await p.evaluate(measure).catch(() => null)
  if (!m) continue
  const prose = m.blocks.reduce((a, x) => a + x.w, 0)
  pages.push({ ...r, total: m.total, prose, blocks: m.blocks })
  process.stdout.write('.')
}
await b.close()
console.log('')

const rank = [...pages].sort((a, b2) => b2.prose - a.prose)
console.log(`\n${pages.length} pages. WORDS on screen (all) / in prose blocks of 14+ words:`)
for (const x of rank.slice(0, 15)) console.log(`  ${String(x.prose).padStart(4)} prose / ${String(x.total).padStart(5)} all   ${x.sport} ${x.tab}`)
const rep = new Map()
for (const x of pages) for (const bl of x.blocks) { const k = bl.text.slice(0, 80); const e = rep.get(k) || { n: 0, w: bl.w, text: bl.text, pages: [] }; e.n += 1; e.pages.push(`${x.sport}/${x.tab}`); rep.set(k, e) }
console.log('\nSAME BLOCK ON 3+ PAGES (one sentence too many):')
for (const e of [...rep.values()].filter((e) => e.n >= 3).sort((a, b2) => b2.n * b2.w - a.n * a.w).slice(0, 15)) console.log(`  x${e.n} ${e.w}w "${e.text.slice(0, 100)}"`)
console.log('\nLONGEST SINGLE BLOCKS:')
const all = pages.flatMap((x) => x.blocks.map((bl) => ({ ...bl, at: `${x.sport}/${x.tab}` })))
for (const e of all.sort((a, b2) => b2.w - a.w).slice(0, 25)) console.log(`  ${String(e.w).padStart(3)}w ${e.px}px ${e.at}: "${e.text.slice(0, 110)}"`)
const totalProse = pages.reduce((a, x) => a + x.prose, 0)
console.log(`\nprose words across ${pages.length} pages: ${totalProse} (avg ${Math.round(totalProse / Math.max(1, pages.length))} a page)`)
if (JSON_OUT) writeFileSync(JSON_OUT, JSON.stringify(pages, null, 1))
if (BUDGET) { const over = pages.filter((x) => x.prose > BUDGET); if (over.length) { console.log(`\n${over.length} page(s) over the ${BUDGET}-word prose budget`); process.exit(1) } }
