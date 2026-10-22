#!/usr/bin/env node
// CHART TEXT ON A PHONE (2026-10-17, PHONE-PARITY.md items 2-4). check-mobile counts text under 12px per page; this measures the CHARTS:
// every SVG label's size ON SCREEN (its font-size x the chart's scale, since a viewBox shrinks its own text) and the HTML text inside
// each chart stage. A stage that is folded shut is opened first (the stage opens by default on a phone now; this also covers a closed one).
//
//   node scripts/check-chart-text.mjs                         local build on :3108, 390x844
//   node scripts/check-chart-text.mjs --base https://dashnetwork.vercel.app
//   node scripts/check-chart-text.mjs --all                   + 360x780, 430x932
//   node scripts/check-chart-text.mjs --pages "/app#sport=nfl&tab=games,..."
//
// ERROR: a chart label under 8px on screen (unreadable), or a chart stage that shows no picture on a phone.
// WARN : a label 8-10px on screen, or stage HTML text under 11px. CLAUDE.md "Readability": numbers >= 10px on a portrait phone.
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { MAC_CHROME, MAC_BRAVE, EXTRA_PATHS } from './_browser.mjs'

const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'http://localhost:3108')
const ALL = process.argv.includes('--all')
const PAGES = (arg('--pages', '') || '/app#sport=nfl&tab=games,/app#sport=nfl&tab=matchups,/app#sport=nhl&tab=games,/app#sport=nhl&tab=shotmap,/app#sport=mlb&tab=spray').split(',').map((s) => s.trim()).filter(Boolean)
const VIEWPORTS = ALL ? [[390, 844], [360, 780], [430, 932]] : [[390, 844]]
const req = createRequire(import.meta.url)
const { chromium } = req('playwright-core')
const exe = [MAC_CHROME, MAC_BRAVE, ...EXTRA_PATHS].find((p) => existsSync(p))

const measure = () => {
  const out = { svg: [], html: [], stages: 0, stagesShut: 0 }
  const vis = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 }
  for (const t of document.querySelectorAll('svg text')) {
    const s = (t.textContent || '').trim()
    if (!s || !vis(t)) continue
    const ctm = t.getScreenCTM()
    const px = parseFloat(getComputedStyle(t).fontSize) * (ctm ? Math.hypot(ctm.a, ctm.b) : 1)
    out.svg.push({ px: Math.round(px * 10) / 10, s: s.slice(0, 24), chart: t.closest('svg')?.getAttribute('aria-label')?.slice(0, 40) || 'svg' })
  }
  for (const st of document.querySelectorAll('section.flat-stage')) {
    out.stages += 1
    if (!st.querySelector('.fs-pic')) out.stagesShut += 1
    const w = document.createTreeWalker(st, NodeFilter.SHOW_TEXT)
    let n
    while ((n = w.nextNode())) {
      const s = n.textContent.trim()
      const el = n.parentElement
      if (!s || !el || el.closest('svg') || !vis(el)) continue
      const px = parseFloat(getComputedStyle(el).fontSize)
      if (px < 11) out.html.push({ px, s: s.slice(0, 24), stage: st.getAttribute('aria-label')?.slice(0, 40) || 'stage' })
    }
  }
  return out
}

const b = await chromium.launch({ executablePath: exe, headless: true })
let bad = 0, warn = 0
for (const [w, h] of VIEWPORTS) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
  const p = await ctx.newPage()
  for (const u of PAGES) {
    await p.goto(BASE + u, { waitUntil: 'networkidle', timeout: 60000 }).catch(() => {})
    await p.waitForTimeout(3500)
    // --no-open: touch nothing, so a stage folded shut by default shows as "shut" (ERROR)
    if (!process.argv.includes('--no-open')) for (const btn of await p.locator('section.flat-stage button[aria-expanded="false"]').all()) { await btn.click().catch(() => {}); await p.waitForTimeout(400) }
    await p.waitForTimeout(800)
    const m = await p.evaluate(measure)
    const lows = m.svg.filter((x) => x.px < 8), mids = m.svg.filter((x) => x.px >= 8 && x.px < 10)
    const min = m.svg.length ? m.svg.reduce((a, x) => (x.px < a.px ? x : a)) : null
    const tag = lows.length || m.stagesShut ? 'ERROR' : mids.length || m.html.length ? 'WARN ' : 'ok   '
    if (tag === 'ERROR') bad += 1; else if (tag === 'WARN ') warn += 1
    console.log(`${tag} ${w}x${h} ${u}: ${m.svg.length} chart labels, smallest ${min ? `${min.px}px "${min.s}" (${min.chart})` : 'none'}; <8px ${lows.length}, 8-10px ${mids.length}; stage text <11px ${m.html.length}; stages ${m.stages}, shut ${m.stagesShut}`)
    for (const x of lows.slice(0, 3)) console.log(`      under 8px: ${x.px}px "${x.s}" in ${x.chart}`)
    for (const x of m.html.slice(0, 3)) console.log(`      stage text: ${x.px}px "${x.s}" in ${x.stage}`)
  }
  await ctx.close()
}
await b.close()
console.log(`\n${bad} ERROR, ${warn} WARN`)
process.exit(bad ? 1 : 0)
