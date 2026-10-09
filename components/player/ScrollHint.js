'use client'
import { useEffect, useRef, useState } from 'react'
import { useSportTheme } from '../SportTheme'

// A WIDE TABLE SCROLLS IN ITS OWN BOX, AND SAYS SO (2026-10-08, the role table was cut at "VS LHP" with nothing
// to say there was more). Finds the first scrollable descendant (.dense-scroll / overflow auto), and while
// there is more to the right shows a right-edge fade and a one-line 'swipe' hint above; both go away at the end.
export default function ScrollHint({ children, hint = 'Swipe the table for more columns', style }) {
  const { C, NUM_FONT } = useSportTheme()
  const wrap = useRef(null)
  const [more, setMore] = useState(false)
  useEffect(() => {
    const root = wrap.current
    if (!root) return undefined
    let el = null
    const find = () => [root, ...root.querySelectorAll('*')].find((e) => e.scrollWidth > e.clientWidth + 2 && /(auto|scroll)/.test(getComputedStyle(e).overflowX)) || null
    const check = () => {
      if (!el || !el.isConnected) { el?.removeEventListener('scroll', check); el = find(); el?.addEventListener('scroll', check, { passive: true }) }
      setMore(Boolean(el) && el.scrollLeft + el.clientWidth < el.scrollWidth - 4)
    }
    check()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(check) : null
    ro?.observe(root)
    const t = setTimeout(check, 600)   // tables fill in after their data lands
    window.addEventListener('resize', check)
    return () => { ro?.disconnect(); clearTimeout(t); window.removeEventListener('resize', check); el?.removeEventListener('scroll', check) }
  }, [])
  return (
    <div ref={wrap} style={{ position: 'relative', ...style }}>
      {more && <div aria-hidden style={{ fontFamily: NUM_FONT, fontSize: 11, color: C.text3, textAlign: 'right', marginBottom: 3 }}>{hint} ›</div>}
      <div style={{ position: 'relative' }}>
      {children}
      {more && <div aria-hidden style={{ position: 'absolute', top: 0, bottom: 0, right: 0, width: 26, pointerEvents: 'none', borderRadius: '0 12px 12px 0', background: `linear-gradient(90deg, transparent, ${C.bg2})` }} />}
      </div>
    </div>
  )
}
