// POSTER FIT CHECK: renders all 12 posters (homer, @MLBHR reply, hot stretch, longshot, numerology, pairs, stat, pregame, recap, goal,
// touchdown, spotlight) from the STRESS fixture set (scripts/poster-fixtures.mjs: very long names, a long park, 4-digit prices,
// zero / NaN / undefined fields, six-digit numbers, a missing headshot) and asserts, from the fit system's own log (lib/cards/fit.js
// FIT_LOG), that
//   1. no text box overflowed its container (measured width <= the box it was given) and no row's label and value collide;
//   2. nothing ordinary was cut: an ellipsis is allowed only on text that was long to begin with (40+ characters);
//   3. every column's planned height fits the frame's body (nothing pushes the footer out), and the PNG is the poster size;
//   4. no text is under the 22px floor (cardKit's lintType);
//   5. the status words agree on a homer poster: the kicker, the banner and the score caption all name the same one;
//   6. the posted Contreras example (LAD @ MIL, HRR pick, +780) reads CALLED everywhere, keeps "MOONSHOT SCORE", puts every row on one
//      line except the park's HR factor, and shows all three hook lines;
// and, independently of the fit log, that the MEASURE ITSELF is honest: probe strings are drawn through the real renderer and their ink
// widths compared with the measure (never narrower, and no more than 6% + 3px wider).
//   node --no-warnings --import ./scripts/proto-cards/_loader.mjs scripts/check-poster-fit.mjs [--png <dir>]
import { mkdirSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'
import { FX } from './poster-fixtures.mjs'
import { probe } from './_poster-probe.mjs'
import { FIT_LOG, textWidth, initMetrics, metricsReady } from '../lib/cards/fit.js'
import { LINT, assets } from '../lib/cards/cardKit.js'
import { POSTER } from '../lib/cards/posterKit.js'

const pngDir = process.argv.includes('--png') ? process.argv[process.argv.indexOf('--png') + 1] : null
if (pngDir) mkdirSync(pngDir, { recursive: true })
let fails = 0
const bad = (msg) => { fails += 1; console.log(`  ERROR ${msg}`) }
const ok = (cond, msg) => { if (!cond) bad(msg); return cond }

// ── 0. the poster's own margins: text 48px or more from the edges of the 1200 x 675 (X's 16:9 card) ─────────────────────────
console.log('margins')
ok(POSTER.inset + 3 + POSTER.pad >= 48, `text inset ${POSTER.inset + 3 + POSTER.pad}px from the edge, under 48`)

// ── 1. the measure against real pixels ───────────────────────────────────────────────────────────────────────────────────────
console.log('measure vs the real renderer')
{
  const { fonts } = await assets()
  initMetrics(fonts)
  ok(metricsReady(), 'font metrics did not load (the fonts are fetched / read by lib/cards/assets.js)')
  const strings = ['Yoshinobu Yamamoto', 'Regular season', '18 HR · ISO .147', 'American Family Field', 'American Family Field · +6% HR', 'MOONSHOT SCORE', 'Michael Brandsegg-Nygard', 'Jean-Gabriel Pageau', 'Dominic Fike', 'Estadio Alfredo Harp Helu Mexico City', "Max Muncy (ATH): 7x same-day (3.2%) · not on tonight's slate", 'LONGSHOT +1550', 'HOME RUN · TONIGHT', '0 HR · 4 H · 0 XBH', 'TD ENTERING TODAY']
  const items = []
  for (const text of strings) for (const [size, weight, ls] of [[22, 800, 0], [24, 800, 0], [22, 400, 0], [22, 800, 2], [30, 800, 8]]) items.push({ text, size, weight, ls })
  for (const text of ['William Contreras', 'Michael Brandsegg-Nygard', 'Test Maximilian Featherstonehaugh-Villanueva', '+780', '123456']) for (const size of [96, 48, 36]) items.push({ text, size, family: 'Shoulders', weight: 900, upper: true })
  const real = await probe(items)
  let worst = 0; let under = 0
  items.forEach((it, i) => {
    const est = textWidth(it.text, { size: it.size, family: it.family || 'Inter', weight: it.weight || 800, ls: it.ls || 0, upper: it.upper })
    if (est < real[i] - 1) { under += 1; bad(`measure is NARROWER than the pixels: "${it.text}" ${it.size}px est ${est} real ${real[i]}`) }
    const over = est - real[i]
    worst = Math.max(worst, over / Math.max(1, real[i]))
    if (est > real[i] * 1.06 + 3) bad(`measure is far WIDER than the pixels: "${it.text}" ${it.size}px est ${est} real ${real[i]}`)
  })
  console.log(`  ${items.length} probes: never under (${under} under); widest over-estimate ${(worst * 100).toFixed(1)}%`)
}

// ── 2. every poster, every stress case ───────────────────────────────────────────────────────────────────────────────────────
const SEEN = new Set()
const wordOf = (t) => { const s = String(t || '').toUpperCase(); return /NOT ON THE BOARD/.test(s) ? 'off' : /ON THE BOARD/.test(s) ? 'board' : /CALLED/.test(s) ? 'called' : null }
const MAXROWS = 40
for (const [name, fn] of Object.entries(FX)) {
  SEEN.add(name.split('-')[0])
  FIT_LOG.length = 0; LINT.length = 0
  let buf
  try {
    const res = await fn()
    buf = Buffer.from(await res.arrayBuffer())
  } catch (e) { console.log(`${name}\n  ERROR render failed: ${e?.message || e}`); fails += 1; continue }
  const log = FIT_LOG.splice(0)
  const before = fails
  const meta = await sharp(buf).metadata()
  const wantH = name === 'pregame' ? 712 : POSTER.h
  ok(meta.width === 1200 && meta.height === wantH, `${meta.width}x${meta.height}, want 1200x${wantH}`)
  if (pngDir) writeFileSync(`${pngDir}/${name}.png`, buf)

  let truncs = 0
  for (const e of log) {
    if (e.kind === 'info') continue
    if (e.kind === 'v') { ok(e.used <= e.avail, `${e.id}: column needs ${e.used}px, the body has ${e.avail}px`); continue }
    ok(e.ok !== false && !(e.w > e.maxW), `${e.id}: "${String(e.text).slice(0, 50)}" is ${e.w}px in a ${e.maxW}px box (${e.size}px type)`)
    if (e.truncated) { truncs += 1; ok(String(e.text).length >= 40, `${e.id}: "${String(e.text).slice(0, 50)}" was cut with an ellipsis though it is only ${String(e.text).length} characters`) }
  }
  for (const x of LINT) bad(`type floor: ${x.size}px "${x.text}" (${x.card})`)
  ok(log.length < MAXROWS * 20, 'fit log runaway')

  // status words on a homer poster agree: kicker (head), banner and the score caption
  if (name.startsWith('homer') || name === 'contreras') {
    const head = log.find((e) => e.id === 'head')
    const banner = log.find((e) => e.id === 'banner')
    const cap = log.find((e) => e.id === 'plate-caption')
    const k = wordOf(head?.text); const b = wordOf(banner?.text); const c = wordOf(cap?.text)
    ok(k && b && (k === b), `kicker says ${k}, banner says ${b}`)
    if (cap && c) ok(c === k, `kicker says ${k}, score caption says ${c}`)
    if (k === 'called') ok(!/ON THE BOARD/i.test(`${banner?.text} ${cap?.text}`), 'a CALLED poster says ON THE BOARD')
  }
  if (name === 'contreras') {
    const rows = [...new Map(log.filter((e) => String(e.id).startsWith('row:')).map((e) => [e.id, e])).values()]
    ok(/^CALLED/.test(log.find((e) => e.id === 'banner')?.text || ''), 'Contreras banner does not start with CALLED')
    ok(log.find((e) => e.id === 'plate-word')?.text === 'MOONSHOT SCORE', `Contreras plate word is "${log.find((e) => e.id === 'plate-word')?.text}", want MOONSHOT SCORE`)
    for (const r of rows) ok(r.mode !== 'stack' && !r.truncated, `Contreras row "${r.text}" is ${r.mode}`)
    ok(rows.filter((r) => r.mode === 'split').length <= 1, 'Contreras: more than the park row wrapped')
    ok(log.find((e) => e.id === 'hooks-shown')?.shown === 3, `Contreras shows ${log.find((e) => e.id === 'hooks-shown')?.shown} of 3 hooks`)
    ok(log.find((e) => e.id === 'name')?.size === 96, 'Contreras name stepped down from 96')
  }
  console.log(`${name}${fails === before ? '' : '  <-- FAILED'}  (${log.filter((e) => e.kind !== 'info').length} boxes${truncs ? `, ${truncs} cut` : ''})`)
}

for (const k of ['contreras', 'homer', 'mlbhr', 'hotstretch', 'longshot', 'numerology', 'pairs', 'stat', 'pregame', 'recap', 'goal', 'td', 'spotlight']) ok(SEEN.has(k), `no stress fixture for the ${k} poster`)

console.log(fails ? `\nFAILED: ${fails} problem(s)` : `\nOK: ${Object.keys(FX).length} stress renders, 12 posters + the Contreras example, no overflow`)
process.exit(fails ? 1 : 0)
