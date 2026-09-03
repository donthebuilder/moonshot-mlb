// ── #76 · FRANCHISE MUST NOT GO HALF-LIGHT ──────────────────────────────────
//
// FRANCHISE ignored the network's theme completely: pick Light and the whole
// site went pale while this product stayed near-black. The fix had two parts
// and only works if BOTH hold, which is what this guards.
//
// 1. NEUTRAL surfaces go through tokens, and the tokens have light values.
//    141 literal darks were consolidated into six bands to make that possible
//    (median shift 2 luma). A new literal neutral dark in a rule silently
//    reintroduces a black patch on a pale page, so it fails here.
//
// 2. TINTED surfaces — the warm glow behind a selected pill, the green behind
//    a success message — cannot go through tokens: each is a different
//    deliberate tint and collapsing them moved some by seventeen luma, which
//    is visible. They stay literal in dark mode and get an explicit
//    [data-theme='light'] counterpart. A tinted surface WITHOUT one is the
//    half-fix this whole pass exists to avoid, so it fails here too.
//
// The failure mode being prevented is specific and was measured before any of
// this shipped: redefining tokens alone would have repainted the ground and
// left dozens of dark patches sitting on a pale page — worse than the honest
// inconsistency it replaced.
import fs from 'node:fs'
import postcss from 'postcss'

const FILE = 'app/fantasy/fantasy.module.css'
const root = postcss.parse(fs.readFileSync(FILE, 'utf8'))

const rgb = (h) => {
  h = h.replace('#', '')
  if (h.length === 3) h = [...h].map((c) => c + c).join('')
  if (h.length === 8) h = h.slice(0, 6)
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}
const lum = (h) => { const [r, g, b] = rgb(h); return 0.299 * r + 0.587 * g + 0.114 * b }
const sat = (h) => { const [r, g, b] = rgb(h); return Math.max(r, g, b) - Math.min(r, g, b) }
const isLightRule = (sel) => sel.includes("data-theme='light'") || sel.includes('data-theme="light"')

const paints = (p) => p === 'background' || p.startsWith('background-') || p === 'fill'

const dark = []      // tinted surfaces painted in the default (dark) theme
const covered = new Set()
let neutralLeaks = 0
const leakLines = []

root.walkDecls((d) => {
  const prop = d.prop.toLowerCase()
  if (prop.startsWith('--')) return
  let sel = '', p = d.parent, media = ''
  while (p && p.type !== 'root') {
    if (p.type === 'atrule') media = p.name
    else if (p.selector) sel = p.selector + (sel ? ' ' + sel : '')
    p = p.parent
  }
  // The light counterparts are written in hsl(), not hex, so this MUST come
  // before the hex check below -- the first version of this script put it
  // after and therefore never saw a single light rule, reported all 54
  // surfaces as uncovered, and would have sent me rewriting a block that was
  // already correct. A checker that cannot see the fix is worse than none.
  if (isLightRule(sel)) {
    if (paints(prop)) sel.split(',').forEach((s) => covered.add(`${s.trim()}|${prop}`))
    return
  }
  // Hex AND rgb()/rgba(). The first version knew only hex and so walked past
  // ten translucent scrims -- rgba(11,11,10,.96) and friends -- which are
  // exactly the sort of thing that survives a refactor and then sits as a
  // black bar across a pale page.
  const hexes = (d.value.match(/#[0-9a-fA-F]{3,8}\b/g) || []).map((h) => h.toLowerCase())
  const rgbs = [...d.value.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/g)]
    .map((m) => [+m[1], +m[2], +m[3]])
  if (!hexes.length && !rgbs.length) return
  // (1) any neutral dark left in a rule is a leak, whatever the property
  for (const h of hexes) {
    if (lum(h) < 75 && sat(h) <= 8) { neutralLeaks++; leakLines.push(`L${d.source.start.line} ${sel.trim().slice(0,50)} { ${prop}: ${h} }`) }
  }
  // (2) tinted surfaces need a light counterpart
  if (!paints(prop) || media) return
  const rgbDark = rgbs.some(([r, g, b]) => 0.299 * r + 0.587 * g + 0.114 * b < 75)
  if (hexes.some((h) => lum(h) < 75) || rgbDark) {
    sel.split(',').forEach((s) => dark.push({ key: `:global(html[data-theme='light']) ${s.trim()}|${prop}`, sel: s.trim(), prop, line: d.source.start.line }))
  }
})

const orphans = dark.filter((d) => !covered.has(d.key))
let bad = 0
if (neutralLeaks) {
  bad++
  console.log(`MISS ${neutralLeaks} literal neutral dark(s) back in the rules — these belong in the token bands`)
  leakLines.slice(0, 6).forEach((l) => console.log(`       ${l}`))
} else {
  console.log('ok   no literal neutral darks in rules — every neutral surface goes through a token')
}
if (orphans.length) {
  bad++
  console.log(`MISS ${orphans.length} tinted surface(s) with no light-mode counterpart — they will be dark patches on a pale page`)
  orphans.slice(0, 8).forEach((o) => console.log(`       L${o.line} ${o.sel} { ${o.prop} }`))
} else {
  console.log(`ok   all ${dark.length} tinted surfaces have a light-mode counterpart`)
}

// The light token blocks themselves must exist, or none of the above matters.
const css = fs.readFileSync(FILE, 'utf8')
for (const need of ["--fx-bg: #f1f1ef", "--fx-s0: #f1f1ef"]) {
  if (!css.includes(need)) { bad++; console.log(`MISS the light palette is missing (${need})`) }
}

console.log(bad ? `\n${bad} problem(s) — FRANCHISE would go half-light` : '\nok   FRANCHISE follows the network theme')
process.exit(bad ? 1 : 0)
