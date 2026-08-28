'use client'

// Server components render in the host's timezone (UTC on Vercel), which
// showed a 7:00 PM ET kickoff as 11:00 PM. Format in the viewer's browser.
export default function LocalTime({ value, mode = 'time' }) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  const text = mode === 'date'
    ? date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    : mode === 'datetime'
      ? date.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' })
      : date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  return <time dateTime={date.toISOString()} suppressHydrationWarning>{text}</time>
}
