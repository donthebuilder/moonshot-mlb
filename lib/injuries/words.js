// Plain words for the injury surfaces. Pure. The unavailable and stale states are worded here ONCE so no page can say
// "nobody is out" when the truth is "we could not read the report".
export const UNAVAILABLE_LINE = 'Injury report unavailable. We could not read it just now, so we are not saying who is or is not out.'
export const NONE_LINE = 'No one listed out, doubtful or questionable on the injury report for these two clubs.'
export const STALE_LINE = 'The injury report may be out of date. Check again near game time.'

/** "Updated Oct 10, 2:14 PM ET"-style label from an ISO time; '' when there is none. */
export function updatedLabel(iso, now = Date.now()) {
  const t = Date.parse(iso || '')
  if (!Number.isFinite(t)) return ''
  const mins = Math.round((now - t) / 60000)
  if (mins >= 0 && mins < 60) return `updated ${Math.max(mins, 1)} min ago`
  if (mins >= 0 && mins < 36 * 60) return `updated ${Math.round(mins / 60)} h ago`
  const d = new Date(t)
  return `updated ${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' })}`
}

/** The slate / game row count: "3 out" (OUT, injured list, doubtful); '' when none or when the report is unavailable. */
export function outCount(entries, blocks) {
  const n = (entries || []).filter((e) => blocks.has(e.status)).length
  return n ? `${n} out` : ''
}
