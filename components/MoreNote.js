'use client'
import { useState } from 'react'
import { useIsPhone } from './MobileFold'
import { C, NUM_FONT, TYPE } from '../lib/theme'

// A LONG NOTE FOLDED BEHIND A TAP, ON A PHONE (2026-10-17, copy diet second pass; Donovan: "use less words site wide ... fold long notes behind a tap
// instead of deleting"). Nothing is removed: on a desktop (or any screen over 560px) the note reads exactly as before; on a phone it is one 44px line,
// "<label> ▾", and a tap opens the same words. The label says what the note is ("How to read this", "The fine print").
//   <MoreNote label="How to read this"><div style={...}>the long note</div></MoreNote>
export default function MoreNote({ label = 'How to read this', children, theme = null }) {
  const phone = useIsPhone(560)
  const [open, setOpen] = useState(false)
  const T = theme || { C, NUM_FONT, TYPE }
  if (!phone) return <>{children}</>
  return (
    <div style={{ margin: '2px 0' }}>
      <button type="button" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', minHeight: 44, padding: 0, border: 0, background: 'transparent', cursor: 'pointer',
          textAlign: 'left', color: T.C.text3, font: `800 ${T.TYPE.label}px/1 ${T.NUM_FONT}`, letterSpacing: '.06em' }}>
        {label}<span aria-hidden="true" style={{ transform: open ? 'rotate(180deg)' : 'none' }}>▾</span>
      </button>
      {open && children}
    </div>
  )
}
