import { useEffect, useState } from 'react'

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

const parse = (v) => { if (v === null || v === undefined || v === '' || typeof v === 'boolean') return null; const t = v instanceof Date ? v : new Date(v); return Number.isFinite(t.getTime()) ? t : null }

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

// ── THE REST OF THE SITE (2026-10-07, header gaps; audit X11) ───────────────
// HYDRATION: every function above and below reads the BROWSER's zone, so a time
// drawn during server render would carry the server's zone (UTC on Vercel) and
// differ from the client's first paint. The rule that keeps them equal: call
// these only where the value arrives after mount (fetched data, an effect) or
// pass `mounted` from useMounted() below -- before mount a placeholder
// ('' / the fallback) is returned, on the server and on the client's first
// render alike, so the two agree and the real time appears one frame later.


/** false on the server and on the client's first render; true after mount. */
export function useMounted() {
  const [m, setM] = useState(false)
  useEffect(() => { setM(true) }, [])
  return m
}

/** "Thu 5:15 PM MST" or "5:15 PM" -- a kickoff / first pitch / puck drop / tip, for a list where the
 *  zone is named once for the whole section (`zone:false`) or once beside the time (`zone:true`). */
export const localClock = (v) => localTime(v, { zone: false })

const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11 }
// The bot's own stamps carry a fixed zone word: "Oct 6, 6:51 PM UTC", "Aug 14, 3:16 AM PHX"
// (Phoenix = UTC-7 all year). Anything else is left as the bot wrote it.
const STAMP_OFFSET = { UTC: 0, GMT: 0, PHX: -7 }

/** "Oct 6, 6:51 PM UTC" -> "Oct 6, 11:51 AM MST" (the viewer's zone). Unparseable -> the text unchanged.
 *  The stamp has no year: the nearest one not in the future is taken. `now` is injectable for tests. */
export function localStamp(text, { now = Date.now() } = {}) {
  const s = String(text ?? '').trim()
  const m = /^([A-Za-z]{3})[a-z]*\s+(\d{1,2}),\s*(\d{1,2}):(\d{2})\s*([AP]M)\s+([A-Z]{3})$/i.exec(s)
  if (!m) return s
  const mon = MONTHS[m[1].toLowerCase()]
  const off = STAMP_OFFSET[m[6].toUpperCase()]
  if (mon === undefined || off === undefined) return s
  let h = Number(m[3]) % 12 + (m[5].toUpperCase() === 'PM' ? 12 : 0)
  const year = new Date(now).getUTCFullYear()
  let t = Date.UTC(year, mon, Number(m[2]), h - off, Number(m[4]))
  if (t > now + 36e5 * 26) t = Date.UTC(year - 1, mon, Number(m[2]), h - off, Number(m[4]))
  try {
    return new Date(t).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short' })
  } catch { return s }
}

/** The instant (ms) a given hour reads on the New York wall clock on New York's date of `at`
 *  -- "the 1am ET build" -- so it can be shown in the viewer's zone. DST-safe (checks the
 *  hour it lands on). A rule stated in ET keeps its ET meaning; this only draws it for the viewer. */
export function etWallInstant(hour, at = Date.now()) {
  try {
    const f = (o, ms) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hourCycle: 'h23', ...o }).formatToParts(new Date(ms))
    const g = (parts, t) => Number(parts.find((p) => p.type === t)?.value)
    const p = f({ year: 'numeric', month: 'numeric', day: 'numeric' }, at)
    for (const off of [5, 4]) {
      const ms = Date.UTC(g(p, 'year'), g(p, 'month') - 1, g(p, 'day'), hour + off)
      if (g(f({ hour: 'numeric' }, ms), 'hour') === hour) return ms
    }
  } catch { /* fall through */ }
  return NaN
}
