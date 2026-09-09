// HOW FAR BEHIND IS THIS PAGE? (2026-09-02, findings-log #35 and #37)
//
// Six season-long surfaces, six different archive windows, no staleness
// indicator on any of them:
//
//   True Price    12 nights   08-15 → 09-01
//   P/L           38 days     04-16 → 06-22
//   Score bands   62 nights   04-16 → 08-12
//   Signals       72 graded days
//   Report card   73 past nights
//   Track record  77 days     04-16 → 08-31
//
// Each states its range in small type. None of them says it is BEHIND, and
// the P/L page -- the one that answers "did this actually make money" -- was
// ten weeks out of date with nothing on the screen admitting it. Someone
// comparing any two of these is comparing different seasons and is not told.
//
// A range is not a freshness signal. "2026-04-16 → 2026-06-22" is only
// alarming if you happen to know today's date and do the subtraction. This
// turns the window into the sentence a reader actually needs: how many nights
// behind tonight it is, and whether that is normal.
//
// THE THRESHOLDS, and why they are what they are. The archive is rebuilt by
// hand off the machine that holds the 2.5 GB of results, not by the nightly
// bot, so a couple of days behind is the ordinary state of a healthy page and
// should not cry wolf. A week is worth mentioning. A month means the page is
// describing a different part of the season than the one you are living in.

export const FRESH_DAYS = 3     // within this, say nothing
export const AGING_DAYS = 10    // past this it is worth a word
export const STALE_DAYS = 30    // past this it is a different season

const YMD = /^\d{4}-\d{2}-\d{2}$/

/** Today in Eastern time — the baseball day, same clock StaleBanner uses. */
export function etToday() {
  try {
    return new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
  } catch {
    return new Date().toISOString().slice(0, 10)
  }
}

const at = (ymd) => new Date(`${ymd}T12:00:00Z`).getTime()

/**
 * @param {string} through  last date the surface covers, YYYY-MM-DD
 * @param {string} [today]  override for tests
 * @returns {{ ok: boolean, days: number, tone: 'fresh'|'aging'|'stale'|'ancient', phrase: string }}
 *   ok is false when `through` is not a date this can reason about, in which
 *   case callers should print the window alone rather than invent a claim.
 */
export function freshness(through, today = null) {
  const end = String(through || '').slice(0, 10)
  if (!YMD.test(end)) return { ok: false, days: 0, tone: 'fresh', phrase: '' }
  const now = today && YMD.test(today) ? today : etToday()
  const days = Math.max(0, Math.round((at(now) - at(end)) / 864e5))
  if (days <= FRESH_DAYS) return { ok: true, days, tone: 'fresh', phrase: 'current' }
  if (days <= AGING_DAYS) {
    return { ok: true, days, tone: 'aging', phrase: `${days} days behind tonight` }
  }
  if (days <= STALE_DAYS) {
    return { ok: true, days, tone: 'stale', phrase: `${days} days behind tonight` }
  }
  const weeks = Math.round(days / 7)
  return { ok: true, days, tone: 'ancient', phrase: `${weeks} weeks behind tonight` }
}

/** "04-16 → 06-22 · 38 nights" — the window, said the same way everywhere. */
export function windowLabel({ from, to, count, unit = 'nights' }) {
  const trim = (d) => (YMD.test(String(d || '')) ? String(d).slice(5) : String(d || ''))
  const range = from && to ? `${trim(from)} → ${trim(to)}` : trim(to) || ''
  const n = Number(count)
  return [range, Number.isFinite(n) && n > 0 ? `${n} ${unit}` : ''].filter(Boolean).join(' · ')
}
