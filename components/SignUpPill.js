'use client'

// THE FREE-BROWSE REVERSAL (2026-09-06). Donovan opened /app back up to
// signed-out visitors (proxy.js) after hearing "a brand-new site asking for
// an email before anyone's seen it is a bad first impression" and deciding
// the boards should sell themselves first. The account didn't go away —
// alerts, a saved watchlist and picks still need one (lib/dash/sync.js) — it
// just stopped being the price of admission. This pill is the one place in
// each header that says an account still exists and is worth having.
//
// Points at /login, which already bounces a signed-in visitor straight back
// to `next` (app/login/page.js) — so this never needs to know whether anyone
// is signed in. Worst case for someone who's already signed in and clicks it
// out of habit is one extra redirect back to exactly where they were.
import { useEffect, useState } from 'react'

export default function SignUpPill({ accent = '#f97316', dark = '#0d0c0a' }) {
  const [href, setHref] = useState('/login?next=%2Fapp%23sport%3Dmlb%26tab%3Dhome#create-account')

  useEffect(() => {
    const { pathname, search, hash } = window.location
    const next = encodeURIComponent(pathname + search)
    setHref(`/login?next=${next}${hash || '#create-account'}`)
  }, [])

  return (
    <a
      href={href}
      title="Free account — save your watchlist, picks and alerts across devices"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '5px 12px', borderRadius: 999,
        fontSize: 11, fontWeight: 800, letterSpacing: '.01em',
        color: dark, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
        background: `linear-gradient(90deg, ${accent}, ${accent}cc)`,
      }}
    >
      Sign up<span style={{ fontWeight: 600, opacity: .8 }}>&nbsp;· free</span>
    </a>
  )
}
