#!/usr/bin/env node
// HIS N-MAN CARD'S TEXT SIZING AND LAYOUT (2026-10-12). TEST fixtures only (scripts/proto-cards/nManStressFixtures.mjs: 17 variants, 2..6 legs, long names / clubs / prices /
// card names, nothing priced, partly priced, graded: cashed, missed, void).
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/check-nman-card.mjs [--out <dir>]     (--out writes the 1080 x 1350 PNGs there)
// For every variant:
//   FIT      the title, every name, every price pill and the plate's lines are MEASURED with the real fonts (lib/cards/fit.js): each fits its box, none under the 22px floor,
//            and the fit log (every fit() decision the render made) has no overflow
//   BOX      lines x size x line-height fit the fixed box (so the tiles line up and nothing overlaps)
//   RENDER   the card draws at 1080 x 1350 and no text node is under the 22px floor
//   PIXELS   the ink of each name zone stays inside its column; the strip inside each tile's right border, the gutter between the tiles, the gaps between the rows and the card's
//            side margins stay empty (no text ran across); the plates and the footer do not collide
import fs from 'node:fs'
import path from 'node:path'
import { stressSet } from './proto-cards/nManStressFixtures.mjs'
import { renderNMan, nManDesign, fitLegName, fitTitle, pillOf, fit1, gridOf, NMAN_LAYOUT as L } from '../lib/cards/nManCard.js'
import { outcomeWord as outcomeWordOf } from '../lib/cards/outcome.js'
import { lintType, MIN_TYPE, assets } from '../lib/cards/cardKit.js'
import { initMetrics, textWidth, FIT_LOG, metricsReady } from '../lib/cards/fit.js'

