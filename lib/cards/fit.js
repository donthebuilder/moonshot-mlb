// THE FIT SYSTEM (server only; no JSX, so plain node can load it). A synchronous TEXT MEASURE and the few fitting rules every poster uses.
//
// WHY. satori (next/og) lays text out but never tells the caller how wide it came out, so a value crowded its label, a park name ran off
// the box and a column quietly pushed the footer out of the frame (the Contreras homer poster, 2026-10-12). The posters now MEASURE
// before they draw: the real font files the poster is rendered with (Inter 400 / 800, Big Shoulders 900) are read once, their glyph
// advances are looked up, and every text box gets a width it is known to fit.
//
// THE RULES (one place, so a poster cannot invent its own):
//   fitLine   step a single line down through fixed sizes (never below the floor); first size that fits wins.
//   wrapText  greedy word wrap into at most N lines; a line that still does not fit is cut with an ellipsis (the poster keeps the
//             full text elsewhere: the tweet, the page).
//   ellipsize one line, cut at the last whole character that leaves room for the ellipsis.
//   Labels are never cut: the value column gets what the label leaves (see posterKit's KVTable), and a value that cannot fit beside
//   its label stacks under it.
//
// HOW IT IS CHECKED. scripts/check-poster-fit.mjs renders each poster from a STRESS fixture set, reads FIT_LOG (every fit() decision:
// the text, the size, the measured width, the box) and asserts nothing overflowed; it also renders probe strings through the real
// renderer and compares the measure to the pixels (the measure's own error, reported), so a font change cannot silently skew it.
//
// Letter-spacing is added per character (satori does the same). Kerning is not applied (Inter's pair kerning is under 1%); KERN_PAD
// keeps a small allowance so a measured fit is a true fit.

import { inflateSync } from 'node:zlib'

export const KERN_PAD = 1.012
/** The floor for body type at the poster's 1200 x 675 (cardKit's 22px, same as the player card at its own size). */
export const FLOOR = 22

const faces = []                        // { family, weight, upm, nh, hmtx: DataView, cp: (code) => gid, cache: Map }
let ready = false

const u8 = (d) => (d instanceof Uint8Array ? d : d instanceof ArrayBuffer ? new Uint8Array(d) : new Uint8Array(d.buffer, d.byteOffset, d.byteLength))

// WOFF (2026-10-23): the Inter files on disk (public/fonts, 295f74c) are WOFF 1.0, which satori reads but the table walk below does not.
// Unwrapped here into a plain sfnt (each table zlib-inflated when stored compressed), so the measure reads the very file the poster
// draws with. Before this every Inter face failed to parse and the measure fell back to its 0.6em average (lowercase ~20% too wide,
// caps too narrow): check-poster-fit's probes caught it.
function unwoff(b) {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const n = dv.getUint16(12)
  const tables = []
  for (let i = 0; i < n; i += 1) {
    const o = 44 + i * 20
    const off = dv.getUint32(o + 4); const comp = dv.getUint32(o + 8); const orig = dv.getUint32(o + 12)
    const raw = b.subarray(off, off + comp)
    tables.push({ tag: b.subarray(o, o + 4), data: comp < orig ? new Uint8Array(inflateSync(raw)) : raw })
  }
  let size = 12 + 16 * n
  for (const t of tables) size += (t.data.length + 3) & ~3
  const out = new Uint8Array(size)
  const ov = new DataView(out.buffer)
  ov.setUint32(0, dv.getUint32(4)); ov.setUint16(4, n)
  let at = 12 + 16 * n
  tables.forEach((t, i) => {
    const o = 12 + i * 16
    out.set(t.tag, o); ov.setUint32(o + 8, at); ov.setUint32(o + 12, t.data.length)
    out.set(t.data, at); at += (t.data.length + 3) & ~3
  })
  return out
}

