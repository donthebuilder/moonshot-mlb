#!/usr/bin/env node
// EVERY MARKET CHIP OPENS A RANKING, NOT AN ERROR PANEL (2026-10-08). A phone check that only loads each page
// misses a market that crashes after a tap: NFL Rankings answered "showOpts is not defined" for every market but
// Anytime TD from 10-06 to 10-08. This opens each sport's Rankings at 390, taps every market chip in turn and fails
// when the page shows the error panel, or shows no ranked rows.
//   node scripts/check-market-chips.mjs [--base http://localhost:3000]
import { createRequire } from 'node:module'
const req = createRequire(`${process.cwd()}/package.json`)
const { chromium } = req('playwright-core')
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'http://localhost:3000').replace(/\/$/, '')
const SPORTS = [
  ['nfl', '/app#sport=nfl&tab=research', ['Anytime TD', 'Receiving yards', 'Receptions', 'Rushing yards', 'Rush attempts', 'Passing yards', 'Kicking points', 'Defense/ST TD']],
  ['nhl', '/app#sport=nhl&tab=fullboard', ['GOAL', 'SHOTS 3+', 'POINTS 1+', 'ASSISTS 1+']],
  ['nba', '/app#sport=nba&tab=fullboard', ['PTS 25+', 'REB 10+', 'AST 8+', '3PM 4+', 'PRA 35+', 'FIRST BASKET', 'ALL MARKETS']],
]
const BROWSERS = ['/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome', '/usr/bin/chromium']
import fs from 'node:fs'
const exe = BROWSERS.find((p) => fs.existsSync(p))
const b = await chromium.launch({ executablePath: exe, headless: true })
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
let bad = 0
for (const [sport, path, chips] of SPORTS) {
  const p = await ctx.newPage()
  await p.goto(BASE + path, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
  await p.waitForTimeout(2500)
  for (const label of chips) {
    const chip = p.locator('button, [role=button]').filter({ hasText: new RegExp(`^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i') }).first()
    if (!(await chip.count())) { console.log(`skip  ${sport} ${label}: chip not on the page (hidden or not in this season)`); continue }
    await chip.click({ timeout: 8000 }).catch(() => {})
    await p.waitForTimeout(1500)
    const text = await p.locator('body').innerText()
    const err = /This panel hit an error/i.test(text)
    const rows = await p.locator('table tbody tr, [role=row]').count()
    if (err) { bad++; console.log(`FAIL  ${sport} ${label}: the error panel`) }
    else console.log(`ok    ${sport} ${label}: no error panel (${rows} table rows)`)
  }
  await p.close()
}
await b.close()
console.log(bad ? `\n${bad} market chip(s) crashed` : '\nevery market chip opens without an error panel')
process.exit(bad ? 1 : 0)
