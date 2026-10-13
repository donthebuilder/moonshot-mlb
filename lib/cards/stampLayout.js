// THE STAMP STRIP'S TEXT FIT (server only; no JSX, so plain node can test it). Situation stamps (lib/cards/situations.js) sit on the card FRONT as small chips; this
// decides each chip's type size and width with the real font metrics (lib/cards/fit.js): the largest size in SIZES at which ALL the chips fit one row within `maxW`;
// at the 22px floor (cardKit MIN_TYPE) a chip that still does not fit is cut with an ellipsis (the tap explanation and the page keep the full text).
import { textWidth, ellipsize, logFit } from './fit'

export const SIZES = [30, 28, 26, 24, 22]
export const FLOOR = 22
const CHIP_PAD = 36        // left accent bar + padding either side
const CHIP_GAP = 12
const LS = 1               // letter-spacing px

/** [{ text, size, w, cut }]: one row of chips that fits `maxW` (the row is at most `maxW` wide, chips left to right). */
export function layoutStamps(stamps, { maxW, id = 'stamps' } = {}) {
  const list = (stamps || []).map((s) => String(s?.text ?? s ?? '').trim()).filter(Boolean).slice(0, 2)
  if (!list.length) return []
  const font = { family: 'Inter', weight: 800, ls: LS }
  for (const size of SIZES) {
    const widths = list.map((t) => textWidth(t, { ...font, size }) + CHIP_PAD)
    const total = widths.reduce((a, b) => a + b, 0) + CHIP_GAP * (list.length - 1)
    if (total <= maxW) {
      logFit({ id, kind: 'line', text: list.join(' | '), size, w: total, maxW, ok: true, truncated: false })
      return list.map((text, i) => ({ text, size, w: widths[i], cut: false }))
    }
  }
  // the floor, and still too wide: share the room (each chip gets what its text needs, the longest is cut first)
  const size = FLOOR
  const room = maxW - CHIP_GAP * (list.length - 1)
  const need = list.map((t) => textWidth(t, { ...font, size }) + CHIP_PAD)
  let budget = need.map((w) => Math.min(w, Math.floor(room / list.length)))
  const spare = room - budget.reduce((a, b) => a + b, 0)
  if (spare > 0) { const i = need.findIndex((w, k) => w > budget[k]); if (i >= 0) budget[i] = Math.min(need[i], budget[i] + spare) }
  const out = list.map((t, i) => {
    const inner = budget[i] - CHIP_PAD
    const text = ellipsize(t, { size, maxW: inner, ...font })
    return { text, size, w: Math.min(budget[i], textWidth(text, { ...font, size }) + CHIP_PAD), cut: text !== t }
  })
  logFit({ id, kind: 'line', text: list.join(' | '), size, w: out.reduce((a, c) => a + c.w, 0) + CHIP_GAP * (out.length - 1), maxW, ok: true, truncated: out.some((c) => c.cut) })
  return out
}
export const CHIP = { pad: CHIP_PAD, gap: CHIP_GAP, ls: LS }
