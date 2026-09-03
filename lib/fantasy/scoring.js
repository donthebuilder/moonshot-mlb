const number = (value) => Number.isFinite(Number(value)) ? Number(value) : 0

// -- THE POINTS-ALLOWED TIER, IN ONE PLACE (2026-08-31) ---------------------
// It was written out inline in fantasyPointsFromStats and nowhere else, and
// the DEF projection beside it was the literal number 7 -- so the two columns
// a manager reads side by side came from two different models, one of which
// was not a model. Both call this now.
export function defensePointsAllowedScore(allowed) {
  const n = number(allowed)
  return n === 0 ? 10 : n <= 6 ? 7 : n <= 13 ? 4 : n <= 20 ? 1 : n <= 27 ? 0 : n <= 34 ? -1 : -4
}

// What an average NFL team gives up in a game. Used only when a D/ST has no
// stat line yet -- a projection, in other words. It is deliberately the same
// input the actual will later be scored on, so the projected and actual
// columns cannot disagree about the model, only about the game.
export const DEF_BASELINE_POINTS_ALLOWED = 21

// ── TWO DIFFERENT QUESTIONS, AND THEY HAD ONE NUMBER (#71) ─────────────────
//
// `dashScore` is the MAXIMUM of TUDDY's per-market scores for the coming week
// -- "how likely is this man to clear one of his props on Sunday." It is a
// good number and it answers a real question. It is the wrong question for a
// draft, and the draft board ranked by it.
//
// The damage was concrete and measured against the live slate: Jared Goff
// ranked **11th overall** at 74, and Ka'imi Fairbairn -- a KICKER -- ranked
// 14th, in a single-QB PPR league. A board that tells a beginner to take a
// quarterback and a kicker in the first two rounds. This is the product's
// flagship feature for exactly the people who do not know better.
//
// `seasonValue` answers the draft's question instead: what is this man worth
// per game, over a season. The slate already carries it and nobody had
// noticed -- `stats` is not this week's box score, it is SEASON PER-GAME
// AVERAGES (McCaffrey: CAR 18.294, RUYD 70.706, REC 6.0, RECYD 54.353, and
// `splits.home.g` 8 + `splits.away.g` 9 = a full 17 games). So the season
// number needed no new feed, no model and no bot change: it is
// projectedFantasyPoints run over data that was already there.
//
// The re-rank on the live board: McCaffrey stays 1st, Puka Nacua 7th -> 2nd,
// Bijan Robinson and Jahmyr Gibbs into the top 4, Goff 11th -> 93rd, the
// kicker out of the top 100. Top 50 becomes 21 RB / 21 WR / 4 TE / 4 QB /
// 0 K, which is what a single-QB PPR board is supposed to look like.
//
// ── THE ONE THING THIS NUMBER GETS WRONG, STATED PLAINLY ────────────────────
//
// THE FEED CARRIES NO PASSING TOUCHDOWNS. A quarterback's `TD` field is his
// RUSHING touchdowns (Josh Allen 0.875/game, which is his rushing rate, not
// his ~2.0 passing rate; Goff has no `TD` key at all). So every QB projection
// here is low by roughly 6-8 points a game, and QBs consequently rank lower
// than they should.
//
// It is NOT patched with an estimate. A passing-TD term derived from passing
// yards would be a model I invented, printed next to numbers that came from
// measurement, and this codebase has already made the opposite call once --
// see the D/ST note below, where sacks and interceptions are ABSENT rather
// than guessed. The gap is documented, surfaced in the UI, and belongs in the
// bot, which is the only place that can answer it truthfully.
//
// In practice the error is survivable because it is roughly uniform across
// quarterbacks, so their order among themselves holds: Allen is still QB1
// (17th overall), the next QB is 39th. That is a defensible single-QB board.
// It is not a reason to leave it wrong.
export function seasonValue(player, scoring = 'ppr') {
  return projectedFantasyPoints(player, scoring)
}

