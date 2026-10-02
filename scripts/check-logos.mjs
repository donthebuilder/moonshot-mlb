#!/usr/bin/env node
// CLUBS ARE LOGOS (2026-10-02, Donovan: "do the logo stuff site wide... add
// them to the slate components"). Since 3bc4376 a club on a game surface is
// its logo, the code riding the logo's title / alt -- not "NYM @ WSH" in text,
// not a coloured code chip, not a logo with the code printed beside it.
//   node --import <loader> scripts/check-logos.mjs [--base http://localhost:3123] [--pages "..."] [--report]
// Playwright (Brave), 390 and 1280. Per page it counts, among VISIBLE text:
//   bare   an element whose own text is exactly a club code of that sport
//   games  an element whose own text holds "AAA @ BBB" with two club codes
// <option> labels (they can't hold an image) and sentences (a code inside
// longer prose) are not counted. Exits 1 if any count is > 0, unless --report.
import { createRequire } from 'node:module'
import { MLB_TEAMS } from '../lib/mlbTeams.js'
import { NFL_TEAMS } from '../lib/nfl/teams.js'
import { NHL_TEAMS } from '../lib/nhl/teams.js'
const req = createRequire(import.meta.url)
const { chromium } = req('playwright-core')

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'http://localhost:3123')
const REPORT = process.argv.includes('--report')
const WHERE = process.argv.includes('--where')   // name the element around each hit
const DEFAULT_PAGES = [
  '/app#sport=mlb&tab=games', '/app#sport=mlb&tab=scoreboard', '/app#sport=mlb&tab=home',
  '/app#sport=nfl&tab=games', '/app#sport=nfl&tab=live', '/app#sport=nfl&tab=scores', '/app#sport=nfl&tab=home',
  '/app#sport=nhl&tab=games', '/app#sport=nhl&tab=scores', '/app#sport=nhl&tab=home',
]
const pages = (arg('--pages', '') || '').split(',').map((s) => s.trim()).filter(Boolean)
const PAGES = pages.length ? pages : DEFAULT_PAGES
const CODES = {
  mlb: Object.keys(MLB_TEAMS),
  nfl: NFL_TEAMS.map((t) => t[0]),
  nhl: NHL_TEAMS.map((t) => t[0]),
}
const sportOf = (p) => (/sport=nfl/.test(p) ? 'nfl' : /sport=nhl/.test(p) ? 'nhl' : 'mlb')

const b = await chromium.launch({ executablePath: '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', headless: true })
let total = 0
for (const path of PAGES) {
  for (const [w, h] of [[390, 844], [1280, 900]]) {
    const p = await b.newPage({ viewport: { width: w, height: h }, isMobile: w < 500, hasTouch: w < 500 })
    await p.goto(`${BASE}${path}`, { waitUntil: 'load' }).catch(() => {})
    await p.waitForTimeout(11000)
    const res = await p.evaluate(([codes, WHERE]) => {
      const set = new Set(codes)
      const game = new RegExp(`^(?:.*\\s)?(${codes.join('|')})\\s?@\\s?(${codes.join('|')})(?:\\s.*)?$`)
      const bare = [], games = []
      for (const el of document.querySelectorAll('body *')) {
        if (el.closest('option, select, script, style, title, th, [aria-hidden="true"]')) continue   // th: a column header ('TB' = total bases)
        const own = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join('').trim()
        if (!own || own.length > 40) continue
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue
        const where = () => { const a = el.closest('[aria-label],[class],section,table,button'); const lab = a?.getAttribute('aria-label') || a?.className || a?.tagName; return `${own} <${el.tagName.toLowerCase()} in ${String(lab).slice(0, 60)}>` }
        // a face tile's fallback code sits under its photo (the code shows only if the photo fails)
        if (el.querySelector(':scope > img')) continue
        // a code inside a sentence ("wore ATL in 2025") is prose, not a club mark
        const around = el.parentElement ? [...el.parentElement.childNodes].filter((n) => n !== el && n.nodeType === 3).map((n) => n.textContent).join(' ').trim() : ''
        if (around.split(/\s+/).filter(Boolean).length >= 3) continue
        if (set.has(own)) bare.push(WHERE ? where() : own)
        else if (game.test(own) && own.split(/\s+/).length <= 5) games.push(WHERE ? where() : own)
      }
      return { bare, games }
    }, [CODES[sportOf(path)], WHERE])
    const n = res.bare.length + res.games.length
    total += n
    const ex = [...new Set([...res.games, ...res.bare])].slice(0, WHERE ? 30 : 6).join(WHERE ? '\n    ' : ', ')
    console.log(`${path} ${w}: ${res.bare.length} bare codes, ${res.games.length} "A @ B" texts${ex ? ` -- ${ex}` : ''}`)
    await p.close()
  }
}
await b.close()
console.log(`\n${total} club codes shown as text across ${PAGES.length} pages x 2 widths`)
process.exit(total && !REPORT ? 1 : 0)
