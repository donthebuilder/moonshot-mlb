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
// the server's string -- it has to, or hydration mismatches for real -- so
// there is one frame of another value before it settles, which is the standard
// trade. What that first string SAYS is the next note's problem.
// ── AND THE FIRST PAINT WAS STILL UTC (2026-09-07) ──────────────────────────
//
// The effect above fixed the FINAL string. It did not fix the one people
// actually read: the server still renders in Vercel's UTC, so the first paint
// of every kickoff on the site was the raw UTC clock -- "Sun 5:00 PM" for a
// game that starts at 10:00 AM in Phoenix -- and for a Sunday night game the
// first paint still lands on Monday. On a slow phone that wrong string is on
// screen for the whole of a page load, and a trade card carrying `mode="date"`
// showed "Sun, Sep 6" server-side and "Mon, Sep 7" after hydration for the
// same trade.
//
// The first paint cannot be the viewer's zone -- the server does not know it,
// and inventing one would mismatch hydration for real. So it is EASTERN, which
// is the zone the NFL schedules in, and it says ET while it is. For a US
// viewer that is either right or off by hours in the correct direction, and no
// Sunday kickoff lands on Monday any more, which was the damage. (A bare
// timestamp within a couple of hours of midnight can still change date when it
// settles; nothing the server can do about that without knowing the zone, and
// it is now hours rather than most of a day.) After mount it re-formats in the
// viewer's own zone and the label goes away, because a time in your own zone
// does not need one.
const ET = 'America/New_York'

function format(date, mode, timeZone) {
  const zone = timeZone ? { timeZone } : {}
  if (mode === 'date') return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', ...zone })
  if (mode === 'datetime') return date.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', ...zone })
  return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...zone })
}

// A date needs no zone suffix -- "Sun, Sep 6" is not a clock reading.
const stamp = (date, mode) => (mode === 'date' ? format(date, mode, ET) : `${format(date, mode, ET)} ET`)

export default function LocalTime({ value, mode = 'time' }) {
  const date = value ? new Date(value) : null
  const valid = Boolean(date) && !Number.isNaN(date.getTime())
  // Server and first client render agree (both Eastern, explicitly); the effect
  // then re-renders in the viewer's own zone.
  const [text, setText] = useState(() => (valid ? stamp(date, mode) : ''))

  useEffect(() => {
    if (!value) return
    const next = new Date(value)
    if (Number.isNaN(next.getTime())) return
    setText(format(next, mode))
  }, [value, mode])

  if (!valid) return null
  return <time dateTime={date.toISOString()} suppressHydrationWarning>{text}</time>
}
