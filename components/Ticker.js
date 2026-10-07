'use client'
// THE HEADER TICKER, ONCE (R9 #4, 2026-10-04). MOONSHOT's scorebug
// (components/Header.js), TUDDY's TickerStrip (nfl/NflHeader.js) and LAMP's
// LampTicker each carried the same shell: an auto-scrolling box (lib/headlines
// useAutoScroll, speed 55), a fade mask on both edges, and a track drawn twice
// so the loop is seamless (useAutoScroll's math assumes exactly two copies).
// What differs is passed in: each product's class names and outer style (kept
// byte-for-byte, so the headers look exactly as they did), and how one item is
// drawn -- `render(item, echo, i)`; the echo copy must be aria-hidden.
//
// No -webkit-overflow-scrolling:touch here, on purpose: it freezes a JS-driven
// scrollLeft on iOS Safari (Header.js #97, 2026-09-06).
import { useRef, useState } from 'react'
import { useAutoScroll } from '../lib/headlines'

const MASK = 'linear-gradient(90deg, transparent, #000 10px, #000 calc(100% - 22px), transparent)'
// At rest (scrolled to its start) the first chip is whole: no fade over it
// (audit X1, 2026-10-06: the first chip was clipped at the left edge).
const MASK_START = 'linear-gradient(90deg, #000, #000 calc(100% - 22px), transparent)'

export default function Ticker({ items, render, className, style = null, trackClassName = 'hdr-ticker-track', trackStyle = null, speed = 55 }) {
  const ref = useRef(null)
  const [atStart, setAtStart] = useState(true)
  useAutoScroll(ref, { speed })
  const mask = atStart ? MASK_START : MASK
  return (
    <div className={className} ref={ref} onScroll={(e) => { const at = e.currentTarget.scrollLeft < 2; if (at !== atStart) setAtStart(at) }}
      style={{ overflowX: 'auto', overflowY: 'hidden', scrollbarWidth: 'none', lineHeight: 1, maxWidth: '100%', WebkitMaskImage: mask, maskImage: mask, ...(style || {}) }}>
      <div className={trackClassName} style={{ display: 'flex', width: 'max-content', ...(trackStyle || {}) }}>
        {items.map((it, i) => render(it, false, i))}
        {items.map((it, i) => render(it, true, i))}
      </div>
    </div>
  )
}
