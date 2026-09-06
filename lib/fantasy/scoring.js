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

// ── WHY RAW POINTS PER GAME IS STILL THE WRONG SORT (2026-09-03) ────────────
//
// Publishing passing touchdowns fixed one distortion and immediately created
// the opposite one. Simulated against the live slate, the moment PATD lands
// the top ten becomes FOUR QUARTERBACKS with Josh Allen 1st overall -- in a
// league that starts one quarterback. That is the same error as #71 arriving
// from the other direction: a board telling a beginner to spend the first pick
// on the position they need least of.
//
// Quarterbacks score more raw points than anyone. That is not the same as
// being worth more, because you are not choosing between Allen and McCaffrey
// in a vacuum -- you are choosing between the gap from Allen to the
// quarterback you could have had instead, and the gap from McCaffrey to the
// running back you could have had instead. That gap is the whole quantity, and
// it is called value over replacement.
//
// REPLACEMENT IS DERIVED, NOT ASSUMED. It comes from this league's own
// settings: team count, whether it starts a kicker and a defence, and how many
// of each position a roster starts. Fill every dedicated slot in the league
// from the top down, then fill every FLEX from whichever RB/WR/TE are left,
// and the best man still unclaimed at each position IS replacement level --
// what you could get for nothing if you skipped that position entirely.
// Nothing here is tuned, weighted or guessed; change the league to two QBs and
// quarterbacks correctly climb.
const DEDICATED = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 }
const FLEX_POSITIONS = ['RB', 'WR', 'TE']

export function replacementLevels(players, league, scoring = 'ppr') {
  const teams = Math.max(1, Number(league?.team_count) || 10)
  const byPos = new Map()
  for (const p of players || []) {
    if (!p?.position) continue
    if (p.position === 'K' && league?.has_kicker === false) continue
    if (p.position === 'DEF' && league?.has_defense === false) continue
    if (!byPos.has(p.position)) byPos.set(p.position, [])
    byPos.get(p.position).push({ p, v: seasonValue(p, scoring) })
  }
  for (const list of byPos.values()) list.sort((a, b) => b.v - a.v)

  // 1. dedicated slots, best first
  const cursor = new Map()
  for (const [pos, list] of byPos) {
    const slots = (DEDICATED[pos] || 0) * teams
    cursor.set(pos, Math.min(slots, list.length))
  }
  // 2. flex slots, from whoever is left across RB/WR/TE
  const flexSlots = teams * 1
  const leftovers = []
  for (const pos of FLEX_POSITIONS) {
    const list = byPos.get(pos) || []
    for (let i = cursor.get(pos) || 0; i < list.length; i += 1) leftovers.push({ pos, v: list[i].v })
  }
  leftovers.sort((a, b) => b.v - a.v)
  for (const row of leftovers.slice(0, flexSlots)) cursor.set(row.pos, (cursor.get(row.pos) || 0) + 1)

  // 3. the best man nobody had to take is replacement level
  const levels = {}
  for (const [pos, list] of byPos) {
    const i = cursor.get(pos) || 0
    levels[pos] = list.length ? (list[Math.min(i, list.length - 1)]?.v ?? 0) : 0
  }
  return levels
}

// Points per game above what this league could have had for free at the same
// position. This is the sort. The number a person READS stays raw points per
// game, because "24.5" is a quantity they already understand and "+11.3 over
// replacement" is one they have to be taught -- the ordering carries the
// insight, the label carries the meaning.
export function draftValue(player, levels, scoring = 'ppr') {
  return seasonValue(player, scoring) - (levels?.[player?.position] ?? 0)
}

// True when this player's projection is missing a term the feed does not
// carry, so the UI can say so rather than presenting an incomplete number as
// a complete one.
//
// ASKED OF THE DATA, NOT OF A DATE. The QB case was closed by the bot
// publishing PATD, but a slate file that predates that change is still served
// from the data branch until the next run, and older archived slates never
// will. So the question is "does THIS row carry the term", not "has the fix
// shipped" -- which means the asterisk disappears by itself, per player, the
// moment the number behind it becomes real. A flag keyed to a deploy date
// would have gone on lying in both directions.
//
// D/ST stays partial unconditionally: sacks, interceptions, fumble recoveries
// and defensive touchdowns are absent from the payload by design (see the
// note in projectedFantasyPoints), and nothing is scheduled to add them.
export function projectionIsPartial(player) {
  const stats = player?.source_payload?.stats || {}
  if (player?.position === 'QB') return !Number.isFinite(Number(stats.PATD))
  return player?.position === 'DEF'
}

