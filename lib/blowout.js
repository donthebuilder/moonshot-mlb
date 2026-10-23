// 💨 BLOWOUT WATCH (2026-10-21, Donovan: "we gotta know when players are gonna get pulled ... when it's a game that's gonna be a
// blowout ... Kawhi at the number one spot ... he ain't gonna get no time in the 4th"). Shared, every sport by its own number.
//
// The flag is the BOOK's, not ours: a game is a blowout watch when the book's spread has one club favoured by AT LEAST the sport's
// number. It is a stated rule (not fitted), printed where it shows; it changes no score and grades nothing (no model_version).
// What it means for HIM comes from his own games: his minutes in his past lopsided finals against the rest (marginOf, lib/barFilters).
// Pure: no React, no network.
import { marginOf } from './barFilters'

/** A favourite by this many points (or more) = blowout watch. One place per sport; a sport not listed has no watch. */
export const BLOWOUT_SPREAD = { nba: 10 }
/** A final margin this big counts as a blowout in his own history (the bars' Blowout chip uses the same). NFL 21, NHL 4: Donovan
 * 2026-10-22 ("21 is a blowout, 4 or more is a blowout for hockey"). Their pregame watch (BLOWOUT_SPREAD) waits on a measured line. */
export const BLOWOUT_FINAL = { nba: 15, nfl: 21, nhl: 4 }

/**
 * One club's view of a game's book spread. spreadHome = the home club's spread (-7.5 = home favoured by 7.5).
 * -> null (no line / no watch number) or { watch, spread (abs), fav (abbrev), favoured (this club is the favourite) }
 */
export function blowoutFor(sport, spreadHome, { home, away, team }) {
  const at = BLOWOUT_SPREAD[sport]
  const s = Number(spreadHome)
  if (!at || spreadHome == null || !Number.isFinite(s)) return null
  const fav = s < 0 ? home : s > 0 ? away : null
  const spread = Math.abs(s)
  return { watch: spread >= at, spread, fav, favoured: fav != null && fav === team, at }
}

/**
 * His minutes in his own lopsided games against the rest, from his log rows ({ min, score }). null under `minGames` blowouts.
 * -> { blowMin, restMin, blowN, restN, at }
 */
export function minutesInBlowouts(sport, games, { minGames = 3 } = {}) {
  const at = BLOWOUT_FINAL[sport]
  if (!at) return null
  const blow = [], rest = []
  for (const g of games || []) {
    const m = Number(g.min), mg = marginOf(g.score)
    if (!Number.isFinite(m) || m <= 0 || mg == null) continue
    ;(mg >= at ? blow : rest).push(m)
  }
  if (blow.length < minGames || !rest.length) return null
  const avg = (xs) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10
  return { blowMin: avg(blow), restMin: avg(rest), blowN: blow.length, restN: rest.length, at }
}
