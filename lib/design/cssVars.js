// THE CHASSIS AS CSS VARIABLES (2026-10-03, COMPONENT-REUSE R10 step 1).
// FRANCHISE is plain CSS (fantasy.module.css), so it can't import CHASSIS the
// way the JS products do. This prints the same values -- read from
// lib/themes.js, never typed again -- as --dx-* custom properties: the dark
// chassis on :root, the shared light palette under html[data-theme='light'].
// app/fantasy/layout.js renders it once; theme-tokens.css points FRANCHISE's
// --fx-* neutrals at these, so its greys are the network's greys.
import { THEMES } from '../themes'

const KEYS = { bg: 'bg', bg2: 'bg2', bg3: 'bg3', border: 'border', border2: 'border2', text: 'text', text2: 'text2', text3: 'text3', green: 'green', cyan: 'cyan', purple: 'purple', red: 'red', scrim: 'scrim' }
const block = (C) => Object.entries(KEYS).map(([v, k]) => `--dx-${v}:${C[k]};`).join('')

export function chassisCss() {
  return `:root{${block(THEMES.ember.C)}}html[data-theme='light']{${block(THEMES.light.C)}}`
}
