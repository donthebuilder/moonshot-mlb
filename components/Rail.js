'use client'
import { useEffect, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'

// 🛤️ THE RAIL — the name for any row of columns that scrolls left-to-right.
//
// 2026-08-09, Donovan: "make it easier to scroll right to left on the desktop
// for the columns things, and tell me what to call it for future reference."
//
// THE NAME, since that was half the ask. A **Rail** is a horizontal track of
// items too wide for the screen. The pieces have names too, so we can talk
// about this in one word next time:
//
//   Rail        the whole scrolling strip
//   Rail item   one column/card inside it
//   Rail nubs   the ‹ › buttons at either end
//   Rail fade   the soft edge that says "there is more this way"
//   Rail page   how far one nub press moves — about 85% of the visible width,
//               deliberately not 100%, so one column stays on screen as an
//               anchor and you never lose your place
//
// So: "put the parks board on a Rail", "the Rail nubs are hiding on mobile".
//
// WHY DESKTOP NEEDED THIS AT ALL. A phone scrolls a wide strip with a thumb
// and it feels obvious. A desktop mouse has no horizontal axis — a plain
// `overflowX: auto` div is genuinely hard to move unless you own a trackpad,
// and the scrollbar is often below the fold. Every wide surface on the site
// was that div. Four fixes, cheapest first:
//
//   1. WHEEL TRANSLATION. Vertical wheel over a Rail scrolls it sideways.
//      This is the one that does 90% of the work for a mouse user.
//   2. NUBS. Explicit ‹ › buttons, because a control you can see beats a
//      gesture you have to discover.
//   3. DRAG. Click and pull the strip, like dragging a map.
//   4. KEYBOARD. Arrow keys, Home and End when the Rail has focus.
//
// WHAT IT DOES NOT DO, on purpose:
//   · it does not hijack the page's vertical scroll. If the Rail is already
//     at one end, the wheel event passes through and the page scrolls
//     normally. Without that guard a wide strip becomes a trap you cannot
//     scroll past, which is worse than the problem being fixed.
//   · it does not touch touch devices. Native momentum scrolling is better
//     than anything reimplemented here, so the nubs hide under 700px and the
//     drag handler ignores touch entirely.
//   · it does not animate on `scroll-behavior: smooth` for the wheel, only
//     for the nubs — smooth-scrolling every wheel tick feels like mud.

export default function Rail({
  children,
  gap = 8,
  label = '',          // optional caption shown beside the nubs
  itemMin = 0,         // if set, lays children out as equal columns of this min width
  style = {},
  className = '',
}) {
  const ref = useRef(null)
  const [edges, setEdges] = useState({ left: false, right: false })
  const drag = useRef({ on: false, x: 0, start: 0, moved: 0 })

  // Which fades and nubs are live. 2px of slack because sub-pixel layout
  // means scrollLeft rarely lands exactly on 0 or on the maximum.
  const measure = () => {
    const el = ref.current
    if (!el) return
    const max = el.scrollWidth - el.clientWidth
    setEdges({ left: el.scrollLeft > 2, right: el.scrollLeft < max - 2 })
  }

  useEffect(() => {
    const el = ref.current
    if (!el) return
    measure()

    // ── 1. wheel → sideways ──────────────────────────────────────────────
    const onWheel = (e) => {
      // A trackpad two-finger swipe already carries deltaX; leave it alone.
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return
      const max = el.scrollWidth - el.clientWidth
      if (max <= 0) return
      const next = el.scrollLeft + e.deltaY
      // AT THE END, GIVE THE PAGE ITS SCROLL BACK. This is the guard that
      // keeps a Rail from becoming a trap: only swallow the event while
      // there is actually somewhere left to go in that direction.
      if ((e.deltaY < 0 && el.scrollLeft <= 0) || (e.deltaY > 0 && el.scrollLeft >= max)) return
      e.preventDefault()
      el.scrollLeft = Math.max(0, Math.min(max, next))
      measure()
    }
    // passive:false because preventDefault on a wheel listener is ignored
    // otherwise — Chrome makes wheel listeners passive by default.
    el.addEventListener('wheel', onWheel, { passive: false })

    // ── 3. drag ──────────────────────────────────────────────────────────
    const down = (e) => {
      if (e.pointerType === 'touch') return           // native scrolling is better
      if (e.button !== 0) return
      drag.current = { on: true, x: e.clientX, start: el.scrollLeft, moved: 0 }
    }
    const move = (e) => {
      if (!drag.current.on) return
      const dx = e.clientX - drag.current.x
      drag.current.moved = Math.max(drag.current.moved, Math.abs(dx))
      if (drag.current.moved > 3) {
        el.scrollLeft = drag.current.start - dx
        measure()
      }
    }
    // A drag that moved more than a few pixels must not also fire the click
    // on whatever card was under the cursor — otherwise pulling the strip
    // sideways opens a player modal.
    const up = () => { setTimeout(() => { drag.current.on = false }, 0) }
    const clickGuard = (e) => {
      if (drag.current.moved > 3) { e.stopPropagation(); e.preventDefault() }
      drag.current.moved = 0
    }
    el.addEventListener('pointerdown', down)
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    el.addEventListener('click', clickGuard, true)

    const onScroll = () => measure()
    el.addEventListener('scroll', onScroll, { passive: true })
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null
    ro?.observe(el)
    window.addEventListener('resize', measure)

    return () => {
      el.removeEventListener('wheel', onWheel)
      el.removeEventListener('pointerdown', down)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      el.removeEventListener('click', clickGuard, true)
      el.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', measure)
      ro?.disconnect()
    }
  }, [children])

  // ── 2. nubs ────────────────────────────────────────────────────────────
  const page = (dir) => {
    const el = ref.current
    if (!el) return
    el.scrollBy({ left: dir * el.clientWidth * 0.85, behavior: 'smooth' })
  }

  // ── 4. keyboard ────────────────────────────────────────────────────────
  const onKey = (e) => {
    const el = ref.current
    if (!el) return
    if (e.key === 'ArrowRight') { page(1); e.preventDefault() }
    else if (e.key === 'ArrowLeft') { page(-1); e.preventDefault() }
    else if (e.key === 'Home') { el.scrollTo({ left: 0, behavior: 'smooth' }); e.preventDefault() }
    else if (e.key === 'End') { el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' }); e.preventDefault() }
  }

  const nub = (dir, on) => (
    <button
      type="button"
      aria-label={dir < 0 ? 'Scroll left' : 'Scroll right'}
      onClick={() => page(dir)}
      disabled={!on}
      className="rail-nub"
      style={{
        width: 22, height: 22, borderRadius: 7, flexShrink: 0,
        border: `1px solid ${on ? C.border : 'transparent'}`,
        background: on ? C.bg3 : 'transparent',
        color: on ? C.text2 : 'transparent',
        cursor: on ? 'pointer' : 'default',
        fontSize: 12, lineHeight: 1, fontFamily: NUM_FONT,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 0, transition: 'background .12s, color .12s',
      }}
    >{dir < 0 ? '‹' : '›'}</button>
  )

  const scrollable = edges.left || edges.right

  return (
    <div style={{ position: 'relative', ...style }} className={className}>
      {scrollable && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 5,
          justifyContent: 'flex-end', marginBottom: 4,
        }} className="rail-nubs">
          {label ? (
            <span style={{ fontSize: 9, color: C.text3, marginRight: 'auto', fontFamily: NUM_FONT }}>
              {label}
            </span>
          ) : null}
          <span style={{ fontSize: 9, color: C.text3, fontFamily: NUM_FONT }}>scroll</span>
          {nub(-1, edges.left)}
          {nub(1, edges.right)}
        </div>
      )}

      <div style={{ position: 'relative' }}>
        <div
          ref={ref}
          tabIndex={0}
          onKeyDown={onKey}
          className="rail"
          style={{
            display: itemMin ? 'grid' : 'flex',
            gridAutoFlow: itemMin ? 'column' : undefined,
            gridAutoColumns: itemMin ? `minmax(${itemMin}px, 1fr)` : undefined,
            gap,
            overflowX: 'auto', overflowY: 'hidden',
            // Native momentum on touch; the desktop handlers above do the rest.
            WebkitOverflowScrolling: 'touch',
            scrollbarWidth: 'thin',
            outline: 'none',
            paddingBottom: 2,
          }}
        >
          {children}
        </div>

        {/* Rail fades. pointerEvents none so they never eat a click on the
            card underneath — an edge decoration that swallows input is a bug
            dressed as a gradient. */}
        {edges.left && (
          <div style={{
            position: 'absolute', left: 0, top: 0, bottom: 0, width: 26,
            background: `linear-gradient(90deg, ${C.bg}, transparent)`,
            pointerEvents: 'none',
          }} />
        )}
        {edges.right && (
          <div style={{
            position: 'absolute', right: 0, top: 0, bottom: 0, width: 26,
            background: `linear-gradient(270deg, ${C.bg}, transparent)`,
            pointerEvents: 'none',
          }} />
        )}
      </div>
    </div>
  )
}
