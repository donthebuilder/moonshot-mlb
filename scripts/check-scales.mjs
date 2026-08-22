// check-scales.mjs — the colour SYSTEM's contract, alongside the two that
// already exist for the ramps and the themes.
//
//     node scripts/check-scales.mjs
//
// (Not `npm run` — there is no script entry for these and npm fails
// misleadingly. Same as check-palette.mjs and check-themes.mjs.)
//
// ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
//
// check-palette.mjs is excellent and it checks four ramps. check-themes.mjs is
// excellent and it checks five token sets. Between them they see about ninety
// colours. The 2026-08-22 audit counted 1,161 hard-coded hex literals across
// 113 of 208 files, and NEITHER CHECKER CAN SEE ANY OF THEM. That is how
// #4ade80 came to mean eleven different things and how tabs/Games.js came to
// contradict itself about what colour HRR is, twice in one file, without
// anything going red.
//
// So this checks the things the other two structurally cannot:
//
//   1. THE LITERAL BUDGET, ratcheting. Not "no hex literals" — that would be
//      red on arrival and stay red, which is a check nobody runs. A ceiling
//      set at today's count, which may only ever come down.
//   2. THE CATEGORY REGISTRY IS SINGLE-VALUED. One concept, one colour per
//      key. This is the check that would have caught the HRR contradiction.
//   3. DIVERGING SCALES STATE THEIR ANCHOR AND CEILING. An unstated ceiling is
//      an auto-domain wearing a diverging coat.
//   4. SEQUENTIAL COLUMNS STATE A DOMAIN, or ask for `auto` out loud.
//   5. THE INK THAT SHIPS IS THE INK THAT IS ASSERTED. check-palette.mjs
//      measured contrast against '#f4f4f5' while lib/palette.js painted
//      INK_LIGHT = '#f8f8f8' — a real, small, silent gap between the tested
//      thing and the shipped thing. Fixed 2026-08-22; this keeps it fixed.
//   6. NO RAMP IS INDEXED BY A BARE CONSTANT. Ramps are deliberately different
//      lengths (Verdict needs nine so its grey middle IS the middle), so the
//      check is on the indexing rather than the length — see the note down
//      there for why the first version of this check was the wrong one.
//
// A failure here is not "this colour is wrong". It is "this colour is not
// answerable" — nobody can say what question it answers.

import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'

const ROOT = new URL('..', import.meta.url).pathname
const say = (ok, msg) => { console.log(`   ${ok ? 'ok  ' : 'FAIL'}  ${msg}`); if (!ok) failed++ }
let failed = 0

// ── walk ────────────────────────────────────────────────────────────────────
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name.startsWith('.')) continue
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) walk(p, out)
    else if (name.endsWith('.js') || name.endsWith('.jsx')) out.push(p)
  }
  return out
}

const files = [
  ...walk(join(ROOT, 'components')),
  ...walk(join(ROOT, 'lib')),
  ...walk(join(ROOT, 'app')),
]

// ── 1. the literal budget ───────────────────────────────────────────────────
//
// THE NUMBER BELOW IS A CEILING, NOT A TARGET, and it only ever goes down.
// When a pass converts a file to lib/scales.js, re-run with SCALES_REBASE=1 to
// print the new figure and paste it in. Raising it by hand is the one edit
// this file is asking you not to make.
//
// The registry files are exempt because holding the hexes is their job.
const EXEMPT = new Set([
  'lib/palette.js',        // the four heat ramps — check-palette.mjs owns these
  'lib/themes.js',         // the five token sets — check-themes.mjs owns these
  'lib/theme.js',          // the shipped C
  'lib/rampSolver.js',     // the solver, which computes hexes for a living
  'lib/hrShape.js',        // HR_BANDS: one definition, four consumers, already right
  'lib/nfl/theme.js',      // the NFL fork — its own problem, tracked separately
  'components/shareCard.js', // a PNG poster: 32 team colours, dark by construction
])

// 1161 was the audit's count on 2026-08-22. Ratcheted after each pass:
//   1161  the audit
//    875  after the colour/chart pass (five charts + the system)
//    871  after the Rundown pass
const HEX_BUDGET = 871

