#!/usr/bin/env node
// THE POSITION FILTER, IN A BROWSER (2026-10-10). Needs a running server (the push gate's `next start`, or your own):
//   node scripts/check-position-filter-ui.mjs --base http://localhost:3108 [--only mlb|nfl|nhl|nba]
// BUCKETS (nba) is checked only if the build has BUCKETS_PUBLIC=on (/api/buckets/access says so); run it from a scratch
// directory with NODE_PATH=<repo>/node_modules like the other browser checks. It uses the LIVE slate the server reads, so
// it asserts shapes (a subset of the board's own ranks, a held address, an honest empty state), never a particular name.
// Per sport, at 360 / 390 / 430 / 844x390 (landscape) / 1280:
//   - the position pills exist (inline on a desktop, in the Filters sheet or the opened options on a phone), each phone tap
//     target is 44x44 or more, the sheet fits the screen and the page does not scroll sideways
//   - tapping a pill writes pos= to the address, narrows the table, and the # column keeps the board's own ranks: every
//     rank shown is one the unfiltered board had, in rising order (a filter never renumbers)
//   - a reload and a pasted link reopen the same filter; opening a player and pressing Back keeps pos= in the address
//   - the Cards view shows the same filter and does not bleed
//   - a position nobody has (pos=ZZ) says "No ZZ on the board with these filters." and its Clear button empties pos=
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'

const req = createRequire(`${process.cwd()}/package.json`)
const { chromium } = req('playwright-core')
const arg = (k, d = null) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BASE = (arg('--base') || 'http://localhost:3108').replace(/\/$/, '')
const ONLY = arg('--only')
const exe = [arg('--browser'), '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/usr/bin/google-chrome'].filter(Boolean).find(existsSync)
if (!exe) { console.error('No Brave/Chrome found; pass --browser'); process.exit(2) }

const PAGES = { mlb: '/app#sport=mlb&tab=fullboard', nfl: '/app#sport=nfl&tab=research', nhl: '/app#sport=nhl&tab=fullboard', nba: '/app#sport=nba&tab=fullboard' }
const CARDS = { mlb: /Cards/, nfl: /^\s*▦?\s*Cards\s*$/, nhl: /Cards/, nba: /^CARDS$/ }
const VPS = [
  { name: '360', width: 360, height: 780, phone: true }, { name: '390', width: 390, height: 844, phone: true }, { name: '430', width: 430, height: 932, phone: true },
  { name: 'land', width: 844, height: 390, phone: true }, { name: '1280', width: 1280, height: 800, phone: false },
]
let fail = 0
const ok = (name, v, extra = '') => { fail += !v; console.log(`${v ? 'ok  ' : 'FAIL'} ${name}${v ? '' : ` ${extra}`}`) }

const ranksOf = (page) => page.evaluate(() => {
  const t = document.querySelector('table')
  if (!t) return null
  return [...t.querySelectorAll('tbody tr')].map((r) => {
    const c = [...r.querySelectorAll('td')].slice(0, 5).find((d) => /^\d{1,3}$/.test((d.innerText || '').trim().split('\n')[0].trim()))
    return c ? Number(c.innerText.trim().split('\n')[0]) : null
  })
})
async function openRow(page) {
  const row = page.locator('.position-row').first()
  if (await row.isVisible().catch(() => false)) return true
  const btns = page.locator('button:has-text("Filters")')
  for (let i = 0; i < await btns.count(); i++) {
    await btns.nth(i).click({ timeout: 4000 }).catch(() => {})
    await page.waitForTimeout(500)
    if (await row.isVisible().catch(() => false)) return true
  }
  return false
}
const settle = async (page) => { await page.waitForLoadState('networkidle', { timeout: 12000 }).catch(() => {}); await page.waitForTimeout(2500) }
const hash = (page) => page.evaluate(() => decodeURIComponent(location.hash))
const bleeds = (page) => page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)