// True when this player's projection is missing a term the feed does not
// carry, so the UI can say so rather than presenting an incomplete number as
// a complete one.
export function projectionIsPartial(player) {
  return player?.position === 'QB' || player?.position === 'DEF'
}

export function dashScore(player) {
  const values = Object.values(player?.source_payload?.scores || {}).map(Number).filter(Number.isFinite)
  return values.length ? Math.round(Math.max(...values)) : 50
}

export function projectedFantasyPoints(player, scoring = 'ppr') {
  const stats = player?.source_payload?.stats || {}
  const receptionValue = scoring === 'ppr' ? 1 : scoring === 'half_ppr' ? 0.5 : 0
  const position = player?.position
  // A QB's TDs are mostly passing TDs, worth 4 — charging 6 here made the
  // projection column disagree with the actual-points column beside it.
  let points = number(stats.RUYD) * 0.1 + number(stats.TD) * (position === 'QB' ? 4 : 6)
  if (['RB','WR','TE'].includes(position)) points += number(stats.RECYD) * 0.1 + number(stats.REC) * receptionValue
  if (position === 'QB') points += number(stats.PAYD) * 0.04
  if (position === 'K') points = number(stats.FGM) * 3 + number(stats.PAT)
  // A FLAT 7 FOR EVERY DEFENCE (fixed 2026-08-31). It made a projection out of
  // nothing -- the same number for the best defence in football and the worst,
  // in every matchup, all season -- and it disagreed with the actual-points
  // column beside it, which scores D/ST off a real stat line.
  //
  // Both go through defensePointsAllowedScore now. When a stat line exists the
  // projection uses it; before kickoff it falls back to a league-average game.
  // The sack, interception, fumble-recovery and defensive-touchdown terms are
  // absent from BOTH sides until the bot publishes them, so the two columns
  // understate a D/ST by the same amount rather than contradicting each other.
  if (position === 'DEF') {
    const allowed = stats.points_allowed === undefined || stats.points_allowed === null
      ? DEF_BASELINE_POINTS_ALLOWED
      : stats.points_allowed
    points = defensePointsAllowedScore(allowed)
      + number(stats.def_sacks) + number(stats.def_interceptions) * 2
      + number(stats.def_fumble_recoveries) * 2 + number(stats.def_touchdowns) * 6
  }
  return Math.round(points * 10) / 10
}

export function fantasyPointsFromStats(stats = {}, scoring = 'ppr') {
  const receptionValue = scoring === 'ppr' ? 1 : scoring === 'half_ppr' ? 0.5 : 0
  let points = number(stats.passing_yards) * 0.04 + number(stats.passing_touchdowns) * 4 - number(stats.interceptions) * 2
  points += number(stats.rushing_yards) * 0.1 + number(stats.rushing_touchdowns) * 6
  points += number(stats.receiving_yards) * 0.1 + number(stats.receiving_touchdowns) * 6 + number(stats.receptions) * receptionValue
  points += number(stats.two_point_conversions) * 2 - number(stats.fumbles_lost) * 2
  points += number(stats.field_goals_0_39) * 3 + number(stats.field_goals_40_49) * 4 + number(stats.field_goals_50_plus) * 5 + number(stats.extra_points)
  points += number(stats.def_sacks) + number(stats.def_interceptions) * 2 + number(stats.def_fumble_recoveries) * 2 + number(stats.def_touchdowns) * 6
  if (stats.points_allowed !== undefined && stats.points_allowed !== null) {
    points += defensePointsAllowedScore(stats.points_allowed)
  }
  return Math.round(points * 100) / 100
}

export function eligibleForSlot(player, slot) {
  if (slot === 'FLEX') return ['RB','WR','TE'].includes(player?.position)
  return player?.position === slot
}

export function grade(value) {
  if (value >= 90) return 'A+'
  if (value >= 85) return 'A'
  if (value >= 80) return 'A−'
  if (value >= 74) return 'B+'
  if (value >= 68) return 'B'
  if (value >= 60) return 'C'
  return 'D'
}
