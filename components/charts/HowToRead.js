'use client'
// HOW TO READ THIS (2026-10-01, 2D TOP TIER 1). Lifted out of
// components/SprayField.js unchanged -- the dashed "how to read this ▸"
// button and the fine print it opens -- so the rink (LAMP ShotPanel) and the
// field (TUDDY TheField) explain themselves the same way. SprayField keeps its
// words and look (size 9, the defaults); a new mount passes size 12 so the
// fine print meets the phone rule (body text >= 12px).
//
// Controlled or not: pass `open` + `onToggle` to hold the state yourself.
import { useState } from 'react'

export default function HowToRead({ theme: C, numFont, open: openProp = null, onToggle = null, size = 9, children }) {
  const [own, setOwn] = useState(false)
  const open = openProp == null ? own : openProp
  const toggle = () => (onToggle ? onToggle(!open) : setOwn((v) => !v))
  const big = size > 9
  return (
    <>
      <button onClick={toggle} aria-expanded={open} style={{
        marginTop: 7, fontSize: big ? size : 9.5, fontWeight: 700, color: C.text3, cursor: 'pointer',
        background: 'transparent', border: `1px dashed ${C.border2}`, borderRadius: 6,
        padding: big ? '0 12px' : '3px 9px', fontFamily: numFont, ...(big ? { minHeight: 44 } : {}),
      }}>{open ? 'hide the fine print ▾' : 'how to read this ▸'}</button>
      {open && (
        <div style={{ fontSize: size, color: C.text3, marginTop: 7, lineHeight: 1.55 }}>
          {children}
        </div>
      )}
    </>
  )
}
