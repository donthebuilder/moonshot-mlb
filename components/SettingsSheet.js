'use client'
import { useEffect, useRef, useState } from 'react'

// ⚙ THE VIEW-SETTINGS GEAR, ONE COMPONENT FOR ALL THREE PRODUCTS (2026-09-26).
//
// MOONSHOT's header kept its own SettingsSheet (components/Header.js) and
// TUDDY's kept a copy (NflSettingsSheet) -- same gear, same popover, two
// files. LAMP had none (.claude-notes/BATCH-LAMP-SHELL-PLAN.md step 1). The
// shell lives here; each product passes its own theme, its own accent and
// only the switches that actually do something on it -- a switch that
// changes nothing on the page is not offered (LAMP's own theme ignores the
// palette and light/dark, so LAMP's sheet is Quiet alone).
//
//   <SettingsSheet theme={C} accent={C.green} openAlpha={31 / 255} title=… hint=…>
//     <SheetLabel theme={C}>View</SheetLabel>
//     <SheetRow>…buttons…</SheetRow>
//   </SettingsSheet>
const rgba = (hex, a) => {
  const h = String(hex || '').replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const n = parseInt(full.slice(0, 6), 16)
  if (!Number.isFinite(n)) return hex
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

export function SheetLabel({ theme, children }) {
  return <div style={{ fontSize: 8.5, fontWeight: 900, letterSpacing: '.14em', color: theme.text3, textTransform: 'uppercase' }}>{children}</div>
}

export function SheetRow({ children }) {
  return <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{children}</div>
}

export default function SettingsSheet({ theme, accent, openAlpha = 0.12, title = 'View settings', hint = null, children }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)
  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    const key = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key) }
  }, [open])
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button type="button" onClick={() => setOpen((v) => !v)} aria-expanded={open} aria-haspopup="dialog" title={title}
        style={{
          width: 30, height: 30, borderRadius: 999, display: 'grid', placeItems: 'center', cursor: 'pointer',
          border: `1px solid ${open ? `${accent}66` : theme.border}`, background: open ? rgba(accent, openAlpha) : theme.glass,
          color: open ? accent : theme.text2, fontSize: 14, transition: 'transform .12s, background .12s',
          transform: open ? 'rotate(30deg)' : 'none',
        }}>⚙</button>
      {open && (
        <div role="dialog" aria-label="View settings" style={{
          position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 60, minWidth: 200,
          background: rgba(theme.bg2, 0.98), border: `1px solid ${theme.border}`, borderRadius: 12,
          boxShadow: '0 12px 32px rgba(0,0,0,.45)', padding: '10px 10px 8px', display: 'grid', gap: 8,
        }}>
          {children}
          {hint ? <div style={{ fontSize: 9.5, color: theme.text3, lineHeight: 1.5 }}>{hint}</div> : null}
        </div>
      )}
    </div>
  )
}
