'use client'
import { useEffect, useRef, useState } from 'react'
import { C as MLB_C, NUM_FONT as MLB_NUM, TYPE } from '../lib/theme'

// ── THE HERO'S STAT PILL, SHARED (2026-09-26) ───────────────────────────────
// MOONSHOT's Home `Stat`, moved as it was (MOONSHOT's look is the reference)
// so LAMP's hero uses the same pill (.claude-notes/BATCH-LAMP-SHELL-PLAN.md
// step 2). Label, value, optional sub; `theme`/`numFont` default to MOONSHOT's.
//
// TAP TO EXPLAIN (2026-09-27). "PROJ HR", "BEST AIR" and the rest explain
// themselves in `title`, and a phone can't hover -- the explanation existed
// and nobody on a phone could reach it. A pill with a `title` is now a
// button: a tap opens the same words in a small popover under it (a second
// tap, or a tap anywhere else, closes it). Desktop keeps the hover title.
// Nothing moves and nothing takes room until it's asked for.
export default function HeroStat({ label, value, sub, col = null, title, theme = null, numFont = null }) {
  const C = theme || MLB_C
  const NUM_FONT = numFont || MLB_NUM
  const [open, setOpen] = useState(false)
  const [right, setRight] = useState(false)   // anchor to the pill's right edge when the left one would spill off-screen
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const key = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', away)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('pointerdown', away); document.removeEventListener('keydown', key) }
  }, [open])
  const pill = {
    display: 'flex', alignItems: 'baseline', gap: 5, minWidth: 0,
    border: `1px solid ${open ? C.border2 || C.border : C.border}`, background: 'rgba(255,255,255,.025)',
    borderRadius: 8, padding: '4px 9px', color: 'inherit', font: 'inherit', textAlign: 'left',
    cursor: title ? 'pointer' : 'inherit',
    // Same size as the plain pill it was: the phone rule that gives buttons
    // a tap-target minimum would otherwise grow these and push the page down.
    minHeight: 0, lineHeight: 'inherit',
  }
  const inner = (
    <>
      <span style={{
        fontSize: TYPE.label, color: C.text3, letterSpacing: '.06em', fontFamily: NUM_FONT,
        flexShrink: 0,
      }}>{label}</span>
      <b style={{
        fontSize: TYPE.body, color: col || C.text, fontFamily: NUM_FONT, minWidth: 0,
        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{value}</b>
      {sub && (
        <span style={{
          fontSize: TYPE.micro, color: C.text3, fontFamily: NUM_FONT, minWidth: 0,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{sub}</span>
      )}
    </>
  )
  if (!title) return <span style={pill}>{inner}</span>
  return (
    <span ref={ref} style={{ position: 'relative', display: 'flex', minWidth: 0 }}>
      <button type="button" title={title} aria-expanded={open} style={pill}
        onClick={() => {
          const r = ref.current?.getBoundingClientRect()
          setRight(Boolean(r && r.left + Math.min(280, window.innerWidth * 0.8) > window.innerWidth - 8))
          setOpen((v) => !v)
        }}>{inner}</button>
      {open && (
        <span role="note" style={{
          position: 'absolute', top: 'calc(100% + 6px)', ...(right ? { right: 0 } : { left: 0 }), zIndex: 30,
          width: 'min(280px, 80vw)', padding: '8px 10px', borderRadius: 8,
          border: `1px solid ${C.border2 || C.border}`, background: C.bg2, color: C.text2,
          fontSize: 11.5, lineHeight: 1.45, whiteSpace: 'pre-line', boxShadow: '0 10px 30px rgba(0,0,0,.45)',
        }}>{title}</span>
      )}
    </span>
  )
}
