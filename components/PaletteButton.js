'use client'
import { useEffect, useRef, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'
import { RAMPS, usePalette, hydrateRamp } from '../lib/palette'
import PaletteToggle from './PaletteToggle'
import PaletteStudio from './PaletteStudio'

// 🎨 PALETTE BUTTON — the colours, reachable from every tab.
//
// 2026-08-10, Donovan: "I need to be able to access the colours from all
// across the site."
//
// He was right to flag it. The picker shipped inside the Guide tab and on the
// heat map's own legend, which means the one moment you actually want it —
// looking at a board that is hard to read — is the moment it is two clicks and
// a tab away, and by the time you are back the thing you were judging is off
// screen. It belongs in the header, beside Today/Tomorrow, because it is the
// same kind of control: a view setting, not a page.
//
// THE BUTTON IS ITS OWN SWATCH. It shows the active ramp in miniature, so the
// header answers "which one am I on" without being opened.
export default function PaletteButton() {
  const active = usePalette()
  const [open, setOpen] = useState(false)
  const wrap = useRef(null)

  useEffect(() => { hydrateRamp() }, [])

  // Close on outside click and on Escape. Both, because this sits in a sticky
  // header over scrolling content — a panel you can only dismiss by finding
  // the button again is worse than no panel.
  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => { if (wrap.current && !wrap.current.contains(e.target)) setOpen(false) }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // The mini swatch shows a LIT ramp by its inks. Signal's fills are
  // deliberately near-black — correct on a table where the number sits on top,
  // and invisible as a 30x12 chip in the header.
  const r = RAMPS[active] || {}
  const stops = r.inks || r.stops || []

  return (
    <div ref={wrap} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        title={`Heat map colours — currently ${RAMPS[active]?.label || ''}. Switch or build your own.`}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '4px 8px', borderRadius: 8, cursor: 'pointer',
          background: open ? C.bg3 : 'transparent',
          border: `1px solid ${open ? C.orange : C.border}`,
        }}
      >
        <span style={{ display: 'flex', width: 30, height: 12, borderRadius: 3, overflow: 'hidden' }}>
          {stops.map((c, i) => <span key={c + i} style={{ flex: 1, background: c }} />)}
        </span>
        <span style={{ fontSize: 10, fontWeight: 800, color: C.text3, fontFamily: NUM_FONT }}>
          {RAMPS[active]?.label || 'Colours'}
        </span>
      </button>

      {open && (
        <div
          style={{
            position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 90,
            width: 'min(92vw, 380px)', maxHeight: '70vh', overflowY: 'auto',
            background: 'rgba(17,17,19,0.98)', backdropFilter: 'blur(14px)',
            border: `1px solid ${C.border2}`, borderRadius: 12,
            boxShadow: '0 18px 44px rgba(0,0,0,0.55)',
            padding: 12, display: 'flex', flexDirection: 'column', gap: 12,
          }}
        >
          <div>
            <div style={{
              fontSize: 9.5, fontWeight: 800, letterSpacing: '.07em',
              textTransform: 'uppercase', color: C.text2, marginBottom: 6,
            }}>Heat map colours</div>
            <PaletteToggle compact />
          </div>
          <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10 }}>
            <div style={{
              fontSize: 9.5, fontWeight: 800, letterSpacing: '.07em',
              textTransform: 'uppercase', color: C.text2, marginBottom: 6,
            }}>Build your own</div>
            <PaletteStudio compact />
          </div>
        </div>
      )}
    </div>
  )
}