function parse(data) {
  let b = u8(data)
  if (b[0] === 0x77 && b[1] === 0x4f && b[2] === 0x46 && b[3] === 0x46) b = unwoff(b)      // 'wOFF'
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength)
  const n = dv.getUint16(4)
  const T = {}
  for (let i = 0; i < n; i += 1) {
    const o = 12 + i * 16
    T[String.fromCharCode(b[o], b[o + 1], b[o + 2], b[o + 3])] = dv.getUint32(o + 8)
  }
  if (!T.head || !T.hhea || !T.hmtx || !T.cmap) return null
  const upm = dv.getUint16(T.head + 18)
  const nh = dv.getUint16(T.hhea + 34)
  // the cmap: prefer (3,10) format 12, then (3,1) format 4, then any Unicode table
  const nt = dv.getUint16(T.cmap + 2)
  let pick = null
  for (let i = 0; i < nt; i += 1) {
    const o = T.cmap + 4 + i * 8
    const plat = dv.getUint16(o); const enc = dv.getUint16(o + 2); const off = T.cmap + dv.getUint32(o + 4)
    const fmt = dv.getUint16(off)
    const rank = plat === 3 && enc === 10 && fmt === 12 ? 3 : plat === 3 && enc === 1 && fmt === 4 ? 2 : plat === 0 && (fmt === 4 || fmt === 12) ? 1 : 0
    if (rank && (!pick || rank > pick.rank)) pick = { rank, off, fmt }
  }
  if (!pick) return null
  const { off, fmt } = pick
  const cp = fmt === 12
    ? (c) => {
      let lo = 0; let hi = dv.getUint32(off + 12) - 1
      while (lo <= hi) {
        const mid = (lo + hi) >> 1; const g = off + 16 + mid * 12
        const s = dv.getUint32(g); const e = dv.getUint32(g + 4)
        if (c < s) hi = mid - 1; else if (c > e) lo = mid + 1; else return dv.getUint32(g + 8) + (c - s)
      }
      return 0
    }
    : (c) => {
      if (c > 0xffff) return 0
      const sc = dv.getUint16(off + 6) / 2
      const endO = off + 14; const startO = endO + sc * 2 + 2; const deltaO = startO + sc * 2; const rangeO = deltaO + sc * 2
      let lo = 0; let hi = sc - 1
      while (lo <= hi) {
        const mid = (lo + hi) >> 1
        const e = dv.getUint16(endO + mid * 2); const s = dv.getUint16(startO + mid * 2)
        if (c < s) hi = mid - 1; else if (c > e) lo = mid + 1
        else {
          const delta = dv.getInt16(deltaO + mid * 2); const ro = dv.getUint16(rangeO + mid * 2)
          if (ro === 0) return (c + delta) & 0xffff
          const g = dv.getUint16(rangeO + mid * 2 + ro + (c - s) * 2)
          return g ? (g + delta) & 0xffff : 0
        }
      }
      return 0
    }
  return { upm, nh, hmtx: T.hmtx, dv, cp, cache: new Map() }
}

/** Read the fonts a poster is about to be drawn with ([{ name, data, weight }], what assets() returns). Safe to call again. */
export function initMetrics(fonts = []) {
  if (ready && faces.length) return
  for (const f of fonts) {
    try {
      const p = parse(f.data)
      if (p) faces.push({ family: f.name, weight: f.weight || 400, ...p })
    } catch { /* an unreadable font falls back to the average-width estimate below */ }
  }
  ready = true
}
export const metricsReady = () => faces.length > 0

/** The faces satori would pick for (family, weight): the nearest loaded weight, the heavier on a tie (what the poster visibly draws).
 *  Every file of that weight, in load order: a family may ship as subsets (Inter latin + latin-ext), and a glyph comes from the first that has it. */
function facesFor(family, weight) {
  let best = null
  for (const f of faces) {
    if (f.family !== family) continue
    const d = Math.abs(f.weight - weight)
    if (!best || d < best.d || (d === best.d && f.weight > best.w)) best = { w: f.weight, d }
  }
  return best ? faces.filter((f) => f.family === family && f.weight === best.w) : []
}

const AVG = { Inter: 0.6, Shoulders: 0.47 }

/** The width in px of `text` on one line. `o`: { size, family = 'Inter', weight = 800, ls = 0 (letter-spacing px), upper = false }. */
export function textWidth(text, { size, family = 'Inter', weight = 800, ls = 0, upper = false } = {}) {
  let s = String(text ?? '')
  if (upper) s = s.toUpperCase()
  if (!s) return 0
  const fs = facesFor(family, weight)
  const f = fs[0]
  let units = 0
  let count = 0
  for (const ch of s) {
    count += 1
    if (!f) { units += (AVG[family] || 0.6) * 1000; continue }
    const c = ch.codePointAt(0)
    let em = f.cache.get(c)                        // the advance in thousandths of an em (subsets may differ in upm)
    if (em === undefined) {
      em = 620                                     // a glyph no file has (an emoji): satori draws a fallback of about this width
      for (const x of fs) {
        const g = x.cp(c)
        if (g) { em = (x.dv.getUint16(x.hmtx + 4 * Math.min(g, x.nh - 1)) * 1000) / x.upm; break }
      }
      f.cache.set(c, em)
    }
    units += em
  }
  return Math.ceil(((units / 1000) * size * KERN_PAD) + ls * count)
}