const outIdx = process.argv.indexOf('--out')
const OUT = outIdx > 0 ? process.argv[outIdx + 1] : null
if (OUT) fs.mkdirSync(OUT, { recursive: true })
let failed = 0
const check = (ok, what) => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${what}`); if (!ok) failed += 1 }
const sharp = (await import('sharp')).default
{ const a = await assets(); initMetrics(a.fonts) }
check(metricsReady(), 'the font metrics loaded (the fit system measures with the real fonts)')

// ── the pure fits ──
for (const [name, tier] of [['Michael Brandsegg-Nygard', 3], ['Jean-Gabriel Pageau', 3], ['Moritz Seider', 3], ['Alexandre Carrier-Vanderbilt Smith', 3], ['Test Maximilian Featherstonehaugh-Villanueva', 3], ['Test Skater One', 2], ['Alexandre Carrier-Vanderbilt Smith', 2]]) {
  const f = fitLegName(name, tier)
  const wid = Math.max(...f.lines.map((l) => textWidth(l, { family: 'Shoulders', weight: 900, size: f.size, upper: true })))
  check(f.size >= MIN_TYPE && f.lines.length <= 2 && wid <= L.COL_W && f.lines.length * f.size * 1.04 <= L.NAME_BOX[tier], `fit: ${name} (tier ${tier}) -> ${f.lines.length} line(s) at ${f.size}px, ${wid}px of ${L.COL_W}${f.cut ? ' (cut)' : ''}`)
}
{
  const t = fitTitle("ADMIN'S 6-MAN", 912 - L.SERIAL_W)
  const t2 = fitTitle('FRIDAY NIGHT SPECIAL HEATERS', 912 - L.SERIAL_W)
  const t3 = fitTitle('LATE · FRIDAY NIGHT SPECIAL HEATERS', 912)
  check(t.lines.length === 1 && t.size >= 54, `fit: the default title stays big (${t.size}px)`)
  check(t2.lines.length <= 2 && t2.size >= 30 && !t2.cut && t2.lines.length * t2.size * 1.04 <= L.TITLE_H, `fit: a 28-character card name beside the serial -> ${t2.lines.length} line(s) at ${t2.size}px`)
  check(t3.lines.length <= 2 && !t3.cut && t3.lines.length * t3.size * 1.04 <= L.TITLE_H, `fit: LATE + a 28-character name, no serial -> ${t3.lines.length} line(s) at ${t3.size}px`)
}
for (const [price, want] of [[{ best: '+160', books: 6 }, true], [{ best: '+1990', books: 12 }, true], [{ best: '+160', books: 1 }, true], [null, false], [{ best: '+160', books: 0 }, false]]) {
  const p = pillOf(price)
  check(Boolean(p) === want && (!p || p.w <= L.COL_W) && (!p || p.sizes[1] >= MIN_TYPE), `pill: ${JSON.stringify(price)} -> ${p ? `"${p.price} ${p.rest}" ${p.w}px of ${L.COL_W}` : 'no price'}`)
}
check(pillOf({ best: '+160', books: 6 }).rest === 'best · 6 books', 'pill: the usual price reads "+160 best · 6 books"')
check(gridOf(6).rows === 3 && gridOf(5).rows === 3 && gridOf(4).rows === 2 && gridOf(3).rows === 2 && gridOf(2).rows === 1, 'grid: 2 columns, rows = ceil(n / 2)')
check(gridOf(6).tileH * 3 + 2 * L.GAP <= L.GRID_H && gridOf(4).tileH * 2 + L.GAP <= L.GRID_H, 'grid: the tiles fit the fixed grid box')

// ── every variant ──
const lum = (b, i) => 0.2126 * b[i] + 0.7152 * b[i + 1] + 0.0722 * b[i + 2]
async function ink(png, x0, y0, x1, y1, thr = 170) {
  const { data, info } = await sharp(png).raw().toBuffer({ resolveWithObject: true })
  let maxX = -1; let maxL = 0; let n = 0
  for (let y = y0; y < y1; y += 1) for (let x = x0; x < x1; x += 1) { const l = lum(data, (y * info.width + x) * info.channels); if (l > maxL) maxL = l; if (l > thr) { n += 1; if (x > maxX) maxX = x } }
  return { maxX, maxL, n }
}
const GRID_TOP = 26 + L.HEADER_H + (L.TITLE_H + 28) + L.GAP        // 252
for (const v of stressSet()) {
  const d = v.d
  const tag = v.id
  const n = d.legs.length
  const g = gridOf(n)
  // FIT (pure)
  for (const [k, leg] of d.legs.entries()) {
    const f = fitLegName(leg.m.name, g.tier)
    const wid = Math.max(...f.lines.map((l) => textWidth(l, { family: 'Shoulders', weight: 900, size: f.size, upper: true })))
    if (!(f.size >= MIN_TYPE && f.lines.length <= 2 && wid <= L.COL_W && f.lines.length * f.size * 1.04 <= L.NAME_BOX[g.tier])) { check(false, `${tag}: leg ${k + 1}'s name fits its box (${f.lines.length} line(s), ${f.size}px, ${wid}px)`) }
    const p = pillOf(leg.price)
    if (p && p.w > L.COL_W) check(false, `${tag}: leg ${k + 1}'s price pill is ${p.w}px wide, over ${L.COL_W}`)
  }
  const tf = fitTitle(d.label, d.serial ? 912 - L.SERIAL_W : 912)
  check(tf.size >= MIN_TYPE && tf.lines.length <= 2 && tf.lines.length * tf.size * 1.04 <= L.TITLE_H && Math.max(...tf.lines.map((l) => textWidth(l, { family: 'Shoulders', weight: 900, size: tf.size, upper: true }))) <= (d.serial ? 912 - L.SERIAL_W : 912), `${tag}: the title fits its box (${tf.lines.length} line(s), ${tf.size}px)`)
  // RENDER
  FIT_LOG.length = 0
  check(lintType(nManDesign(d, null, '')).length === 0, `${tag}: no text under the ${MIN_TYPE}px floor`)
  let png = null
  try { png = await renderNMan(d, { width: 1080 }) } catch (e) { check(false, `${tag}: renders (${e.message})`); continue }
  if (OUT) fs.writeFileSync(path.join(OUT, `${tag}.png`), png)
  const meta = await sharp(png).metadata()
  check(meta.width === 1080 && meta.height === 1350, `${tag}: renders 1080x1350`)
  const bad = FIT_LOG.filter((e) => e.ok === false || (e.truncated && e.kind !== 'block'))
  check(bad.length === 0, `${tag}: the fit log has no overflow (${FIT_LOG.length} decisions${bad.length ? `; ${bad.map((b) => `${b.id} "${String(b.text).slice(0, 24)}"`).join(', ')}` : ''})`)
  // PIXELS
  const total = g.rows * g.tileH + (g.rows - 1) * L.GAP
  const top = GRID_TOP + Math.floor((L.GRID_H - total) / 2)
  const x0 = 26 + L.SIDE
  const tileX = (c) => x0 + c * (L.TILE_W + 16)
  const tileY = (r) => top + r * (g.tileH + L.GAP)
  let offenders = []
  for (let i = 0; i < n; i += 1) {
    const r = Math.floor(i / 2); const c = i % 2
    const x = tileX(c); const y = tileY(r)
    // the strip just inside the tile's right border: no text reached the edge
    const edge = await ink(png, x + L.TILE_W - 3 - 7, y + 6, x + L.TILE_W - 3, y + g.tileH - 6, 190)
    if (edge.n > 0) offenders.push(`tile ${i + 1} right edge`)
    // the name zone: the ink stays inside its column (+ the skew's lean)
    const colX = x + 3 + L.PAD + L.FACE_W + 14
    const nm = await ink(png, colX, y + 3, colX + L.COL_W + 24, y + 3 + L.NAME_BOX[g.tier] + 20, 170)
    if (nm.maxX >= 0 && nm.maxX - colX > L.COL_W + 12) offenders.push(`tile ${i + 1} name ${nm.maxX - colX}px > ${L.COL_W}`)
  }
  check(offenders.length === 0, `${tag}: no text runs into a tile's edge or out of its column${offenders.length ? ` (${offenders.join('; ')})` : ''}`)
  const gutter = await ink(png, x0 + L.TILE_W + 2, top, x0 + L.TILE_W + 14, top + total, 150)
  const left = await ink(png, 26 + 3, top, x0 - 2, top + total, 150)
  const right = await ink(png, x0 + 2 * L.TILE_W + 16 + 2, top, 26 + L.FRAME_W - 3, top + total, 150)
  let rowGap = { maxL: 0 }
  if (g.rows > 1) rowGap = await ink(png, x0 + 6, tileY(0) + g.tileH + 2, x0 + 2 * L.TILE_W + 10, tileY(1) - 2, 150)
  check(gutter.maxL < 150 && left.maxL < 150 && right.maxL < 150 && rowGap.maxL < 150, `${tag}: the gutter, the side margins and the gaps between rows are empty (brightest ${Math.round(gutter.maxL)}/${Math.round(left.maxL)}/${Math.round(right.maxL)}/${Math.round(rowGap.maxL)})`)
  // the plates and the footer: the combined plate's bottom edge sits above the footer's rule; the footer text stays inside the frame
  const plateBottom = 26 + L.HEADER_H + (L.TITLE_H + 28) + L.GAP + L.GRID_H + L.GAP + L.COMBO_H
  const footTop = 26 + L.FRAME_H - L.FOOT_H
  check(plateBottom <= footTop, `${tag}: the combined plate (bottom ${plateBottom}) ends at or above the footer (top ${footTop})`)
  // (the frame's rounded bottom corners show the foil ring, so the scan stays off them: text only, 56px in from each side)
  const foot = await ink(png, 26 + 30, footTop + 8, 26 + L.FRAME_W - 30, footTop + 50, 170)
  check(foot.n > 100 && foot.maxX <= 26 + L.FRAME_W - 34 + 2, `${tag}: the footer text is drawn and stays inside the frame's 34px padding (rightmost ink x=${foot.maxX})`)
  // the plate\'s right column (the combined price) stays inside the plate
  const plate = await ink(png, 26 + L.SIDE + 3, plateBottom - L.COMBO_H + 3, 26 + L.FRAME_W - L.SIDE - 3, plateBottom - 3, 170)
  check(plate.maxX < 26 + L.FRAME_W - L.SIDE - 20, `${tag}: the plate's text stays inside the plate (rightmost ink x=${plate.maxX})`)
}

