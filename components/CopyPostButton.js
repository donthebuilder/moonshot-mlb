'use client'
import { useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'

// COPY POST (2026-10-07): one tap puts a finished post on the clipboard (the Watchlist's Copy List
// pattern, for a card). `build()` runs at click time so it can read the address; it returns '' when
// there is nothing true to say, and then the button is not drawn. Shared: any sport hands in its own text.
export default function CopyPostButton({ build, label = 'Copy post', ready = true }) {
  const [state, setState] = useState(null)
  if (!ready) return null
  async function go() {
    const text = build?.() || ''
    if (!text) { setState('fail'); setTimeout(() => setState(null), 1800); return }
    try { await navigator.clipboard.writeText(text); setState('ok') } catch { setState('fail') }
    setTimeout(() => setState(null), 1800)
  }
  return (
    <button type="button" onClick={go} aria-live="polite"
      style={{ minHeight: 44, minWidth: 44, padding: '0 14px', borderRadius: 999, cursor: 'pointer', font: 'inherit', fontFamily: NUM_FONT,
        fontSize: 12, fontWeight: 700, color: state === 'ok' ? C.orange : C.text2, background: 'transparent', border: `1px solid ${C.border2}` }}>
      {state === 'ok' ? 'Copied' : state === 'fail' ? 'Could not copy' : label}
    </button>
  )
}
