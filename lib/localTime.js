// THE ONE TIME FORMATTER FOR THE HEADER, THE TICKERS AND THE GAME CHIPS
// (2026-10-06, header pass; audit X11: "Thu 5:15 PM" in the viewer's zone and
// "Thu 8:15 PM ET" in the same card, "6:51 PM UTC" on a player page).
//
// A time shown to a visitor is in THEIR zone and says so once, at the end:
// "5:15 PM MST". The label is the browser's own short zone name
// (Intl timeZoneName:'short' -- "MST", "PDT", "EDT"; outside the US it is
// "GMT+1", still a true label). Never the server's zone, never a hard-coded
// ET. Call it from the client (an effect, or data that arrives after mount):
// a time formatted during server render would carry the server's zone.
//
// This does not move a game's DATE: a slate's day is the game's own date
// (CLAUDE.md), keyed elsewhere. This only draws a clock time.

const parse = (v) => { const t = v instanceof Date ? v : new Date(v); return Number.isFinite(t.getTime()) ? t : null }

/** "5:15 PM MST" -- the viewer's zone, labelled once. '' for an unusable value. */
export function localTime(v, { zone = true } = {}) {
  const t = parse(v)
  if (!t) return ''
  try {
    return t.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', ...(zone ? { timeZoneName: 'short' } : {}) })
  } catch { return '' }
}

/** "Thu 5:15 PM MST" -- the same, with the weekday. */
export function localDayTime(v, { zone = true } = {}) {
  const t = parse(v)
  if (!t) return ''
  try {
    return t.toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit', ...(zone ? { timeZoneName: 'short' } : {}) })
  } catch { return '' }
}

/** The viewer's zone, short ("MST"). */
export function localZone(at = new Date()) {
  try { return new Intl.DateTimeFormat('en-US', { timeZoneName: 'short' }).formatToParts(at).find((p) => p.type === 'timeZoneName')?.value || '' } catch { return '' }
}
