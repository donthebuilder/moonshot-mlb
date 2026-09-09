#!/usr/bin/env node
/**
 * check-themes.mjs — no palette may quietly undo the readability pass.
 *
 * text2/text3 were stepped up on 2026-08-08 because text2 sat ~7:1 on the
 * darkest cards and text3 ran ~4.2:1 at 9px. A new chrome palette is exactly
 * the kind of change that silently regresses that, so it's asserted rather
 * than trusted: every text tier must clear 4.5:1 on the DARKEST surface it
 * can land on, which is bg3.
 */
import { THEMES } from '../lib/themes.js'

const hex = (h) => {
  const s = h.replace('#', '')
  const n = parseInt(s.length === 3 ? s.split('').map((c) => c + c).join('') : s, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}
const lum = (h) => {
  const [r, g, b] = hex(h).map((v) => {
    const c = v / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a, b) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

const MIN = 4.5
let bad = 0
for (const [key, t] of Object.entries(THEMES)) {
  const { C } = t
  const checks = [
    ['text  on bg3', C.text, C.bg3],
    ['text2 on bg3', C.text2, C.bg3],
    ['text3 on bg3', C.text3, C.bg3],
    ['text3 on bg2', C.text3, C.bg2],
    ['accent on bg2', t.accent, C.bg2],
  ]
  console.log(`\n${key.padEnd(6)} ${t.label}`)
  for (const [name, fg, bgc] of checks) {
    const r = ratio(fg, bgc)
    const ok = r >= MIN
    if (!ok) bad++
    console.log(`   ${ok ? 'ok  ' : 'FAIL'} ${name.padEnd(14)} ${r.toFixed(2)}:1`)
  }
}
console.log(bad ? `\n${bad} failing pair(s)` : '\nall themes clear 4.5:1')
process.exit(bad ? 1 : 0)
