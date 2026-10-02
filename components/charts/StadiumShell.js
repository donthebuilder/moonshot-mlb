'use client'
// STADIUM SHELL (2026-10-01, BATCH-3D-CAMERA). Donovan: "rotating is hard on
// mobile because the chart is so small." One wrapper every 3D view mounts its
// canvas in -- MOONSHOT's spray stadium and zone map now, LAMP's arena and
// TUDDY's stadium next. It owns NO scene code:
//
//   ⛶ full screen   on a coarse pointer: fixed, 100dvh, above the tab bar,
//                    page scroll locked and restored on close. The view's own
//                    ResizeObserver resizes the renderer to the new box.
//   presets          44px chips under the canvas; tapping one calls the view's
//                    onPreset(key), which animates its camera there.
//   chips            the view's own row (live / replay / hold / orbit), as a
//                    slot above the presets instead of floating on the canvas.
//
// The canvas box carries data-stadium-full="1" while full, so the view knows
// to fill the height instead of using its inline max(340, 0.6W). Going full
// screen portals the box to <body>, which remounts it: `children` may be a
// function of { full } so the view can rebuild its scene in the new box.
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

function coarse() {
  try { return typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(pointer: coarse)').matches } catch { return false }
}

export default function StadiumShell({ children, chips = null, presets = [], onPreset = null, active = null, theme, accent, caption = null, onFullChange = null }) {
  const [full, setFull] = useState(false)
  const [canFull, setCanFull] = useState(false)
  const scrollRef = useRef(0)
  const rootRef = useRef(null)
  const holdRef = useRef({ h: 0, el: null, top: 0 })   // inline height + the scrolling panel, kept across full screen
  useEffect(() => { setCanFull(coarse()) }, [])
  useEffect(() => { onFullChange?.(full) }, [full]) // eslint-disable-line react-hooks/exhaustive-deps
  // The nearest scrolling ancestor (a player card scrolls inside its own panel).
  const scrollParent = (el) => {
    for (let n = el?.parentElement; n; n = n.parentElement) {
      const oy = getComputedStyle(n).overflowY
      if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight) return n
    }
    return null
  }
  const openFull = () => {
    const el = scrollParent(rootRef.current)
    holdRef.current = { h: rootRef.current?.offsetHeight || 0, el, top: el ? el.scrollTop : 0 }
    setFull(true)
  }
  useEffect(() => {
    if (!full) return undefined
    scrollRef.current = window.scrollY
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const key = (e) => { if (e.key === 'Escape') setFull(false) }
    document.addEventListener('keydown', key)
    return () => {
      document.body.style.overflow = prev
      document.removeEventListener('keydown', key)
      window.scrollTo(0, scrollRef.current)
      const { el, top } = holdRef.current
      if (el) { el.scrollTop = top; requestAnimationFrame(() => { el.scrollTop = top }) }
    }
  }, [full])

  const chipStyle = (on) => ({
    minHeight: 44, padding: '0 14px', borderRadius: 999, cursor: 'pointer', flex: '0 0 auto',
    fontSize: 12, fontWeight: 800, letterSpacing: '.06em', whiteSpace: 'nowrap',
    border: `1px solid ${on ? accent : theme.border2 || theme.border}`,
    background: on ? `${accent}22` : 'transparent', color: on ? accent : theme.text2,
  })

  const controls = (
    <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
      {chips && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>{chips}</div>}
      {(presets.length > 0 || canFull) && (
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', alignItems: 'center', paddingBottom: 2 }}>
          {presets.map((p) => (
            <button key={p.key} type="button" title={p.title || p.label} aria-pressed={active === p.key}
              onClick={() => onPreset?.(p.key)} style={chipStyle(active === p.key)}>{p.label}</button>
          ))}
          {canFull && !full && (
            <button type="button" onClick={openFull} aria-label="Full screen" style={{ ...chipStyle(false), marginLeft: 'auto' }}>⛶ full screen</button>
          )}
        </div>
      )}
    </div>
  )

  const box = (
    <div data-stadium-full={full ? '1' : '0'} style={full ? { flex: 1, minHeight: 0, position: 'relative', overflow: 'hidden' } : { position: 'relative' }}>
      {typeof children === 'function' ? children({ full }) : children}
    </div>
  )

  if (full && typeof document !== 'undefined') {
    // The inline spot keeps its height while the view is full screen, so the
    // page (or the card's panel) under it never shortens and jumps.
    return <div ref={rootRef} style={{ height: holdRef.current.h }}>{createPortal(
      <div role="dialog" aria-modal="true" aria-label="3D view, full screen" style={{
        position: 'fixed', inset: 0, zIndex: 1000, height: '100dvh', display: 'flex', flexDirection: 'column',
        background: theme.bg, padding: 'env(safe-area-inset-top) 10px calc(10px + env(safe-area-inset-bottom))',
      }}>
        <div style={{ display: 'flex', justifyContent: 'flex-end', padding: '6px 0' }}>
          <button type="button" onClick={() => setFull(false)} aria-label="Close full screen"
            style={{ width: 44, height: 44, borderRadius: 999, border: `1px solid ${theme.border}`, background: theme.bg2, color: theme.text2, fontSize: 18, cursor: 'pointer' }}>✕</button>
        </div>
        {box}
        {controls}
      </div>,
      document.body,
    )}</div>
  }
  return (
    <div ref={rootRef}>
      {box}
      {controls}
      {caption}
    </div>
  )
}
