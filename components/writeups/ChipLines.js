'use client'
// THE WRITE-UP'S LINES AS CHIPS (2026-10-17, Donovan: the Call "could be better ... use chips ... comprehension is also
// visuals"). A write-up line is { t, src, v }: one sentence the posts also carry. This draws the same sentence as a chip:
// the number first, then what it counts, then the rank tag ("top 1%") -- and it never rewrites the sentence: a line that
// does not read "<number> <what> (top N% ...)" is drawn whole, as a chip of its own words. The colour is the sport's own heat:
// a standout (top 3%) glows in the product's accent, a good one is half that, the rest are plain. No red, no green.
// A watch-out is amber (warning), never a heat.
import { alpha } from '../../lib/scales'
import { C as BASE } from '../../lib/theme'   // the shared warning amber: LAMP's own C.yellow is a grey on purpose

// "3.7 shots a game (top 1% of tonight's skaters)" -> { value: '3.7', label: 'shots a game', tag: 'top 1%' }
const LINE = /^(-?\d[\d.,:]*%?)\s+(.+?)(?:\s*\((top \d+%)[^)]*\))?\.?$/

export function chipOf(t) {
  const s = String(t ?? '').trim()
  const m = LINE.exec(s)
  if (!m || m[2].length > 44) return { text: s, tag: null }
  return { value: m[1], label: m[2].replace(/[,;]$/, ''), tag: m[3] || null, text: s }
}

/** 0 plain, 1 good, 2 standout, from "top N%" (a smaller N is a better standing). */
export function heatOf(tag) {
  const n = tag ? Number(/\d+/.exec(tag)?.[0]) : null
  return n == null ? 0 : n <= 3 ? 2 : n <= 10 ? 1 : 0
}

export function Chip({ theme, value = null, label = null, tag = null, text = null, tone = 'plain', heat = 0, title = undefined }) {
  const { C, NUM_FONT, TYPE, accent } = theme
  const warn = tone === 'warn'
  const edge = warn ? alpha(BASE.yellow, 0.55) : heat === 2 ? accent : heat === 1 ? alpha(accent, 0.5) : C.border
  const wash = warn ? alpha(BASE.yellow, 0.1) : heat === 2 ? alpha(accent, 0.2) : heat === 1 ? alpha(accent, 0.1) : 'transparent'
  return (
    <span title={title} style={{
      display: 'inline-flex', alignItems: 'baseline', gap: 5, maxWidth: '100%', padding: '5px 10px', borderRadius: value != null || String(label ?? text ?? '').length < 22 ? 999 : 14,
      border: `1px solid ${edge}`, background: wash, color: warn ? BASE.yellow : C.text2,
      font: `700 ${Math.max(TYPE.micro, 12)}px/1.25 ${NUM_FONT}`, boxSizing: 'border-box',
    }}>
      {value != null && <b style={{ color: C.text, fontWeight: 900 }}>{value}</b>}
      <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{label ?? text}</span>
      {tag && <span style={{ color: heat ? accent : C.text3, fontWeight: 900 }}>{tag}</span>}
    </span>
  )
}

/** a write-up line (or a watch-out) as one chip */
export function LineChip({ theme, line, warn = false }) {
  const c = chipOf(line.t)
  return <Chip theme={theme} title={line.src} tone={warn ? 'warn' : 'plain'} heat={warn ? 0 : heatOf(c.tag)} {...c} />
}

export function ChipRow({ theme, lines, warn = false, style = null }) {
  if (!lines?.length) return null
  return <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, margin: '6px 0 0', ...style }}>{lines.map((l, i) => <LineChip key={`${i}-${l.t}`} theme={theme} line={l} warn={warn} />)}</div>
}
