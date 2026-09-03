'use client'

// ── #75: THE CODE THAT IS THE LOCK WAS PRINTED AT DISPLAY SIZE ──────────────
//
// FRANCHISE describes itself as "invite-only by design," and then rendered the
// invite code as the largest mono text on the leagues list — 18px, letter-
// spaced, on every card, permanently. Any screenshot of that page, any screen
// share, any over-the-shoulder glance hands out join access to every league
// the person belongs to. The code is not a label; it is the credential.
//
// Hidden by default, one tap to show, one tap to copy. Not a security boundary
// — anyone who can load this page can reveal it, which is correct, they are a
// member — but it takes the credential out of every incidental capture of the
// screen, which is the whole exposure.
//
// The masked state keeps the code's real length so the row does not jump when
// it is revealed, and re-hides after 20 seconds so a tab left open does not
// quietly go back to publishing it.

import { useEffect, useRef, useState } from 'react'

export default function InviteCode({ code, className, codeClassName, label = 'INVITE CODE' }) {
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState(false)
  const timer = useRef(null)

  useEffect(() => {
    if (!shown) return undefined
    timer.current = setTimeout(() => setShown(false), 20000)
    return () => clearTimeout(timer.current)
  }, [shown])

  const copy = async (e) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(String(code || ''))
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch {
      // No clipboard permission (or an insecure origin). Reveal instead, so
      // there is always a way to get the code out of this control.
      setShown(true)
    }
  }

  const masked = '•'.repeat(Math.max(4, String(code || '').length))

  return (
    <div className={className}>
      {label ? <small>{label}</small> : null}
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <strong
          className={codeClassName}
          aria-label={shown ? `Invite code ${code}` : 'Invite code, hidden'}
          style={{ userSelect: shown ? 'text' : 'none' }}
        >{shown ? code : masked}</strong>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); setShown((v) => !v) }}
          aria-pressed={shown}
          style={btn}
        >{shown ? 'Hide' : 'Show'}</button>
        <button type="button" onClick={copy} style={btn}>{copied ? 'Copied' : 'Copy'}</button>
      </span>
    </div>
  )
}

const btn = {
  background: 'transparent',
  border: '1px solid var(--line)',
  borderRadius: 7,
  color: 'var(--muted)',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 9,
  letterSpacing: '.08em',
  padding: '3px 8px',
  textTransform: 'uppercase',
}
