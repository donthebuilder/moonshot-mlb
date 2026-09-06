'use client'
// THE ACCOUNT PILL (2026-09-06). Two states, one slot in the header.
//
// SIGNED OUT — "Sign up · free". It always linked to /login (which bounces a
// signed-in visitor straight back), but it LOOKED static: no hover, no press.
// Donovan: "I just wanted it to be like push-look when you click on it."
// So it lifts on hover, sinks on press, and shows a focus ring for keyboard
// users. Points at /login#create-account with `next` = wherever you are.
//
// SIGNED IN — your name (display name, else the part of your email before
// the @), with a small menu: Account · Watchlist · Sign out. Who you are
// rides on the same /api/dash/state fetch the sync layer already makes
// (`who`), so this needs no request of its own and no client-side Supabase.
//
// THE FREE-BROWSE REVERSAL (2026-09-06) still stands: nothing on MOONSHOT
// or TUDDY needs an account; alerts, a saved watchlist and picks do. This is
// the one place in each header that says the account exists.
import { useEffect, useRef, useState } from 'react'
import { useDashAccount } from '../lib/dash/sync'
import { dashSignOut } from '../app/(front)/actions'

const pressable = {
  transition: 'transform .09s ease, filter .12s ease, box-shadow .12s ease',
  willChange: 'transform',
}

export default function SignUpPill({ accent = '#f97316', dark = '#0d0c0a', onWatchlist }) {
  const account = useDashAccount()
  const [href, setHref] = useState('/login?next=%2Fapp%23sport%3Dmlb%26tab%3Dhome#create-account')
  const [next, setNext] = useState('/app')
  const [hover, setHover] = useState(false)
  const [down, setDown] = useState(false)
  const [open, setOpen] = useState(false)
  const rootRef = useRef(null)

  useEffect(() => {
    const { pathname, search, hash } = window.location
    const n = pathname + search + (hash || '')
    setNext(n)
    setHref(`/login?next=${encodeURIComponent(pathname + search)}${hash || '#create-account'}`)
  }, [])

  // Click-away and Escape both close the menu.
  useEffect(() => {
    if (!open) return
    const away = (e) => { if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false) }
    const key = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', key)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', key) }
  }, [open])

  const lift = down ? 'translateY(1px) scale(.97)' : hover ? 'translateY(-1px)' : 'none'
  const glow = down ? 'none' : hover ? `0 4px 16px ${accent}55` : `0 1px 6px ${accent}33`

  if (account.signedIn) {
    const who = account.who || {}
    const name = (who.name || '').trim() || String(who.email || '').split('@')[0] || 'Your account'
    const initial = name.slice(0, 1).toUpperCase()
    return (
      <div ref={rootRef} style={{ position: 'relative', flexShrink: 0 }}>
        <button
          type="button"
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          onMouseEnter={() => setHover(true)}
          onMouseLeave={() => { setHover(false); setDown(false) }}
          onMouseDown={() => setDown(true)}
          onMouseUp={() => setDown(false)}
          title={who.email ? `Signed in as ${who.email}` : 'Your account'}
          style={{
            ...pressable,
            display: 'inline-flex', alignItems: 'center', gap: 7,
            padding: '4px 10px 4px 4px', borderRadius: 999, cursor: 'pointer',
            border: `1px solid ${accent}66`, background: `${accent}14`,
            color: 'inherit', fontSize: 11, fontWeight: 800, letterSpacing: '.01em',
            whiteSpace: 'nowrap', maxWidth: 160, transform: lift, boxShadow: glow,
          }}
        >
          <span aria-hidden="true" style={{
            width: 20, height: 20, borderRadius: '50%', display: 'grid', placeItems: 'center',
            background: `linear-gradient(135deg, ${accent}, ${accent}aa)`, color: dark, fontSize: 11, fontWeight: 900,
          }}>{initial}</span>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</span>
          <span aria-hidden="true" style={{ fontSize: 9, opacity: .7 }}>{open ? '▴' : '▾'}</span>
        </button>
        {open && (
          <div role="menu" style={{
            position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 60, minWidth: 190,
            background: 'var(--ms-menu-bg, #141416)', border: `1px solid ${accent}44`, borderRadius: 12,
            boxShadow: '0 12px 32px rgba(0,0,0,.45)', padding: 6, display: 'grid', gap: 2,
          }}>
            <div style={{ padding: '6px 10px 8px', fontSize: 10, opacity: .7, borderBottom: '1px solid rgba(128,128,128,.25)', marginBottom: 4, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {who.email || 'signed in'}
            </div>
            <MenuLink href="/account">⚙ Account</MenuLink>
            {onWatchlist
              ? <MenuButton onClick={() => { setOpen(false); onWatchlist() }}>⭐ Watchlist</MenuButton>
              : <MenuLink href="/app#sport=mlb&tab=you">⭐ Watchlist</MenuLink>}
            <form action={dashSignOut} style={{ display: 'contents' }}>
              <input type="hidden" name="next" value={next} />
              <MenuButton type="submit">Sign out</MenuButton>
            </form>
          </div>
        )}
      </div>
    )
  }

  return (
    <a
      href={href}
      title="Free account — save your watchlist, picks and alerts across devices"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => { setHover(false); setDown(false) }}
      onMouseDown={() => setDown(true)}
      onMouseUp={() => setDown(false)}
      onTouchStart={() => setDown(true)}
      onTouchEnd={() => setDown(false)}
      style={{
        ...pressable,
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '5px 12px', borderRadius: 999,
        fontSize: 11, fontWeight: 800, letterSpacing: '.01em',
        color: dark, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
        background: `linear-gradient(90deg, ${accent}, ${accent}cc)`,
        transform: lift, boxShadow: glow, filter: down ? 'brightness(.92)' : 'none',
        outline: 'none',
      }}
      onFocus={(e) => { e.currentTarget.style.boxShadow = `0 0 0 2px ${dark}, 0 0 0 4px ${accent}` }}
      onBlur={(e) => { e.currentTarget.style.boxShadow = glow }}
    >
      Sign up<span style={{ fontWeight: 600, opacity: .8 }}>&nbsp;· free</span>
    </a>
  )
}

const itemStyle = {
  display: 'block', width: '100%', textAlign: 'left', padding: '7px 10px', borderRadius: 8,
  fontSize: 12, fontWeight: 700, color: 'inherit', textDecoration: 'none', background: 'transparent',
  border: 'none', cursor: 'pointer', font: 'inherit',
}
function MenuLink({ href, children }) {
  const [h, setH] = useState(false)
  return <a role="menuitem" href={href} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
    style={{ ...itemStyle, background: h ? 'rgba(249,115,22,.12)' : 'transparent' }}>{children}</a>
}
function MenuButton({ children, onClick, type = 'button' }) {
  const [h, setH] = useState(false)
  return <button role="menuitem" type={type} onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)}
    style={{ ...itemStyle, background: h ? 'rgba(249,115,22,.12)' : 'transparent' }}>{children}</button>
}
