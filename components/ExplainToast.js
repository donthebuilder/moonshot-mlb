'use client'
import { useEffect, useRef, useState } from 'react'
import { EXPLAIN_EVENT } from '../lib/explain'
import { C as MLB_C } from '../lib/theme'
import { C as NFL_C } from '../lib/nfl/theme'
import { C as NHL_C } from '../lib/nhl/theme'

// THE EXPLAIN PANEL (2026-09-27). One per app shell (SportRoot). A tap on a
// ticker pill that explains itself (lib/explain.js) shows its words here --
// fixed above the phone's bottom nav, where a moving strip can't carry it
// off. Tap it (or Escape) to close; it also leaves on its own after 10s.
const THEMES = { mlb: MLB_C, nfl: NFL_C, nhl: NHL_C }

export default function ExplainToast({ sport = 'mlb' }) {
  const [msg, setMsg] = useState(null)
  const timer = useRef(null)
  const T = THEMES[sport] || MLB_C
  useEffect(() => {
    const on = (e) => {
      setMsg(e.detail || null)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setMsg(null), 10000)
    }
    const key = (e) => { if (e.key === 'Escape') setMsg(null) }
    window.addEventListener(EXPLAIN_EVENT, on)
    window.addEventListener('keydown', key)
    return () => { window.removeEventListener(EXPLAIN_EVENT, on); window.removeEventListener('keydown', key); clearTimeout(timer.current) }
  }, [])
  if (!msg) return null
  return (
    <button type="button" className="explain-toast" onClick={() => setMsg(null)} aria-live="polite"
      style={{
        position: 'fixed', left: '50%', transform: 'translateX(-50%)', zIndex: 396,
        width: 'min(520px, calc(100vw - 32px))', padding: '10px 14px', borderRadius: 12, textAlign: 'left',
        border: `1px solid ${T.border2 || T.border}`, background: T.bg2, color: T.text2, cursor: 'pointer',
        fontSize: 12, lineHeight: 1.45, whiteSpace: 'pre-line', boxShadow: '0 12px 36px rgba(0,0,0,.5)', minHeight: 0,
      }}>
      <b style={{ display: 'block', color: T.text, fontSize: 10, letterSpacing: '.1em', textTransform: 'uppercase', marginBottom: 3 }}>{msg.label}</b>
      {msg.text}
      <style>{'.explain-toast{bottom:16px}@media(max-width:760px){.explain-toast{bottom:calc(82px + env(safe-area-inset-bottom))}}'}</style>
    </button>
  )
}
