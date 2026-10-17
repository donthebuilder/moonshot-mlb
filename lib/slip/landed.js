// HOW OFTEN CALLED PICKS LANDED TOGETHER (2026-10-17). Pure.
// For each N in 2..6: over graded nights with at least N called picks, take the night's top N called picks as they were LOCKED before the first
// game (the locked pregame record: never a recomputed or post-game list) and count the nights when all N hit.
//
// THE RECORD STARTS MONDAY (Donovan 2026-10-17: "that record starts Monday"): nothing dated before LANDED_TOGETHER_START counts, however much
// history exists. The date is a game's own date, compared as text with the call's own date, never the ET wall clock.
// A night is counted for an N only when every one of its top N calls has a result; a voided or postponed leg makes that night "not counted" for
// that N (and the panel says how many). Under MIN_NIGHTS counted nights no rate is printed, only how far along the count is.
// Nothing is typed here: every number is a count of rows handed in. No probability is printed (a score is a rank, not a chance).
export const LANDED_TOGETHER_START = '2026-10-19'
export const MIN_NIGHTS = 5
export const LANDED_SIZES = Object.freeze([2, 3, 4, 5, 6])

const monthDay = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
const weekdayMonthDay = (d) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric', timeZone: 'UTC' })

/**
 * @param {Array} calls  [{ date, name, player_id, score, result: 'hit'|'miss'|'void'|..., locked?: false }] the sport's locked, graded CALLED picks
 *        (a row with locked === false was written after first pitch and is ignored)
 * @param {{ today: string, start?: string }} o  today = the feed's own anchor date (YYYY-MM-DD); a night is graded only on a date before it
 * @returns {{ start, startsLabel, started, nights, rows:[{ n, nights, allHit, notCounted, enough, message, detail }] }}
 */
export function landedTogether(calls, { today, start = LANDED_TOGETHER_START } = {}) {
  const by = new Map()
  for (const c of calls || []) {
    if (!c || !c.date || c.locked === false || String(c.date) < start || !(String(c.date) < String(today || ''))) continue
    if (!by.has(c.date)) by.set(c.date, [])
    by.get(c.date).push(c)
  }
  // the night's own order: the board's score, best first (a night whose calls carry no score has no order, so it cannot be used)
  const nights = [...by.entries()].map(([date, list]) => {
    const ranked = list.every((c) => c.score != null && c.score !== "" && Number.isFinite(Number(c.score)))
    return { date, ranked, list: ranked ? [...list].sort((a, b) => Number(b.score) - Number(a.score) || String(a.name).localeCompare(String(b.name))) : [] }
  }).filter((n) => n.ranked)
  const started = String(today || '') >= start
  const rows = LANDED_SIZES.map((n) => {
    let counted = 0; let allHit = 0; let notCounted = 0
    for (const night of nights) {
      if (night.list.length < n) continue
      const top = night.list.slice(0, n)
      if (top.some((c) => c.result !== 'hit' && c.result !== 'miss')) { notCounted += 1; continue }
      counted += 1
      if (top.every((c) => c.result === 'hit')) allHit += 1
    }
    const enough = counted >= MIN_NIGHTS
    const message = !started
      ? `Starts ${weekdayMonthDay(start)}: counting from tonight's locked picks`
      : enough ? `${allHit} of ${counted} nights` : `Counting since ${monthDay(start)}: ${counted} of ${MIN_NIGHTS} nights so far`
    return {
      n, nights: counted, allHit, notCounted, enough: started && enough, message,
      detail: `n = ${counted} night${counted === 1 ? '' : 's'}${notCounted ? `; ${notCounted} night${notCounted === 1 ? '' : 's'} not counted (a game was voided or postponed)` : ''}`,
    }
  })
  return { start, startsLabel: weekdayMonthDay(start), started, nights: nights.length, rows }
}
