'use client'
import { useEffect, useState } from 'react'
import { useDashAccount } from '../../lib/dash/sync'
import { dashSignOut } from '../../app/(front)/actions'

// THE ACCOUNT, IN THE MORE DRAWER ON A PHONE (2026-10-06, audit X3). The
// header's "Sign up · free" pill was 23px tall and took a third of the phone
// header's width; the phone header (components/header/HeaderShell.js) drops
// it and the drawer carries it instead, as plain 44px rows (no dropdown to
// open inside a drawer). Signed out: one "Sign up · free" row, the same
// /login#create-account target SignUpPill uses. Signed in: who you are, then
// Account, Watchlist, Sign out.
const row = { font: 'inherit', fontWeight: 800, display: 'flex', alignItems: 'center', width: '100%', minHeight: 44, padding: '0 12px', borderRadius: 12, fontSize: 15, textDecoration: 'none', border: 0, cursor: 'pointer', textAlign: 'left' }

export default function MoreAccount({ accent, theme, onNavigate }) {
  const account = useDashAccount()
  const [here, setHere] = useState({ href: '/login#create-account', next: '/app' })
  useEffect(() => {
    const { pathname, search, hash } = window.location
    setHere({ href: `/login?next=${encodeURIComponent(pathname + search)}${hash || '#create-account'}`, next: pathname + search + (hash || '') })
  }, [])
  if (!account.signedIn) {
    return (
      <a href={here.href} onClick={onNavigate} style={{ ...row, justifyContent: 'center', background: accent, color: theme.bg }}>
        Sign up<span style={{ fontWeight: 600, opacity: 0.8 }}>&nbsp;· free</span>
      </a>
    )
  }
  const who = account.who || {}
  const name = (who.name || '').trim() || String(who.email || '').split('@')[0] || 'Your account'
  const item = { ...row, background: theme.bg, border: `1px solid ${theme.border}`, color: theme.text }
  return (
    <div style={{ display: 'grid', gap: 6 }}>
      <div style={{ fontSize: 12, color: theme.text3, padding: '0 3px' }}>Signed in as <strong style={{ color: theme.text2 }}>{name}</strong></div>
      <a href="/account" onClick={onNavigate} style={item}>⚙ Account</a>
      <a href="/app#sport=mlb&tab=you" onClick={onNavigate} style={item}>⭐ Watchlist</a>
      <form action={dashSignOut} style={{ display: 'contents' }}>
        <input type="hidden" name="next" value={here.next} />
        <button type="submit" style={item}>Sign out</button>
      </form>
    </div>
  )
}
