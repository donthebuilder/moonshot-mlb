'use client'
import { gridQuote, impliedPct, fairOdds } from './odds'
import { n as num, nameOf, teamOf, oppOf, playerId } from './player'

// 🧊 AFTER A BLANK — the bounce-back board.
//
// 2026-08-15, Donovan: "somewhere maybe on patterns or boards to show all the
// players who blanked in their last game then show them on a chart, have a
// column with price [and hit] rate ... for hits and 1 HRR."
//
// ── WHY THIS COULD NOT BE BUILT BROWSER-SIDE ────────────────────────────────
//
// The slate publishes last5 / last7 / last10 and `games_since_last_hr`. None
// of those isolate the LAST GAME, and none of them say whether he batted. The
// only league-wide source is a per-player game log — one fetch per hitter,
// ~266 of them on tab open, which is not a page.
//
// So the numbers come from the bot, out of the game log it ALREADY pulls for
// every hitter to build last5/7/10 (compute_blank_profile in
// bots/mlb_dashboard.py). Zero extra requests there; impossible here.
//
// ── THE DEFINITIONS, WHICH ARE THE WHOLE FEATURE ────────────────────────────
//
// A GAME is one he CAME TO THE PLATE in (plateAppearances >= 1). A BLANK is
// such a game with no hits. AFTER A BLANK counts every game whose
// immediately-preceding such game was a blank.
//
// THIS WAS atBats >= 1 UNTIL DONOVAN CORRECTED IT (2026-08-16): "walk only
// nights count as a blank too still counts." He is right. Gating on at-bats
// meant a man who walked twice and never got a hit dropped out of the board
// entirely — a real 0-fer discarded because a walk is not an at-bat — and it
// silently shortened the streaks of exactly the patient hitters most likely to
// be on it. A pinch-RUNNER, who never came to the plate at all, is still not a
// game: tracked-and-failed and never-batted stay different facts.
//
// The bot publishes COUNTS, never rates — `after_blank_n` rides with every
// numerator, so this file can refuse to print a percentage off four games.
//
// ── WHY A VALUE VERDICT IS ALLOWED HERE ─────────────────────────────────────
//
// lib/odds.js says, at hrPerGame: hits, H+R+RBI and total bases "get their
// price shown and NO verdict, because the only per-game numbers the slate
// carries for those are 0-100 scores and a score is not a probability."
//
// That rule is intact. It is a rule about SCORES. What this board compares to
// the price is not a score — it is a measured frequency with its denominator
// attached, in the exact situation the bet is being made in. That is the
// missing ingredient that comment names, and `fairOdds()` (added the same day,
// for "find the true price of a player to do certain things") is the function
// that was waiting for it.
//
// The sample discipline is the price of that permission:
//   · MIN_N games or it gets no verdict, no true price, and no place on the
//     chart — only a dimmed k/n in the table.
//   · The rate is always shown AS k/n, never as a bare percentage.
// A 3-for-4 is the single most confident-looking wrong number available here.

export const MIN_N = 12

export const BLANK_MARKETS = [
  { key: 'hit', label: '1+ hit', short: 'HIT', row: 'hit', threshold: 1, num: 'after_blank_hit' },
  { key: 'hrr1', label: '1+ H+R+RBI', short: 'HRR 1+', row: 'hrr', threshold: 1, num: 'after_blank_hrr1' },
  { key: 'hrr2', label: '2+ H+R+RBI', short: 'HRR 2+', row: 'hrr', threshold: 2, num: 'after_blank_hrr2' },
  { key: 'tb2', label: '2+ total bases', short: 'TB 2+', row: 'tb2', threshold: 2, num: 'after_blank_tb2' },
]

/**
 * Did he go hitless in the last game he came to the plate in?
 * Unknown is NOT false.
 *
 * PLATE APPEARANCES, NOT AT-BATS (2026-08-16). Donovan: "walk only nights
 * count as a blank too still counts." Gating on at-bats meant a man who
 * walked twice and never got a hit vanished from the board — a real 0-fer
 * dropped because a walk is not an at-bat, which quietly shortened the
 * streaks of exactly the patient hitters most likely to be on it. A
 * pinch-RUNNER, who never came to the plate at all, is still not a game.
 *
 * `last_game_pa` is published from the same run; the `|| ab` fallback is only
 * for a row locked before that field shipped, so an older slate degrades to
 * the old behaviour rather than to an empty board.
 */
