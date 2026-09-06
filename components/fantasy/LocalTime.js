'use client'

import { useEffect, useState } from 'react'

// ── EVERY KICKOFF ON THE SITE WAS SHOWING UTC ───────────────────────────────
//
// Seen on the live lineup board, week 1: Javonte Williams' game read
// "DAL @ NYG · Mon 12:20 AM" and James Cook's "BUF @ HOU · Sun 5:00 PM". The
// real kickoffs are 2026-09-14T00:20Z and 2026-09-13T17:00Z -- Sunday 5:20 PM
// and Sunday 10:00 AM in Phoenix. Both were the raw UTC clock, and the first
// one moved a Sunday afternoon game onto Monday. On the one screen whose whole
// job is "decide who to start before his game locks", that is not a cosmetic
// bug: it tells you there is a day left when there are four hours.
//
// The cause was this component computing the string DURING RENDER. It is a
// client component, but it still renders once on the server -- in UTC, because
// that is Vercel's clock -- and then React hydrates. `suppressHydrationWarning`
// (added to silence the resulting mismatch) does not merely hide the warning:
// React deliberately does NOT patch text it has been told to ignore. So the
// server's UTC string was the FINAL string, and the client never corrected it.
// The attribute intended to hide a symptom was preserving the bug.
//
// Formatting in an effect instead forces a real client render after mount, at
// which point Intl uses the viewer's own zone. The first paint still carries
// the server's UTC text -- it has to, or hydration mismatches for real -- so
// there is one frame of the old value before it settles, which is the standard
// trade and is invisible next to being a day wrong.
function format(date, mode) {
  if (mode === 'date') return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  if (mode === 'datetime') return date.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
}

export default function LocalTime({ value, mode = 'time' }) {
  const date = value ? new Date(value) : null
  const valid = Boolean(date) && !Number.isNaN(date.getTime())
  // Server and first client render agree (both UTC on Vercel); the effect then
  // re-renders in the viewer's zone.
  const [text, setText] = useState(() => (valid ? format(date, mode) : ''))

  useEffect(() => {
    if (!value) return
    const next = new Date(value)
    if (Number.isNaN(next.getTime())) return
    setText(format(next, mode))
  }, [value, mode])

  if (!valid) return null
  return <time dateTime={date.toISOString()} suppressHydrationWarning>{text}</time>
}
