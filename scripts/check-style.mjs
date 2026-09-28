#!/usr/bin/env node
// CHECK-STYLE (2026-09-28, MLB-PARITY-BOARDS plan D.3).
//
// Donovan: "style wise why are things looking different". Part of the answer
// was that every new component picked its own colours: TD WATCH got round
// pills in a sans font while B2B WATCH had rectangles in mono, LAMP's table
// got its own red heat. check-scales.mjs counts hex literals across the whole
// repo against a ratchet; this is the per-change guard the plan asks for --
// it reads ONLY the lines a branch adds and fails on:
//   · a raw hex colour (#abc / #aabbcc / #aabbccdd) in a .js file, and
//   · a font-family literal ("fontFamily: 'Inter'", "font: '700 11px Arial'")
// outside the registries. Use the product's theme token (C.*, NUM_FONT) or
// lib/design/tokens.js instead. The registries are check-scales.mjs's own
// EXEMPT list, read from that file so the two checks can never disagree.
//
//   node scripts/check-style.mjs              # against origin/main
//   node scripts/check-style.mjs --base HEAD~3
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d }
const BASE = arg('--base', 'origin/main')

const scalesSrc = readFileSync(join(ROOT, 'scripts/check-scales.mjs'), 'utf8')
const block = scalesSrc.slice(scalesSrc.indexOf('const EXEMPT = new Set(['), scalesSrc.indexOf('])', scalesSrc.indexOf('const EXEMPT = new Set([')))
const EXEMPT = new Set([...block.matchAll(/^\s*'([^']+)'/gm)].map((m) => m[1]))
EXEMPT.add('lib/design/tokens.js')

const diff = execFileSync('git', ['diff', '--unified=0', '--no-color', BASE, '--', '*.js', '*.jsx', '*.mjs'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })

const HEX = /#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b/g
// A font literal names a face. NUM_FONT / var(--…) / 'inherit' are fine.
const FONT = /(?:fontFamily\s*:\s*['"`](?!inherit|var\()[^'"`]*['"`]|font\s*:\s*['"`][^'"`$]*\d+px(?:\/[\d.]+)?\s+(?!inherit)['"]?[A-Za-z][^'"`$]*['"`])/

let file = null
let line = 0
const hits = []
for (const raw of diff.split('\n')) {
  if (raw.startsWith('+++ ')) { file = raw.slice(6); continue }
  if (raw.startsWith('@@')) { line = Number(/\+(\d+)/.exec(raw)?.[1] || 0); continue }
  if (!raw.startsWith('+') || raw.startsWith('+++')) continue
  const text = raw.slice(1)
  const at = line++
  if (!file || EXEMPT.has(file) || file.startsWith('scripts/')) continue
  const code = text.replace(/\/\/.*$/, '').trim()
  if (!code || code.startsWith('*') || code.startsWith('/*')) continue
  // URL fragments (href="#board-main") and hash routes are not colours.
  const hexes = [...code.matchAll(HEX)].filter((m) => !/(href|#sport|#tab|url\()/.test(code.slice(Math.max(0, m.index - 12), m.index)))
  for (const m of hexes) hits.push(`${file}:${at}  raw colour ${m[0]}  -> use the theme token`)
  if (FONT.test(code)) hits.push(`${file}:${at}  font literal  -> use NUM_FONT or inherit`)
}

if (hits.length) {
  console.log(`check-style: ${hits.length} new raw style literal${hits.length === 1 ? '' : 's'} vs ${BASE}\n`)
  for (const h of hits) console.log('  ERROR ' + h)
  process.exit(1)
}
console.log(`check-style: no new raw colours or fonts vs ${BASE}`)
