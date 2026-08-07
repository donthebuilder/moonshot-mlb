'use client'
import { useState } from 'react'

// The preview door. Wrong guesses shake; the right one sets an httpOnly
// cookie for 30 days and walks you in.
export default function Gate() {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState(false)
  const [busy, setBusy] = useState(false)

  const go = async (e) => {
    e.preventDefault()
    setBusy(true); setErr(false)
    const r = await fetch('/api/gate', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw }),
    }).catch(() => null)
    setBusy(false)
    if (r?.ok) window.location.href = '/'
    else setErr(true)
  }

  return (
    <main style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20,
    }}>
      <form onSubmit={go} style={{
        width: 340, maxWidth: '100%', background: '#111113', border: '1px solid #27272a',
        borderTop: '2px solid #22c55e', borderRadius: 14, padding: '26px 24px',
        textAlign: 'center',
        animation: err ? 'shake .3s' : 'none',
      }}>
        <style>{'@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-7px)}75%{transform:translateX(7px)}}'}</style>
        <div style={{
          fontSize: 22, fontWeight: 900, letterSpacing: '-0.02em',
          background: 'linear-gradient(90deg, #22c55e, #f97316)',
          WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
        }}>MOONSHOT</div>
        <div style={{ fontSize: 10, fontWeight: 800, color: '#71717a', letterSpacing: '.12em', marginTop: 2 }}>
          NFL · PRESEASON PREVIEW
        </div>
        <input
          type="password"
          value={pw}
          onChange={(e2) => setPw(e2.target.value)}
          placeholder="preview password"
          autoFocus
          style={{
            width: '100%', boxSizing: 'border-box', marginTop: 18,
            background: '#09090b', border: `1px solid ${err ? '#f87171' : '#27272a'}`,
            borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#fafafa',
            outline: 'none', textAlign: 'center',
          }}
        />
        <button type="submit" disabled={busy || !pw} style={{
          width: '100%', marginTop: 10, padding: '9px 0', borderRadius: 8, cursor: 'pointer',
          border: '1px solid #22c55e88', background: 'rgba(34,197,94,.12)',
          color: '#22c55e', fontSize: 13, fontWeight: 800,
        }}>{busy ? '…' : 'enter'}</button>
        {err && <div style={{ fontSize: 10.5, color: '#f87171', marginTop: 8 }}>not it — try again</div>}
      </form>
    </main>
  )
}