// ── THE DRAFT NUMBER, WRITTEN ONTO THE ROW (2026-09-06) ────────────────────
//
// The auto-pick lives in PL/pgSQL (run_expired_fantasy_auto_pick) and its
// fallback ranked by dashScore -- the exact sort #71 removed from the board,
// which is why an empty queue on the clock took a kicker. Postgres cannot call
// projectedFantasyPoints, so the season value is computed HERE, once, at sync
// time and stored on source_payload.season_value. The migration's ranking
// query then does the value-over-replacement arithmetic on top of it, which is
// the half that genuinely depends on league settings and cannot be precomputed.
//
// All three scorings are written because the number is league-agnostic and the
// league picks one; storing only the league's own would mean a re-sync every
// time a commissioner changed the setting.
const SCORINGS = ['ppr', 'half_ppr', 'standard']

/** Catalog rows with `analytics.season_value` filled in. */
export function withSeasonValue(catalog) {
  return (catalog || []).map((row) => {
    const player = { position: row?.position, source_payload: row?.analytics || {} }
    const season_value = {}
    for (const s of SCORINGS) season_value[s] = Number(seasonValue(player, s).toFixed(4))
    return { ...row, analytics: { ...(row?.analytics || {}), season_value } }
  })
}

export function dashScore(player) {
  // A BYE IS NOT A 50 (2026-09-06). A bye player now arrives with an EMPTY
  // `scores` object -- and `{}` is truthy, so `|| {}` never fires and `values`
  // comes back empty. He was therefore scoring the 50 meant for "no market
  // priced him", which on the Wire (sorted by exactly this, under a header
  // saying "Ranked by this week's market score") floated him above every real
  // player scoring under 50. He is not playing; he sorts last.
  if (player?.source_payload?.on_bye) return -1
  const values = Object.values(player?.source_payload?.scores || {}).map(Number).filter(Number.isFinite)
  return values.length ? Math.round(Math.max(...values)) : 50
}

export function projectedFantasyPoints(player, scoring = 'ppr') {
  const stats = player?.source_payload?.stats || {}
  const receptionValue = scoring === 'ppr' ? 1 : scoring === 'half_ppr' ? 0.5 : 0
  const position = player?.position
  // A QB's TDs are mostly passing TDs, worth 4 — charging 6 here made the
  // projection column disagree with the actual-points column beside it.
  // ── WHAT `TD` ACTUALLY IS, AND WHAT IT NEVER WAS (2026-09-03) ────────────
  //
  // This line used to charge a quarterback 4 for a TD, with a comment saying
  // "a QB's TDs are mostly passing TDs, worth 4." That was wrong about the
  // feed. In the bot, `td_actual` is `td_rec + td_rush` -- receiving plus
  // rushing, NEVER passing (bots/nfl/nfl_features.py, usage()). So a
  // quarterback's TD column is his RUSHING touchdowns, which are worth 6 like
  // anyone else's, and his passing touchdowns were absent from the payload
  // entirely rather than being folded in at 4.
  //
  // Two errors that partly hid each other: rushing TDs undercharged, passing
  // TDs missing. Josh Allen lost roughly 2 points a game to the first and 7 to
  // the second, which is most of the gap that put him 204th on a draft board
  // ranked by this function (#71).
  //
  // PATD is published by the bot as of 2026-09-03. It is read defensively
  // rather than assumed: a slate built before that change simply has no PATD
  // key, contributes nothing, and the projection stays exactly as low as it
  // was -- which is what projectionIsPartial reports to the UI. Nothing here
  // estimates a passing TD from passing yards. When the key arrives the number
  // corrects itself with no further deploy.
  let points = number(stats.RUYD) * 0.1 + number(stats.TD) * 6
  if (['RB','WR','TE'].includes(position)) points += number(stats.RECYD) * 0.1 + number(stats.REC) * receptionValue
  if (position === 'QB') points += number(stats.PAYD) * 0.04 + number(stats.PATD) * 4
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
