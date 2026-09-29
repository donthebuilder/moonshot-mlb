// DOM SNAPSHOT (2026-09-29, SportShell step 0). The proof that a refactor
// left a page's markup alone: save the header, the page body and the dock
// for every tab of a product at 390px, then diff two saves.
//
//   node scripts/dom-snapshot.mjs --base http://localhost:3332 --out /tmp/snap-main
//   node scripts/dom-snapshot.mjs --base http://localhost:3331 --out /tmp/snap-branch
//   node scripts/dom-snapshot.mjs --diff /tmp/snap-main /tmp/snap-branch
//
//   --sport mlb|nfl|nhl   default mlb (tabs from the registry, lib/routes.js)
//   --tabs a,b            only these tabs
//
// Both servers should read the SAME data (build both with the same
// NEXT_PUBLIC_DATA_BASE, e.g. the dev fixture) or the diff is the data.
// Clocks and "N min ago" are masked before saving; anything else that moves
// between two loads of the same build is reported by running it twice.
import { createRequire } from 'node:module'
import './_esm-resolve.mjs'
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs'
import { join } from 'path'

const argv = process.argv.slice(2)
const arg = (k, d = null) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }

if (argv.includes('--diff')) {
  const [a, b] = [arg('--diff'), argv[argv.indexOf('--diff') + 2]]
  let bad = 0
  for (const f of readdirSync(a).filter((x) => x.endsWith('.html')).sort()) {
    const A = readFileSync(join(a, f), 'utf8')
    const B = existsSync(join(b, f)) ? readFileSync(join(b, f), 'utf8') : null
    if (B === null) { console.log(`MISSING ${f}`); bad++; continue }
    if (A === B) { console.log(`same    ${f}`); continue }
    bad++
    const la = A.split('\n'); const lb = B.split('\n')
    let i = 0; while (i < la.length && la[i] === lb[i]) i++
    console.log(`DIFF    ${f}  first at line ${i + 1}\n  - ${String(la[i]).slice(0, 220)}\n  + ${String(lb[i]).slice(0, 220)}`)
  }
  console.log(bad ? `\n${bad} differ` : '\nall identical')
  process.exit(bad ? 1 : 0)
}

const { chromium } = createRequire(`${process.cwd()}/package.json`)('playwright-core')
const BASE = (arg('--base') || 'http://localhost:3000').replace(/\/$/, '')
const OUT = arg('--out') || 'dom-snapshot'
const SPORT = arg('--sport', 'mlb')
const reg = await import('../lib/routes.js')
const ALL = { mlb: reg.MLB_TABS, nfl: reg.NFL_TABS, nhl: reg.NHL_TABS }[SPORT]
const TABS = arg('--tabs') ? arg('--tabs').split(',') : ALL
mkdirSync(OUT, { recursive: true })

const exe = ['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser'].find((p) => existsSync(p))
const browser = await chromium.launch({ executablePath: exe })
const mask = (s) => s
  .replace(/\b\d{1,2}:\d{2}(:\d{2})?\s?(AM|PM|am|pm)?\b/g, '#:#')
  .replace(/\b\d+\s?(s|sec|min|m|h|hr|hrs|d)\s+ago\b/g, '# ago')
  .replace(/\bjust now\b/g, '# ago')
  .replace(/\b\d+h \d+m\b/g, '#h #m')
  .replace(/></g, '>\n<')

for (const tab of TABS) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
  await page.goto(`${BASE}/app#sport=${SPORT}&tab=${tab}`, { waitUntil: 'load', timeout: 30000 }).catch(() => {})
  // Not networkidle: live tabs poll and never go idle. A fixed settle.
  await page.waitForTimeout(3500)
  const html = await page.evaluate(() => {
    const pick = (sel) => document.querySelector(sel)?.outerHTML || `<!-- no ${sel} -->`
    return [pick('header'), pick('#board-main'), pick('nav[aria-label]')].join('\n')
  })
  writeFileSync(join(OUT, `${SPORT}-${tab}.html`), mask(html))
  console.log(`saved ${SPORT}-${tab}`)
  await page.close()
}
await browser.close()
