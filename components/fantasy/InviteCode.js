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
//
// ── invite LINK, not just a code (2026-09-06) ───────────────────────────────
// A raw code still means "open the app, find the join form, type this in."
// The link (/fantasy?invite=CODE) drops someone straight onto that form with
// the code already filled in -- one tap on a text thread instead of a
// transcription step. The masked code above stays as the fallback for
// channels (a screenshot, a read-aloud) where a link doesn't work.

import { useEffect, useRef, useState } from 'react'

export default function InviteCode({ code, className, codeClassName, label = 'INVITE CODE' }) {
  const [shown, setShown] = useState(false)
  const [copied, setCopied] = useState(false)
  const [linkCopied, setLinkCopied] = useState(false)
  const timer = useRef(null)
  const linkTimer = useRef(null)

  useEffect(() => {
    if (!shown) return undefined
    timer.current = setTimeout(() => setShown(false), 20000)
    return () => clearTimeout(timer.current)
  }, [shown])

  useEffect(() => () => clearTimeout(linkTimer.current), [])

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

  const copyLink = async (e) => {
    e.stopPropagation()
    const link = `${window.location.origin}/fantasy?invite=${encodeURIComponent(String(code || ''))}`
    try {
      await navigator.clipboard.writeText(link)
    } catch {
      // No clipboard permission -- fall back to revealing the raw code so
      // there's still a way to hand it off.
      setShown(true)
      return
    }
    setLinkCopied(true)
    clearTimeout(linkTimer.current)
    linkTimer.current = setTimeout(() => setLinkCopied(false), 1800)
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
        <button
          type="button"
          onClick={copyLink}
          style={linkBtn}
          className={linkCopied ? 'inviteLinkPop' : undefined}
        >{linkCopied ? '✓ Link copied' : '🔗 Copy invite link'}</button>
      </span>
      <style jsx>{`
        .inviteLinkPop { animation: inviteLinkPop .42s cubic-bezier(.34,1.56,.64,1); }
        @keyframes inviteLinkPop {
          0% { transform: scale(1); }
          45% { transform: scale(1.1); }
          100% { transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .inviteLinkPop { animation: none; }
        }
      `}</style>
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

const linkBtn = {
  background: 'var(--fx-accent, #ff633e)',
  border: '1px solid transparent',
  borderRadius: 7,
  color: '#fff',
  cursor: 'pointer',
  fontFamily: 'inherit',
  fontSize: 9,
  fontWeight: 700,
  letterSpacing: '.06em',
  padding: '4px 10px',
  textTransform: 'uppercase',
}