export function blankedLastGame(p) {
  if (String(p?.blank_profile_status || '') !== 'ok') return false
  const pa = num(p?.last_game_pa, 0) || num(p?.last_game_ab, 0)
  return pa >= 1 && num(p?.last_game_hits, 0) === 0
}

/**
 * Is the deployed bot publishing this at all?
 *
 * Same guard shape as nflMatchupLooksReal: the bot deploys on its own schedule
 * from another repo, so the failure that bites is not a broken file, it is a
 * perfectly valid one from a bot that predates the section this lens renders.
 * Without this the board would show "0 hitters blanked last night", which is a
 * claim, and a false one.
 */
export function blankDataPublished(rows = []) {
  return (rows || []).some((p) => String(p?.blank_profile_status || '') === 'ok')
}

/** His own line from that game: "0 for 4" / "no at-bats, 2 times up". */
export function lastGamePhrase(p) {
  const ab = num(p?.last_game_ab, 0)
  const pa = num(p?.last_game_pa, 0) || ab
  const hits = num(p?.last_game_hits, 0)
  if (pa < 1) return ''
  // A walk-only night has no at-bats, so "0 for 0" would read as a man who
  // never batted — the opposite of what happened. Say what he actually did.
  const base = ab < 1 ? `no at-bats, ${pa} time${pa === 1 ? '' : 's'} up` : `${hits} for ${ab}`
  const extras = []
  if (num(p?.last_game_runs, 0) > 0) extras.push(`${num(p.last_game_runs, 0)} R`)
  if (num(p?.last_game_rbi, 0) > 0) extras.push(`${num(p.last_game_rbi, 0)} RBI`)
  return extras.length ? `${base}, ${extras.join(', ')}` : base
}

/**
 * One row per blanked hitter for one market.
 *
 * `rate` is a percentage or null; null means the sample is too thin to speak.
 * `need` is what the book's price demands. `edge` is rate − need, and exists
 * only when BOTH sides do — a price with no rate, or a rate with no price, is
 * half a comparison and gets no number.
 */
export function blankRows(players = [], odds = null, marketKey = 'hit') {
  const m = BLANK_MARKETS.find((x) => x.key === marketKey) || BLANK_MARKETS[0]
  const out = []
  for (const p of players || []) {
    if (!blankedLastGame(p)) continue
    const den = num(p?.after_blank_n, 0)
    const hitCount = num(p?.[m.num], 0)
    const thin = den < MIN_N
    const rate = den > 0 && !thin ? (100 * hitCount) / den : null

    const q = gridQuote(odds, p, m.row, m.threshold)
    const priced = q && q.matches && q.over != null
    const need = priced ? (q.implied ?? impliedPct(q.over)) : null

    out.push({
      p,
      id: playerId(p),
      name: nameOf(p),
      team: teamOf(p),
      opp: oppOf(p),
      streak: num(p?.blank_streak, 0),
      line: lastGamePhrase(p),
      den,
      count: hitCount,
      thin,
      rate,
      // His true price — what this bet would have to pay to be worth taking at
      // his own measured rate. Null whenever the rate is.
      fair: rate == null ? null : fairOdds(rate),
      quote: priced ? q : null,
      over: priced ? q.over : null,
      book: priced ? (q.best_book || q.book || '') : '',
      need,
      edge: rate != null && need != null ? rate - need : null,
    })
  }
  // Widest edge first; then, for the many rows with no edge to sort on, the
  // longest cold streak — the reason a name is on this board at all.
  out.sort((a, b) => {
    if (a.edge != null && b.edge != null) return b.edge - a.edge
    if (a.edge != null) return -1
    if (b.edge != null) return 1
    return b.streak - a.streak || (b.rate ?? -1) - (a.rate ?? -1)
  })
  return out
}

/** The group's own baseline: everyone on the board, pooled. Counts, not rates. */
export function blankPool(rows = []) {
  let n = 0
  let k = 0
  for (const r of rows) { n += r.den; k += r.count }
  return { n, k, pct: n > 0 ? (100 * k) / n : null }
}
