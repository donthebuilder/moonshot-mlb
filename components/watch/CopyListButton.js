'use client'
import { useState } from 'react'

// 📋 COPY LIST (2026-10-28): one tap puts the watchlist on the clipboard as text. A list too long for one Discord message copies in parts:
// each tap copies the next, and the button says which part is on the clipboard (MOONSHOT's and TUDDY's Copy List do the same). `parts` is
// the finished text (lib/watchCopy.js), computed by the page; with nothing to copy the button is not drawn. 44 px tall, like the page's others.
export default function CopyListButton({ parts, C, NUM_FONT, accent }) {
  const [state, setState] = useState(null)   // 'ok' | 'fail' | null
  const [next, setNext] = useState(0)
  if (!parts?.length) return null
  const part = next % parts.length
  const go = async () => {
    try { await navigator.clipboard.writeText(parts[part]); setState('ok'); if (parts.length > 1) setNext(part + 1) } catch { setState('fail') }
    setTimeout(() => setState(null), 1800)
  }
  const label = state === 'ok' ? (parts.length > 1 ? `COPIED ${part === 0 ? parts.length : part}/${parts.length}` : 'COPIED') : state === 'fail' ? 'COULD NOT COPY' : parts.length > 1 ? `COPY ${part + 1}/${parts.length}` : 'COPY LIST'
  return (
    <button type="button" onClick={go} aria-live="polite" title="Copy this watchlist as text"
      style={{ minHeight: 44, padding: '0 14px', borderRadius: 10, cursor: 'pointer', whiteSpace: 'nowrap', border: `1px solid ${state === 'ok' ? accent : C.border}`,
        background: C.bg2, color: state === 'ok' ? accent : C.text2, font: `800 11px/1 ${NUM_FONT}`, letterSpacing: '.06em' }}>
      {label}
    </button>
  )
}
