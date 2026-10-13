#!/usr/bin/env node
// THE TWO-MAN DUAL CARD'S TEXT SIZING (2026-10-12, "you see how bad the card is text sizing wise"). TEST fixtures only (scripts/proto-cards/dualStressFixtures.mjs:
// 12 variants: long names, long card names, long prices, long strips, long club names, no data, big serial, everything at once).
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/check-dual-sizing.mjs
// For every variant:
//   FIT      a name / title is one line at a fixed step, else two lines at a fixed step, never an ellipsis for a name that can split; every size >= the 22px floor
//   BOX      lines x size x line-height fit the fixed box (so both legs' baselines line up and nothing overlaps)
//   RENDER   the card draws at 1080x1350 and no text node is under the 22px floor
//   PIXELS   the rendered name zone: the ink never touches the zone's clip edge, and never runs wider than the estimate (so the estimate is conservative);
//            the gutter between the two legs and the card's side margins stay empty below the portraits
import { stressSet } from './proto-cards/dualStressFixtures.mjs'
import { renderDual, dualDesign, fitName, fitTitle, widthOf, clampWords, DUAL_LAYOUT, LINE_H } from '../lib/cards/dualCard.js'
import { lintType, MIN_TYPE } from '../lib/cards/cardKit.js'

let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const L = DUAL_LAYOUT
const sharp = (await import('sharp')).default

// ── the pure fit ──
for (const [name, want] of [['Michael Brandsegg-Nygard', 2], ['Jean-Gabriel Pageau', 0], ['Moritz Seider', 1], ['Alexandre Carrier-Vanderbilt Smith', 2], ['Test Skater One', 1]]) {
  const f = fitName(name)
  check((want ? f.lines.length === want : f.lines.length <= 2) && f.size >= 40 && !f.lines.some((l) => l.endsWith('…')) && f.lines.every((l) => widthOf(l, f.size) <= L.NAME_MAXW), `fit: ${name} -> ${f.lines.length} line(s) at ${f.size}px, whole, inside ${L.NAME_MAXW}px`)
}
{
  const t = fitTitle('FRIDAY NIGHT SPECIAL HEATERS', 580)
  const t2 = fitTitle("ADMIN'S TWO-MAN", 580)
  const t3 = fitTitle('LATE · FRIDAY NIGHT SPECIAL HEATERS', 940)
  check(t.lines.length <= 2 && t.size >= 38 && t.lines.every((l) => widthOf(l, t.size) <= 580 && !l.endsWith('…')), `fit: a 28-character card name beside the serial -> ${t.lines.length} line(s) at ${t.size}px`)
  check(t2.lines.length === 1 && t2.size >= 54, `fit: the default title stays big (${t2.size}px)`)
  check(t3.lines.length <= 2 && t3.lines.every((l) => widthOf(l, t3.size) <= 940), `fit: LATE + a 28-character name without a serial -> ${t3.lines.length} line(s) at ${t3.size}px`)
}
check(clampWords('word '.repeat(80), 84).length <= 84 && clampWords('word '.repeat(80), 84).endsWith('…'), 'strip: a long strip is cut on a word with an ellipsis')

// ── every variant ──
const lum = (b, i) => 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2]
async function inkIn(png, x0, y0, x1, y1) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
  let maxX = -1; let maxL = 0
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) { const l = lum(data, (y * info.width + x) * info.channels); if (l > maxL) maxL = l; if (l > 170 && x > maxX) maxX = x }
  return { maxX, maxL }
}
const FRAME_TOP = 26 + 3 + 84            // the header's bottom edge
const ZONE_Y = FRAME_TOP + L.WIN_H + 6   // the name zone's top (leg A)
const A_X = 26 + 3 + 28 + 6              // leg A's inner left (frame + border + padding + the leg's own padding)
const B_X = A_X + L.WIN_W + 32 - 0       // leg B's inner left
for (const v of stressSet()) {
  const d = v.d
  const [a, b] = d.legs
  const tag = `${v.id}`
  for (const [k, leg] of [['A', a], ['B', b]]) {
    const f = fitName(leg.m.name)
    check(f.size >= MIN_TYPE && f.lines.length <= 2 && f.lines.length * f.size * LINE_H <= L.NAME_H && f.lines.every((l) => widthOf(l, f.size) <= L.NAME_MAXW), `${tag}: leg ${k}'s name fits its box (${f.lines.length} line(s), ${f.size}px, ${Math.round(f.lines.length * f.size * LINE_H)}px of ${L.NAME_H})`)
  }
  const tf = fitTitle(d.label, d.serial ? 580 : 940)
  check(tf.size >= MIN_TYPE && tf.lines.length <= 2 && tf.lines.length * tf.size * LINE_H <= L.TITLE_H && tf.lines.every((l) => widthOf(l, tf.size) <= (d.serial ? 580 : 940)), `${tag}: the title fits its box (${tf.lines.length} line(s), ${tf.size}px)`)
  check(lintType(dualDesign(d, null, '')).length === 0, `${tag}: no text under the ${MIN_TYPE}px floor`)
  let png = null
  try { png = await renderDual(d, { width: 1080 }) } catch (e) { check(false, `${tag}: renders (${e.message})`); continue }
  const meta = await sharp(png).metadata()
  check(meta.width === 1080 && meta.height === 1350, `${tag}: renders 1080x1350`)
  // the ink of each name zone stays off its clip edge and inside the estimate
  for (const [k, leg, x0, dy] of [['A', a, A_X, 0], ['B', b, B_X, L.SHIFT]]) {
    const f = fitName(leg.m.name)
    const { maxX } = await inkIn(png, x0, ZONE_Y + dy, x0 + L.NAME_MAXW + 12, ZONE_Y + dy + L.NAME_H)
    const used = maxX < 0 ? 0 : maxX - x0
    check(used <= widthOf(f.lines.reduce((x, y) => (y.length > x.length ? y : x), ''), f.size) && used <= L.NAME_MAXW, `${tag}: leg ${k}'s name ink is ${used}px wide: inside the estimate (${Math.max(...f.lines.map((l) => widthOf(l, f.size)))}px) and the ${L.NAME_MAXW}px box`)
  }
  // the gutter between the legs, below the portraits, and both side margins stay empty (no text ran across)
  const gut = await inkIn(png, A_X + L.WIN_W + 6, ZONE_Y + L.SHIFT + 6, B_X - 6, ZONE_Y + L.SHIFT + L.NAME_H + L.MATCH_H + L.PRICE_H)      // below leg B's portrait too
  const left = await inkIn(png, 29, ZONE_Y, 56, ZONE_Y + 280)
  const right = await inkIn(png, 1026, ZONE_Y + L.SHIFT, 1051, ZONE_Y + L.SHIFT + 240)
  check(gut.maxL < 130 && left.maxL < 130 && right.maxL < 130, `${tag}: the gutter and the side margins are empty (brightest ${Math.round(gut.maxL)}/${Math.round(left.maxL)}/${Math.round(right.maxL)})`)
}

console.log(failed ? `\n${failed} FAILED` : '\nOK: the dual card sizing (12 stress variants)')
process.exit(failed ? 1 : 0)