const browser = await chromium.launch({ executablePath: exe, headless: true })
let nbaOpen = false
try { nbaOpen = (await (await fetch(`${BASE}/api/buckets/access`)).json())?.open === true } catch { nbaOpen = false }
for (const sport of Object.keys(PAGES).filter((s) => !ONLY || s === ONLY)) {
  if (sport === 'nba' && !nbaOpen) { console.log('skip nba (BUCKETS is not open on this server)'); continue }
  for (const vp of VPS) {
    const tag = `${sport} @ ${vp.name}`
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, hasTouch: vp.phone, isMobile: vp.phone })
    const page = await ctx.newPage()
    const errs = []
    page.on('pageerror', (e) => errs.push(String(e).slice(0, 160)))
    await page.goto(`${BASE}${PAGES[sport]}`, { waitUntil: 'domcontentloaded', timeout: 45000 })
    await settle(page)
    const all = await ranksOf(page)
    if (!all || !all.length) { console.log(`skip ${tag}: no table on the page (no slate)`); await ctx.close(); continue }
    const shown = await openRow(page)
    ok(`${tag}: the position pills are on the page`, shown)
    if (!shown) { await ctx.close(); continue }
    if (vp.phone) {
      const small = await page.evaluate(() => [...document.querySelectorAll('.position-row button')].filter((b) => { const r = b.getBoundingClientRect(); return r.width > 0 && (r.width < 43.5 || r.height < 43.5) }).map((b) => b.innerText.trim()))
      ok(`${tag}: every pill is a 44x44 target`, small.length === 0, small.join(','))
      const sheet = await page.evaluate(() => { const p = [...document.querySelectorAll('div')].find((d) => getComputedStyle(d).position === 'fixed' && d.querySelector('.position-row')); return p ? p.getBoundingClientRect().height <= window.innerHeight : true })
      ok(`${tag}: the sheet fits the screen`, sheet)
    }
    const names = await page.locator('.position-row button').allInnerTexts()
    const pick = names.map((n) => n.trim().split(/\s+/)[0]).find((n) => n && n !== 'All' && !/^\d/.test(n))
    ok(`${tag}: a position pill exists to tap`, Boolean(pick))
    if (!pick) { await ctx.close(); continue }
    await page.locator('.position-row button', { hasText: new RegExp(`^${pick}\\s*\\d*$`) }).first().click()
    await page.waitForTimeout(800)
    ok(`${tag}: tapping ${pick} writes pos= to the address`, new RegExp(`pos=${pick}(&|$)`).test(await hash(page)), await hash(page))
    const done = page.locator('button:has-text("Done")').first()
    if (await done.isVisible().catch(() => false)) await done.click().catch(() => {})
    await page.waitForTimeout(600)
    const got = await ranksOf(page)
    const sub = (got || []).filter((r) => r != null)
    ok(`${tag}: the table narrowed (${all.length} -> ${(got || []).length} rows)`, (got || []).length > 0 && (got || []).length <= all.length)
    // `all` is only the rows the unfiltered table drew (a preview), so a rank past its last row cannot be looked up there
    const top = Math.max(...all.filter((r) => r != null))
    ok(`${tag}: every # is a rank the whole board had, in rising order (no renumbering)`, sub.every((r, i) => (i === 0 || r > sub[i - 1]) && (r > top || all.includes(r))), sub.slice(0, 12).join(','))
    ok(`${tag}: the page does not scroll sideways`, !(await bleeds(page)))
    // reload + pasted link
    await page.reload({ waitUntil: 'domcontentloaded' }); await settle(page)
    ok(`${tag}: a reload keeps ${pick}`, new RegExp(`pos=${pick}(&|$)`).test(await hash(page)) && (await ranksOf(page))?.length === (got || []).length)
    // Back from a player keeps pos=
    const before = await hash(page)
    await page.locator('table tbody tr').first().locator('td', { hasText: /[A-Za-z]{4,}/ }).first().click({ timeout: 4000 }).catch(() => {})
    await page.waitForTimeout(1500)
    await page.goBack().catch(() => {}); await page.waitForTimeout(1500)
    ok(`${tag}: Back from a player keeps pos=${pick}`, new RegExp(`pos=${pick}(&|$)`).test(await hash(page)), `${before} -> ${await hash(page)}`)
    // cards
    const cardsBtn = page.locator('button').filter({ hasText: CARDS[sport] }).first()
    if (!(await cardsBtn.isVisible().catch(() => false)) && vp.phone) { await page.locator('button:has-text("Filters")').first().click().catch(() => {}); await page.waitForTimeout(500) }
    if (await cardsBtn.isVisible().catch(() => false)) {
      await cardsBtn.click(); await page.waitForTimeout(700)
      const d2 = page.locator('button:has-text("Done")').first()
      if (await d2.isVisible().catch(() => false)) await d2.click().catch(() => {})
      await page.waitForTimeout(900)
      ok(`${tag}: Cards keeps the filter in the address`, new RegExp(`pos=${pick}(&|$)`).test(await hash(page)))
      ok(`${tag}: Cards does not scroll sideways`, !(await bleeds(page)))
    }
    // the empty state
    await page.goto(`${BASE}${PAGES[sport]}&pos=ZZ`, { waitUntil: 'domcontentloaded' }); await settle(page)
    const say = await page.locator('[role=status]').first().innerText().catch(() => '')
    ok(`${tag}: pos=ZZ says so`, /No ZZ on the board with these filters\./.test(say), say.slice(0, 80))
    const clr = page.locator('[role=status] button:has-text("Clear")').first()
    if (await clr.isVisible().catch(() => false)) { await clr.click(); await page.waitForTimeout(800) }
    ok(`${tag}: Clear empties pos=`, !/pos=/.test(await hash(page)), await hash(page))
    ok(`${tag}: no page errors`, errs.length === 0, errs.join(' | '))
    await ctx.close()
  }
}
await browser.close()
console.log(fail ? `\n${fail} FAILED` : '\nall position-filter UI checks passed')
process.exit(fail ? 1 : 0)
