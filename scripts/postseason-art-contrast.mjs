// LIVE CHECK of the action-photo art (not part of the offline gate: it needs the network). Takes REAL current postseason players (the 3 whose action photo
// is the brightest of 24 sampled, plus 3 named ones), lays the card's scrim over each real photo exactly as the card draws it, and reports the worst
// (95th-percentile brightest) pixel behind each block of type as a contrast ratio against the card's text colour. Then renders each front + back and the
// series card, timing the render (the route's limit is 12 s) and printing the PNG sizes. Writes the PNGs. Exit 1 when any ratio is under its floor.
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/postseason-art-contrast.mjs [outDir]
import { mkdirSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'
import { loadLeaguePostseason, loadPostseasonPlayer, loadSeriesEdition, mlbActionPhoto, seasonsToTry } from '../lib/cards/postseasonData.js'
import { renderPostseason, scrimAt, ART_BOX } from '../lib/cards/postseasonCard.js'
import { hitCounts } from '../lib/cards/postseason.js'
import { INK, DIM } from '../lib/cards/assets.js'

const OUT = process.argv[2] || '/Volumes/DONX/USERS/Kingdondondon/Desktop/AUDITS-TO-READ/POSTSEASON-CARDS'
mkdirSync(OUT, { recursive: true })
const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))
const lum = ([r, g, b]) => [r, g, b].map((v) => { const c = v / 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }).reduce((a, c, i) => a + c * [0.2126, 0.7152, 0.0722][i], 0)
const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
const BG = hex('#0b0b0b')
// [name, top, bottom (px in the 1022 x 1292 art), text colour, floor]: the blocks of type on the front, with the WCAG floor each needs (3 = large / bold text, 4.5 = the rest)
const BANDS = [['kicker', 0, 52, INK, 3], ['name', 491, 631, INK, 3], ['club row', 641, 701, DIM, 3], ['tiles', 716, 1041, INK, 4.5], ['latest game', 1131, 1241, INK, 4.5]]

const season = seasonsToTry()[0]
const lg = await loadLeaguePostseason(season)
const pool = [...lg.hitters].sort((a, b) => hitCounts(b.stat).plateAppearances - hitCounts(a.stat).plateAppearances).slice(0, 24)
const meanL = []
for (const p of pool) {
  const r = await fetch(mlbActionPhoto(p.id, 300)).catch(() => null)
  if (!r?.ok) continue
  const s = await sharp(Buffer.from(await r.arrayBuffer())).resize(60, 90).removeAlpha().raw().toBuffer()
  let t = 0
  for (let i = 0; i < s.length; i += 3) t += lum([s[i], s[i + 1], s[i + 2]])
  meanL.push({ id: p.id, name: p.name, mean: t / (s.length / 3) })
}
const bright = meanL.sort((a, b) => b.mean - a.mean).slice(0, 3)
const picks = [...bright.map((b) => ({ id: b.id, why: `brightest photo (mean luminance ${b.mean.toFixed(2)})` })), { id: 700250, why: 'Ben Rice' }, { id: 608070, why: 'José Ramírez' }, { id: 571970, why: 'Max Muncy' }]
let fail = 0
for (const pk of picks) {
  const t0 = Date.now()
  const r = await loadPostseasonPlayer({ id: pk.id, season })
  if (!r.ok) { console.log(pk.id, 'no card:', r.why); continue }
  const m = r.model
  if (!m.art) { console.log(m.name, 'NO ACTION PHOTO (headshot fallback drawn)'); continue }
  const raw = Buffer.from(m.art.split(',')[1], 'base64')
  const px = await sharp(raw).resize({ width: ART_BOX.w, height: ART_BOX.h, fit: 'cover' }).removeAlpha().raw().toBuffer()
  const out = []
  for (const [label, y0, y1, text, floor] of BANDS) {
    const ls = []
    for (let y = y0; y < y1; y += 2) {
      const a = scrimAt(y / ART_BOX.h)
      for (let x = 0; x < ART_BOX.w; x += 4) {
        const i = (y * ART_BOX.w + x) * 3
        ls.push(lum([0, 1, 2].map((k) => px[i + k] * (1 - a) + BG[k] * a)))
      }
    }
    ls.sort((a, b) => a - b)
    const p95 = ls[Math.floor(ls.length * 0.95)]
    const c = ratio(lum(hex(text)), p95)
    if (c < floor) fail++
    out.push(`${label} ${c.toFixed(1)}:1${c < floor ? ` FAIL(<${floor})` : ''}`)
  }
  const slug = String(m.name).toLowerCase().replace(/[^a-z0-9]+/g, '-')
  const front = await renderPostseason(m, { side: 'front' })
  const back = await renderPostseason(m, { side: 'back' })
  writeFileSync(`${OUT}/art-${slug}-front.png`, front)
  writeFileSync(`${OUT}/art-${slug}-back.png`, back)
  console.log(`${m.name} (${pk.why}): ${out.join(' | ')} | front ${(front.length / 1e6).toFixed(2)} MB, back ${(back.length / 1e6).toFixed(2)} MB, load + 2 renders ${((Date.now() - t0) / 1000).toFixed(1)} s`)
}
const t1 = Date.now()
const sr = await loadSeriesEdition({ code: 'LAD', season })
if (sr.ok) { const png = await renderPostseason(sr.model); writeFileSync(`${OUT}/art-series-lad.png`, png); console.log(`series LAD: ${(png.length / 1e6).toFixed(2)} MB, ${((Date.now() - t1) / 1000).toFixed(1)} s, rows with a photo: ${[...sr.model.hitters, ...sr.model.pitchers].filter((p) => p.face).length}/${sr.model.hitters.length + sr.model.pitchers.length}`) }
console.log(fail ? `${fail} contrast band(s) under the floor` : 'every band clears its floor on every sampled photo')
process.exit(fail ? 1 : 0)