// ── THE POST'S CARD (hidePrice, 2026-10-13): the card ATTACHED TO A POST carries no combined price, no per-leg price and no unit; the site route's card (no option) is unchanged ──
const textsOf = (n, out = []) => { if (n == null || n === false) return out; if (typeof n === 'string' || typeof n === 'number') { out.push(String(n)); return out } if (Array.isArray(n)) { n.forEach((c) => textsOf(c, out)); return out } if (typeof n === 'object' && n.props) { if (typeof n.type === 'function') { try { textsOf(n.type(n.props), out) } catch { textsOf(n.props.children, out) } } else textsOf(n.props.children, out) } return out }
const PRICEY = /[+\u2212-]\d{3,4}\b|\bunits?\b|combined price|best prices|multiplied|\bbest\b|not all priced|no price|stored price|\bbooks?\b/i
for (const v of stressSet().filter((x) => x.d.graded)) {
  const tag = `${v.id} [post card]`
  const plain = textsOf(nManDesign(v.d, null, '')).join(' | ')
  const hid = textsOf(nManDesign(v.d, null, '', { hidePrice: true })).join(' | ')
  check(PRICEY.test(plain), `${tag}: the site card still shows its price words (unchanged look)`)
  check(!PRICEY.test(hid), `${tag}: no price, unit or combined-price word anywhere on the post card${PRICEY.test(hid) ? ` (found: ${hid.match(PRICEY)[0]})` : ''}`)
  check(hid.includes(`${v.d.graded.landed} of ${v.d.graded.of}`) && /every leg must land/.test(hid) && new RegExp(outcomeWordOf(v.d.graded.result)).test(hid), `${tag}: the post card says the legs hit, the rule without a unit, and the ticket word`)
  check(lintType(nManDesign(v.d, null, '', { hidePrice: true })).length === 0, `${tag}: no text under the ${MIN_TYPE}px floor`)
  const png = await renderNMan(v.d, { width: 1080, hidePrice: true })
  const meta = await sharp(png).metadata()
  check(meta.width === 1080 && meta.height === 1350, `${tag}: renders 1080x1350`)
  const plateBottom = 26 + L.HEADER_H + (L.TITLE_H + 28) + L.GAP + L.GRID_H + L.GAP + L.COMBO_H
  const plate = await ink(png, 26 + L.SIDE + 3, plateBottom - L.COMBO_H + 3, 26 + L.FRAME_W - L.SIDE - 3, plateBottom - 3, 170)
  check(plate.maxX < 26 + L.FRAME_W - L.SIDE - 20, `${tag}: the plate's text stays inside the plate (rightmost ink x=${plate.maxX})`)
  if (OUT) fs.writeFileSync(path.join(OUT, `${v.id}-post.png`), png)
}

console.log(failed ? `\n${failed} FAILED` : `\nOK: the N-man card sizing (${stressSet().length} stress variants)${OUT ? `; PNGs in ${OUT}` : ''}`)
process.exit(failed ? 1 : 0)