let hexTotal = 0
const perFile = []
for (const f of files) {
  const rel = f.slice(ROOT.length).replace(/^\/+/, '')
  if (EXEMPT.has(rel)) continue
  const src = readFileSync(f, 'utf8')
  const n = (src.match(/#[0-9a-fA-F]{6}\b/g) || []).length
  if (n) { hexTotal += n; perFile.push([rel, n]) }
}

console.log('\nliteral budget')
if (process.env.SCALES_REBASE) {
  perFile.sort((a, b) => b[1] - a[1]).slice(0, 12).forEach(([r, n]) => console.log(`   ${String(n).padStart(4)}  ${r}`))
  console.log(`\n   REBASE: set HEX_BUDGET = ${hexTotal}\n`)
}
say(hexTotal <= HEX_BUDGET,
  `${hexTotal} hard-coded hexes outside the registry (ceiling ${HEX_BUDGET}${hexTotal < HEX_BUDGET ? `, ${HEX_BUDGET - hexTotal} under` : ''})`)

// ── 2. the category registry is single-valued ───────────────────────────────
console.log('\ncategory registry')
const scalesSrc = readFileSync(join(ROOT, 'lib/scales.js'), 'utf8')
const catBlock = scalesSrc.slice(scalesSrc.indexOf('export const CAT = {'))
const catEnd = catBlock.indexOf('\n}\n')
const cat = catBlock.slice(0, catEnd)

// Every value in CAT must be a TOKEN NAME, never a hex — that is what makes
// the set follow the theme.
const catHexes = cat.match(/#[0-9a-fA-F]{6}\b/g) || []
say(catHexes.length === 0, `CAT holds token names, not hexes${catHexes.length ? ` — found ${catHexes.join(', ')}` : ''}`)

// And each concept must be single-valued per key: no key appearing twice with
// different tokens. (tabs/Games.js had ROLE_CONFIG and CAT_COLOR disagreeing
// about HRR while both lived in the same file.)
for (const concept of ['role', 'pitch', 'result']) {
  const m = cat.match(new RegExp(`${concept}:\\s*\\{([^}]*)\\}`, 's'))
  if (!m) { say(false, `CAT.${concept} is missing`); continue }
  const pairs = [...m[1].matchAll(/([A-Za-z_0-9]+)\s*:\s*'([a-z0-9]+)'/g)]
  const seen = new Map()
  let clash = null
  for (const [, k, v] of pairs) {
    if (seen.has(k) && seen.get(k) !== v) clash = `${k} is both ${seen.get(k)} and ${v}`
    seen.set(k, v)
  }
  say(!clash, `CAT.${concept}: ${pairs.length} keys, one colour each${clash ? ` — ${clash}` : ''}`)
}

// ── 3 & 4. declared scales declare their parameters ─────────────────────────
//
// ── THE FIRST VERSION OF THIS CHECK COULD NOT SEE A MULTI-LINE SPEC ─────────
//
// It matched `\{[^{}\n]*scale:\s*'div'[^{}\n]*\}` — one object literal, on one
// line. Every column spec written across two or three lines (which is most of
// the interesting ones, because they carry a `title`) was invisible to it. The
// Rundown pass declared six diverging columns and the count went from 2 to 2.
//
// A check that silently sees less than it claims to is worse than no check,
// because it reports OK. So the spec is now found by BRACE MATCHING: locate
// the marker, walk back to the object literal that owns it, walk forward to
// its close, and test that whole slice. Slower and correct.
console.log('\ndeclared scales')
let divCount = 0, divBad = []
let seqCount = 0, seqBad = []
// Comments are stripped first. An earlier version flagged the DOC COMMENT in
// components/Heatmap.js that describes the spec shape — a checker that cannot
// tell code from prose is the same failure check-palette hit when its first
// spec test matched a paragraph instead of the table.
const decomment = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** Does this spec take its zero from the rows rather than from a stated number? */
const fieldAnchored = (spec) => /\.\.\.SCORE\b/.test(spec) || /\banchor\s*:\s*DIV_FIELD\b/.test(spec)

/** The object literal enclosing `at`, or null if the braces don't balance. */
function enclosingObject(src, at) {
  let depth = 0
  let open = -1
  for (let i = at; i >= 0; i--) {
    const ch = src[i]
    if (ch === '}') depth++
    else if (ch === '{') {
      if (depth === 0) { open = i; break }
      depth--
    }
  }
  if (open < 0) return null
  depth = 0
  for (let i = open; i < src.length; i++) {
    const ch = src[i]
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return src.slice(open, i + 1)
    }
  }
  return null
}

for (const f of files) {
  const rel = f.slice(ROOT.length).replace(/^\/+/, '')
  const src = decomment(readFileSync(f, 'utf8'))
  // `...SCORE` counts as a declaration of `scale: 'div'`, because it is one —
  // lib/scales.js exports it precisely so a score's treatment lives in one
  // place. A checker that only recognised the literal would have gone blind to
  // every score column the moment the spread was introduced, which is the same
  // failure as the single-line regex above, arriving from the other direction.
  for (const m of src.matchAll(/\b(?:scale|kind):\s*'(div|seq)'|\.\.\.SCORE\b/g)) {
    const spec = enclosingObject(src, m.index)
    if (!spec) continue
    const kind = m[1] || 'div'
    const where = `${rel}: ${spec.replace(/\s+/g, ' ').slice(0, 100)}`
    if (kind === 'div') {
      divCount++
      // A FIELD-ANCHORED COLUMN STATES ITS FALLBACK INSTEAD.
      // Its anchor and ceiling are resolved from the rows on screen and cannot
      // be written down at declaration time — but what happens when they
      // CANNOT be resolved must be. `domain` is that statement: the plain
      // sequential fill the column drops to, with no arrow, when tonight's
      // field is too small or too flat to anchor honestly.
      if (fieldAnchored(spec)) {
        // `...SCORE` carries the fallback domain itself — that is the whole
        // reason it exists, and it is asserted once, below, against
        // lib/scales.js. A hand-written `anchor: DIV_FIELD` has to say it.
        if (!/\.\.\.SCORE\b/.test(spec) && !/\bdomain\s*:/.test(spec)) {
          divBad.push(`${where}   (field-anchored, no fallback domain)`)
        }
      } else if (!/\banchor\s*:/.test(spec) || !/\bceiling\s*:/.test(spec)) {
        divBad.push(where)
      }
    } else {
      seqCount++
      if (!/\bdomain\s*:/.test(spec)) seqBad.push(where)
    }
  }
}
// THE SPREAD ITSELF, ASSERTED ONCE. Every `...SCORE` column above is trusted
// to carry a diverging scale, a field anchor and a fallback domain because
// this is true; if someone edits it out, one line fails here instead of
// eighteen columns going quietly unchecked.
const scoreSpec = (readFileSync(join(ROOT, 'lib/scales.js'), 'utf8')
  .match(/export const SCORE\s*=\s*(\{[^}]*\})/) || [])[1] || ''
say(/scale:\s*'div'/.test(scoreSpec) && /anchor:\s*DIV_FIELD/.test(scoreSpec) && /domain:\s*\[/.test(scoreSpec),
  `SCORE is a diverging, field-anchored scale with a stated fallback domain — ${scoreSpec.replace(/\s+/g, ' ') || 'NOT FOUND'}`)

say(divBad.length === 0,
  `${divCount} diverging scales, each with a stated anchor and ceiling${divBad.length ? `\n         ${divBad.join('\n         ')}` : ''}`)
say(seqBad.length === 0,
  `${seqCount} sequential columns, each with a stated domain${seqBad.length ? `\n         ${seqBad.join('\n         ')}` : ''}`)

// A diverging column should also SAY what its anchor is in words, so the
// tooltip can name it. Not fatal — a nudge with a count, because an anchor the
// reader cannot find is an anchor they cannot argue with.
let noLabel = 0
for (const f of files) {
  const src = decomment(readFileSync(f, 'utf8'))
  for (const m of src.matchAll(/\b(?:scale|kind):\s*'div'|\.\.\.SCORE\b/g)) {
    const spec = enclosingObject(src, m.index)
    // A field-anchored column names its anchor in words at RENDER time —
    // `fieldLabel` prints "tonight's field — middle 54.2 of 268" into the
    // tooltip, with the number it actually used. It cannot carry a static
    // anchorLabel and it does not need one.
    if (spec && !fieldAnchored(spec) && !/\banchorLabel\s*:/.test(spec)) noLabel++
  }
}
console.log(`   note  ${divCount - noLabel} of ${divCount} diverging scales name their anchor in words`)

// ── 5. the ink that ships is the ink that is asserted ───────────────────────
console.log('\nink')
const paletteSrc = readFileSync(join(ROOT, 'lib/palette.js'), 'utf8')
const shipped = (paletteSrc.match(/export const INK_LIGHT\s*=\s*'(#[0-9a-fA-F]{6})'/) || [])[1]
const checkSrc = readFileSync(join(ROOT, 'scripts/check-palette.mjs'), 'utf8')
const asserted = (checkSrc.match(/const\s+L\s*=\s*'(#[0-9a-fA-F]{6})'/) || [])[1]
say(!!shipped && !!asserted && shipped.toLowerCase() === asserted.toLowerCase(),
  `INK_LIGHT ships ${shipped} and check-palette measures ${asserted}`)

// ── 6. no bare index into a ramp ────────────────────────────────────────────
//
// The FIRST version of this check asserted all four ramps were the same
// length. That was the wrong check and it is worth recording why, because the
// wrong version looked more rigorous: Verdict has nine stops ON PURPOSE — it
// needs an odd count to put its deliberately-grey middle in the middle — and
// forcing it to eight would break the one thing that ramp is for. Different
// lengths are a design decision, not a defect.
//
// The defect the audit actually found is what happens DOWNSTREAM of a length
// change: HotZoneMap's legend reads R[n-1], R[n-3], R[floor(n/2)] and R[1] off
// the live ramp, and an earlier version of that line was a hard-coded
// ORANGE_RAMP[8] that went `undefined` the day Ember dropped to eight stops.
// So the check is on the INDEXING, not on the length — a bare integer index
// into a ramp is a silent break waiting for the next palette edit.
console.log('\nramp indexing')
const rampsBlock = paletteSrc.slice(paletteSrc.indexOf('export const RAMPS = {'))
const lens = [...rampsBlock.matchAll(/^  ([a-z]+):\s*\{/gm)].map(([, id]) => {
  const seg = rampsBlock.slice(rampsBlock.indexOf(`\n  ${id}: {`))
  const stops = (seg.match(/stops:\s*\[([^\]]*)\]/) || [, ''])[1]
  return [id, (stops.match(/#[0-9a-f]{6}/g) || []).length]
})
const minLen = Math.min(...lens.map(([, n]) => n))
say(minLen >= 8, `shortest ramp is ${minLen} stops (${lens.map(([id, n]) => `${id}:${n}`).join(' ')}) — the legend picks four positions off length and needs room for four distinct ones`)

const bareIndex = []
for (const f of files) {
  const rel = f.slice(ROOT.length).replace(/^\/+/, '')
  if (rel === 'lib/palette.js') continue
  const src = decomment(readFileSync(f, 'utf8'))
  for (const m of src.matchAll(/\b(ORANGE_RAMP|RAMP_CHIPS|activeStops\(\)|activeChips\(\))\s*\[\s*(\d+)\s*\]/g)) {
    // [0] and [1] are the two ends and are stable at any length; anything
    // above that is counting from the top of an array whose top moves.
    if (Number(m[2]) > 1) bareIndex.push(`${rel}: ${m[0]}`)
  }
}
say(bareIndex.length === 0,
  `no ramp indexed by a bare constant above 1${bareIndex.length ? `\n         ${bareIndex.join('\n         ')}` : ''}`)

console.log(failed ? `\n${failed} check(s) failed\n` : '\nscales: the system holds\n')
process.exit(failed ? 1 : 0)
