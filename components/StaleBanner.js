'use client'
import { useEffect, useState } from 'react'
import { C, NUM_FONT } from '../lib/theme'

// ⚠️ IS THIS TONIGHT'S SLATE? (2026-08-09)
//
// Donovan: "does the site tell you when the bot didn't run? — fix that too."
// It did not, and this is the failure mode that costs the most trust for the
// least drama: nothing breaks, nothing errors, no empty state fires. The bot's
// workflow fails, the data branch keeps serving YESTERDAY's slate, and the
// site renders it under today's greeting with today's date in the header. You
// read a full board of picks for games that have already been played.
//
// Every other honesty mechanism on this site is downstream of one assumption —
// that the payload is for the slate you think you're looking at. Storylines
// date-gate, the context pack date-gates, results date-gate. None of them can
// help here, because they'd all be *correctly* gating against a stale slate
// date and quietly showing nothing, which reads as "quiet night" rather than
// "the bot is down".
//
// THE CHECK. The payload publishes its own `date` / `slate_date`. Compare it
// to the date it SHOULD be, in Eastern time — because the baseball day and the
// bot's cron both live in ET, and a user in Los Angeles at 10pm is already on
// tomorrow's date in local time while the slate is legitimately still today's.
// Using the browser's local date here would fire a false alarm every night on
// the west coast.
//
// THE GRACE WINDOW. The daily build lands around 1am ET, so between midnight
// and the run the previous slate is genuinely the current one. Before 9am ET a
// behind-by-one slate is stated calmly; after that it's a real failure and the
// banner says so plainly. Two or more days behind is always loud.

const etParts = () => {
  const d = new Date()
  const date = d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  const hour = Number(d.toLocaleString('en-US', { timeZone: 'America/New_York', hour: '2-digit', hour12: false }))
  return { date, hour: Number.isFinite(hour) ? hour : 12 }
}

const addDays = (ymd, n) => {
  // Parsed at UTC NOON so a day step can't be eaten by a timezone offset.
  const t = new Date(`${ymd}T12:00:00Z`).getTime() + n * 864e5
  return new Date(t).toISOString().slice(0, 10)
}

const daysBetween = (a, b) => Math.round(
  (new Date(`${a}T12:00:00Z`).getTime() - new Date(`${b}T12:00:00Z`).getTime()) / 864e5,
)

export default function StaleBanner({ slateDate = '', mode = 'today', loading = false }) {
  // Re-check on a slow timer so a tab left open overnight notices the rollover
  // rather than sitting on the assumption it made when it was opened.
  const [now, setNow] = useState(null)
  useEffect(() => {
    setNow(etParts())
    const id = setInterval(() => setNow(etParts()), 10 * 60_000)
    return () => clearInterval(id)
  }, [])

  // Rendered only once we know the ET clock — computing it during render would
  // make the server and the client disagree.
  if (!now || loading) return null
  if (!slateDate) return null

  const expected = mode === 'tomorrow' ? addDays(now.date, 1) : now.date
  const behind = daysBetween(expected, slateDate)
  if (behind <= 0) return null   // current, or ahead — nothing to say

  const early = behind === 1 && now.hour < 9
  const col = early ? '#FCD34D' : '#f87171'

  return (
    <div style={{
      background: `linear-gradient(155deg, ${col}14, ${col}05)`,
      border: `1px solid ${col}55`, borderRadius: 12,
      padding: '10px 14px', marginBottom: 12,
    }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'baseline', flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13 }}>{early ? '🕐' : '⚠️'}</span>
        <span style={{ fontSize: 12, fontWeight: 900, color: col }}>
          {early
            ? 'Tonight’s slate hasn’t published yet'
            : `This is not ${mode === 'tomorrow' ? 'tomorrow’s' : 'tonight’s'} slate`}
        </span>
        <span style={{ fontSize: 9.5, color: C.text3, fontFamily: NUM_FONT }}>
          showing {slateDate} · {behind} day{behind === 1 ? '' : 's'} behind
        </span>
      </div>
      <div style={{ fontSize: 10.5, color: C.text2, lineHeight: 1.6, marginTop: 5, maxWidth: 720 }}>
        {early ? (
          <>
            The daily build normally lands around <b>1am ET</b> and it hasn’t yet, so everything below is
            still <b style={{ color: col }}>{slateDate}</b>. Nothing here is wrong — it’s just the previous
            night. It’ll swap over on its own once the bot publishes.
          </>
        ) : (
          <>
            The bot hasn’t published a newer slate, so every board, pick and score below belongs to{' '}
            <b style={{ color: col }}>{slateDate}</b> — games that have already been played.{' '}
            <b>Don’t read these as tonight’s picks.</b> This usually means the scheduled run failed;
            the site is read-only and can’t fix it from here.
          </>
        )}
      </div>
    </div>
  )
}