/** The log every fit decision lands in; scripts/check-poster-fit.mjs reads and clears it. */
export const FIT_LOG = []
export const logFit = (e) => { FIT_LOG.push(e); return e }

/**
 * One line, stepped down through `sizes` (largest first, never below the last): the first that fits `maxW`.
 * Returns { size, w, fits }. `fits` is false only when even the smallest overflows (the caller then wraps or cuts).
 */
export function fitLine(text, { sizes, maxW, id = '', quiet = false, ...font }) {
  let last = null
  for (const size of sizes) {
    const w = textWidth(text, { ...font, size })
    last = { size, w, fits: w <= maxW }
    if (last.fits) break
  }
  if (!quiet) logFit({ id, kind: 'line', text: String(text ?? ''), size: last.size, w: last.w, maxW, ok: last.fits, truncated: false })
  return last
}

/** One line cut to `maxW` with an ellipsis (the text itself when it fits). */
export function ellipsize(text, { size, maxW, ...font }) {
  const s = String(text ?? '')
  if (textWidth(s, { ...font, size }) <= maxW) return s
  const chars = [...s]
  let lo = 0; let hi = chars.length
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2)
    if (textWidth(`${chars.slice(0, mid).join('').trimEnd()}…`, { ...font, size }) <= maxW) lo = mid; else hi = mid - 1
  }
  return `${chars.slice(0, lo).join('').trimEnd()}…`
}

/** Greedy word wrap at one size into at most `maxLines` lines; { lines, fits } (fits false when text was cut: the last line carries the ellipsis). */
export function wrapText(text, { size, maxW, maxLines = 2, ...font }) {
  const w = (t) => textWidth(t, { ...font, size })
  const words = String(text ?? '').split(/\s+/).filter(Boolean)
  const lines = []
  let cur = ''
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word
    if (w(next) <= maxW || !cur) cur = next
    else { lines.push(cur); cur = word }
  }
  if (cur) lines.push(cur)
  if (!lines.length) return { lines: [''], fits: true }
  let fits = true
  let out = lines
  if (lines.length > maxLines) { out = [...lines.slice(0, maxLines - 1), lines.slice(maxLines - 1).join(' ')]; fits = false }
  out = out.map((l) => {
    if (w(l) <= maxW) return l
    fits = false
    return ellipsize(l, { ...font, size, maxW })
  })
  return { lines: out, fits }
}

/**
 * A block of text: the largest size in `sizes` at which `text` wraps into at most `maxLines` lines with nothing cut; at the smallest
 * size whatever does not fit is cut with an ellipsis. Returns { size, lines, w (the widest line), fits }.
 */
export function fitBlock(text, { sizes, maxW, maxLines = 2, id = '', quiet = false, ...font }) {
  let res = null
  for (const size of sizes) {
    const r = wrapText(text, { ...font, size, maxW, maxLines })
    res = { size, lines: r.lines, fits: r.fits }
    if (r.fits) break
  }
  res.w = Math.max(...res.lines.map((l) => textWidth(l, { ...font, size: res.size })))
  if (!quiet) logFit({ id, kind: 'block', text: String(text ?? ''), size: res.size, w: res.w, maxW, ok: res.w <= maxW, truncated: !res.fits, lines: res.lines.length, maxLines })
  return res
}

/** The height of `n` lines of `size` type at the posters' fixed line height. */
export const LH = 1.2
export const lineH = (size, n = 1) => Math.ceil(size * LH) * n

/** A name split into two balanced lines at a space (or a hyphen), for a hero that cannot fit on one line at its smallest size. */
export function splitName(name, o) {
  const s = String(name || '').trim()
  const parts = s.split(/(?<=[ -])/)           // keep the hyphen with its left half
  if (parts.length < 2) return [s]
  let best = null
  for (let i = 1; i < parts.length; i += 1) {
    const a = parts.slice(0, i).join('').trimEnd(); const b = parts.slice(i).join('').trimStart()
    const w = Math.max(textWidth(a, o), textWidth(b, o))
    if (!best || w < best.w) best = { a, b, w }
  }
  return [best.a, best.b]
}

/** A name shortened the way a box score does ("W. Contreras"): the last resort before an ellipsis. */
export function initialName(name) {
  const p = String(name || '').trim().split(/\s+/)
  return p.length < 2 ? p.join(' ') : `${p[0][0]}. ${p.slice(1).join(' ')}`
}
