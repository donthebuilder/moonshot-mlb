'use client'
// /ask — THE ANSWER. Type a name, copy a post.
//
// Built for one situation and no other: Donovan on his phone, mid-game,
// wanting to reply to a baseball conversation with something only CALLED IT
// knows, in under twenty seconds. Everything here serves that.
//
// MOBILE FIRST, LITERALLY (project rule #23). The input is 16px so iOS does
// not zoom on focus, the answer sits above the fold, and COPY is a full-width
// target you can hit without looking. There is no nav, no tabs, no chrome --
// this is a tool, not a page of the site.
//
// The 4MB board never reaches the phone: /api/ask does the lookup server-side
// and returns a few hundred bytes. See that route's own header.
import { useCallback, useEffect, useRef, useState } from 'react'

const INK = '#efe9dd'
const ORANGE = '#f4581f'
const DIM = '#8f8a83'
const PANEL = '#12100e'
const RULE = 'rgba(239,233,221,0.15)'

export default function Ask() {
  const [q, setQ] = useState('')
  const [res, setRes] = useState(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState('')
  const timer = useRef(null)
  const seq = useRef(0)

  useEffect(() => {
    clearTimeout(timer.current)
    if (q.trim().length < 2) { setRes(null); return }
    // 250ms is enough to stop a request per keystroke without the answer
    // feeling like it lags behind the typing.
    timer.current = setTimeout(async () => {
      const mine = ++seq.current
      setBusy(true)
      try {
        const r = await fetch(`/api/ask?q=${encodeURIComponent(q.trim())}`, { cache: 'no-store' })
        const j = await r.json()
        // An older request that lands after a newer one must not overwrite it.
        if (mine === seq.current) setRes(j)
      } catch {
        if (mine === seq.current) setRes({ error: 'lookup-failed' })
      } finally {
        if (mine === seq.current) setBusy(false)
      }
    }, 250)
    return () => clearTimeout(timer.current)
  }, [q])

  const copy = useCallback(async (text, key) => {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // Safari refuses the async clipboard outside a user gesture in some
      // contexts; the textarea trick still works and costs nothing.
      const ta = document.createElement('textarea')
      ta.value = text
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* nothing else to try */ }
      document.body.removeChild(ta)
    }
    setCopied(key)
    setTimeout(() => setCopied(''), 1400)
  }, [])

  const hits = res?.hits || []
  const off = res?.offBoard

  return (
    <main style={{ minHeight: '100dvh', background: '#0a0908', color: INK, padding: '20px 16px 48px', fontFamily: 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: 3 }}>CALLED IT</span>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 2.4, color: ORANGE }}>THE ANSWER</span>
          <span style={{ marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: DIM }}>{res?.slate_date || ''}</span>
        </div>
        <p style={{ fontSize: 12.5, color: DIM, margin: '6px 0 14px' }}>
          Type a hitter. Get a post you can paste into a reply.
        </p>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="judge, pena, elly…"
          autoFocus
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '14px 16px',
            // 16px exactly: anything smaller makes iOS zoom the page on focus.
            fontSize: 16, fontWeight: 700, color: INK, background: PANEL,
            border: `1px solid ${RULE}`, borderRadius: 6, outline: 'none',
          }}
        />

        <div style={{ minHeight: 18, fontSize: 11.5, color: DIM, padding: '8px 2px' }}>
          {busy ? 'looking…' : res?.error ? 'Lookup failed — try again.' : ''}
        </div>

        {hits.map((h) => (
          <div key={h.player_id} style={{ border: `1px solid ${h.called ? `${ORANGE}66` : RULE}`, background: PANEL, borderRadius: 6, padding: 14, marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 19, fontWeight: 800 }}>{h.name}</span>
              <span style={{ fontSize: 12.5, fontWeight: 700, color: DIM }}>
                {[h.team, h.opp ? `vs ${h.opp}` : '', h.pitcher].filter(Boolean).join(' · ')}
              </span>
            </div>
            <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: 1.4, color: h.called ? ORANGE : INK, margin: '8px 0 10px' }}>
              {h.state}
              {h.lineup_confirmed ? '' : '  · lineup not posted yet'}
            </div>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.45, color: INK, background: 'rgba(255,255,255,0.03)', border: `1px solid ${RULE}`, borderRadius: 4, padding: 12, margin: 0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{h.text}</pre>
            <button
              onClick={() => copy(h.text, h.player_id)}
              style={{ width: '100%', marginTop: 10, padding: '14px 0', fontSize: 14, fontWeight: 800, letterSpacing: 2, color: '#0a0908', background: copied === h.player_id ? '#7bd88f' : ORANGE, border: 'none', borderRadius: 4, cursor: 'pointer' }}
            >
              {copied === h.player_id ? 'COPIED' : 'COPY'}
            </button>
          </div>
        ))}

        {off ? (
          <div style={{ border: `1px solid ${RULE}`, background: PANEL, borderRadius: 6, padding: 14 }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, letterSpacing: 1.4, color: DIM, marginBottom: 10 }}>{off.state}</div>
            <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, lineHeight: 1.45, color: INK, background: 'rgba(255,255,255,0.03)', border: `1px solid ${RULE}`, borderRadius: 4, padding: 12, margin: 0, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace' }}>{off.text}</pre>
            <button
              onClick={() => copy(off.text, 'off')}
              style={{ width: '100%', marginTop: 10, padding: '14px 0', fontSize: 14, fontWeight: 800, letterSpacing: 2, color: '#0a0908', background: copied === 'off' ? '#7bd88f' : ORANGE, border: 'none', borderRadius: 4, cursor: 'pointer' }}
            >
              {copied === 'off' ? 'COPIED' : 'COPY'}
            </button>
          </div>
        ) : null}
      </div>
    </main>
  )
}
