// WHEN EACH SPORT'S CARD LOCKS: THE ONE CONFIG (batch member-requests 2C, 2026-10-25). Pure. Minutes before the card's FIRST game that it locks (and that
// Donovan's entry closes), per sport. lib/card/core.js lockWindowOpen / lockAtOf and everything built on them read THESE numbers and no others,
// the way lib/card/rules.js holds the price floors. Change a number here and nowhere else.
//
// DONOVAN, 2026-10-25: "keep the system ... early enough for people to cook up": the list out about 2 hours before the game, 1:30 at the floor.
// TODAY every sport is 60. That is NOT changed here: a leak-free backtest has to hold hit rate and ROI first, and the evidence for it does not exist
// yet -- nothing stored says when lineups / goalies / starters are confirmed. The bot has logged exactly that since 2026-10-26
// (bots/lineup_first_seen.py, bbe-history public/data/current/first_seen/<day>.json: first-seen time and minutes before start, per game).
// MEASURED SO FAR (card_calls, bot rows, 45 days to 2026-10-25, at the 60-minute lock): voids NHL 0 of 56, NFL 1 of 18, MLB 2 of 11 (the World Series).
// Too few to move a number on. CANDIDATES, to be tested against the first-seen log before any change: NHL 120 (goalies known from the morning
// skate), MLB 90 (lineups post 1-2 h out; an unposted bat plays 76% against 98% posted, bots/lineups.py), NFL 120 (inactives come ~90 min out, so
// the status column carries the change), NBA 90.
//
// A change applies from the NEXT lock forward: a locked card_calls row, its line, price and model_version are never touched. A change in HOW picks
// are chosen is a new model_version (lib/card/core.js CARD_VERSION).

/** Minutes before a card's first game that it locks, per sport. */
export const LOCK_LEAD_MIN = Object.freeze({ nhl: 60, nfl: 60, mlb: 60, nba: 60 })
/** A sport with no entry locks like this. */
export const DEFAULT_LEAD_MIN = 60
/** The sport's lock lead, in minutes. */
export const leadMinFor = (sport) => LOCK_LEAD_MIN[String(sport)] ?? DEFAULT_LEAD_MIN
