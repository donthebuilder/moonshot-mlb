// ⏱ ONE CLOCK FOR EVERY QUOTE (2026-08-29).
//
// Pass 3 taught the Odds page that a 12-day-old board is not "tonight's" —
// but Props cards, player modals, boards and pair builders were still
// wearing the same stale prices, because each of them takes the odds payload
// as a prop and none of them asked how old it was. This is the shared clock.
//
// The choke point is the dashboards: they fetch the payload once and pass it
// everywhere, so they gate it ONCE with liveOdds() and every consumer
// downstream — all of which already render cleanly with odds == null —
// inherits the rule for free. The Odds tab alone still receives the raw
// payload, because its EXPIRED panel needs the pull date to say what
// happened.
//
// fetched_at is the bot's ISO stamp (bots/odds_fetch.py and
// bots/nfl/nfl_odds_fetch.py both publish it, alongside fetched_at_human).
// If neither stamp parses we FAIL OPEN: an unparseable date on a fresh
// payload should never blank real prices — the gate exists for the payload
// we can prove is old, not the one we can't read.

export const ODDS_STALE_HOURS = 24

export function oddsFetchedMs(odds) {
  const iso = Date.parse(odds?.fetched_at || '')
  if (Number.isFinite(iso)) return iso
  // "Aug 17, 4:02 AM UTC" — Date.parse handles it once UTC reads as GMT.
  const human = Date.parse(String(odds?.fetched_at_human || '').replace(' UTC', ' GMT'))
  return Number.isFinite(human) ? human : NaN
}

export function oddsAgeHours(odds) {
  const ms = oddsFetchedMs(odds)
  return Number.isFinite(ms) ? (Date.now() - ms) / 3_600_000 : null
}

export function oddsExpired(odds) {
  const age = oddsAgeHours(odds)
  return age != null && age >= ODDS_STALE_HOURS
}

// The payload if it is fresh enough to show as prices, else null.
export function liveOdds(odds) {
  if (!odds) return null
  return oddsExpired(odds) ? null : odds
}
