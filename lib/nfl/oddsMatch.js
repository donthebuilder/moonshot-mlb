'use client'

// 💰 NFL ODDS — the book's line next to the model's rank.
//
// The NFL sibling of lib/odds.js (MLB). A FORK, not a shared import: the
// market map and the line each market has to clear are genuinely different
// per sport (nfl_scoring.MODELS's seven bars vs MLB's fixed HR/HIT/HRR/
// CONTACT bars), and this project's existing split already draws that line at
// "per sport" — lib/myPicks.js vs lib/nfl/myPicks.js, lib/theme.js vs
// lib/nfl/theme.js — so this follows the same pattern rather than reaching
// into a file named for the other sport for a mapping table that would be
// wrong for football. fmtOdds/impliedPct/normName are the same MATH as
// lib/odds.js's copies (American-odds arithmetic doesn't change per sport)
// but are duplicated here rather than imported, for the same reason.
//
// The bot publishes nfl_odds_latest.json (bots/nfl/nfl_odds_fetch.py) — same
// shape as MLB's odds_latest.json: by_player_id / by_name, one quote per
// market key. That bot has NOT shipped freeze-at-kickoff yet (see its module
// docstring), so unlike the MLB side a quote here can still be a LIVE price
// once a game has started — nothing downstream should assume otherwise until
// that lands.
//
// components/OddsLine.js and components/OddsStatus.js ARE reused as-is for
// NFL (not forked) — see components/nfl/tabs/Boards.js and Picks.js for
// where. Both take fully-formed data as props (a `quote`/`edge` object, or a
// `status` object) and have no MLB-specific logic baked in; OddsLine's VERDICT
// import is a static label/tone map keyed by strings this file also produces
// ('value'/'fair'/'priced_out'), so reusing that component costs nothing and
// forking it would just be two copies of the same JSX to keep in sync.

// nfl_scoring.MODELS key -> the odds-api market key nfl_odds_fetch.py
// actually requested. Must match CATEGORY_MARKET in that file exactly — see
// its module docstring for the confidence table (KICK_PTS is the one to
// re-check first against a live probe).
export const CATEGORY_MARKET = {
  TD: 'player_anytime_td',
  REC_YDS: 'player_reception_yds',
  REC: 'player_receptions',
  RUSH_YDS: 'player_rush_yds',
  RUSH_ATT: 'player_rush_attempts',
  PASS_YDS: 'player_pass_yds',
  KICK_PTS: 'player_kicking_points',
}

// The line that asks for exactly what nfl_scoring's bar asks for — bar minus
// a half point, since a book's line sits on a half to avoid a push. Read off
// bots/nfl/nfl_scoring.py's MODELS[*]['bar'] at the time this was written
// (TD 1, REC_YDS 40, REC 4, RUSH_YDS 50, RUSH_ATT 12, PASS_YDS 225,
// KICK_PTS 6) — nothing wires these two files together automatically, so a
// bar changed in nfl_scoring.py has to be changed here too. Same manual-sync
// risk lib/odds.js's own CATEGORY_LINE already carries against MLB's bars.
export const CATEGORY_LINE = {
  TD: 0.5,
  REC_YDS: 39.5,
  REC: 3.5,
  RUSH_YDS: 49.5,
  RUSH_ATT: 11.5,
  PASS_YDS: 224.5,
  KICK_PTS: 5.5,
}

const SUFFIX = /^(jr|sr|ii|iii|iv|v)$/

// Must match norm_name() in bots/nfl/nfl_odds_fetch.py. If these two ever
// disagree the by-name fallback silently stops matching anyone — the same
// warning lib/odds.js carries on its own copy.
export function normName(s) {
  const stripped = String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .toLowerCase()
  const parts = stripped.split(/\s+/).filter(Boolean)
  while (parts.length > 1 && SUFFIX.test(parts[parts.length - 1])) parts.pop()
  return parts.join(' ')
}

/** American odds → break-even percentage. -110 → 52.4, +150 → 40.0 */
export function impliedPct(odds) {
  const n = Number(odds)
  if (!Number.isFinite(n) || n === 0) return null
  const p = n < 0 ? -n / (-n + 100) : 100 / (n + 100)
  return Math.round(1000 * p) / 10
}

export function fmtOdds(odds) {
  const n = Number(odds)
  if (!Number.isFinite(n) || n === 0) return '—'
  return n > 0 ? `+${n}` : `${n}`
}

/**
 * The quote for one player in one nfl_scoring market, or null.
 *
 * @param odds    the published nfl_odds_latest.json
 * @param player  a slate row (or anything carrying player_id/name)
 * @param market  TD | REC_YDS | REC | RUSH_YDS | RUSH_ATT | PASS_YDS | KICK_PTS
 */
export function quoteFor(odds, player, market) {
  const key = String(market || '').toUpperCase()
  const mk = CATEGORY_MARKET[key]
  if (!odds || !mk || !player) return null
  const byId = odds.by_player_id?.[String(player.player_id ?? player.id)]
  const byName = odds.by_name?.[normName(player.name || player.player_name)]
  const q = (byId || byName)?.[mk]
  if (!q) return null
  // Does the book's line ask for the same thing the model's bar does? A
  // REC_YDS pick needs 40+, which is the over on 39.5 — a book sitting on
  // 49.5 is a different bet, and pairing that price with this market's
  // record would be quietly wrong. Same guard lib/odds.js's quoteFor uses.
  const want = CATEGORY_LINE[key]
  const matches = want == null || Math.abs(Number(q.line) - want) < 1e-9
  return { ...q, market: mk, cat: key, wantLine: want, matches }
}

/**
 * The verdict: does a real historical rate clear what the price demands.
 *
 * `rate` must be an actual per-player historical rate for this market, never
 * the 0-100 nfl_scoring score — a score is a RANK, not a probability, and
 * comparing one to an implied percentage would be confident nonsense (the
 * exact failure lib/odds.js's own edgeOf warns against). Nothing in
 * components/nfl/tabs/Boards.js or Picks.js currently has that rate wired up
 * per player, so neither passes `rate` yet — this exists for the day one
 * does, rather than being invoked with a score today.
 */
export function edgeOf(quote, rate) {
  const need = quote?.implied ?? impliedPct(quote?.over)
  const have = Number(rate)
  if (need == null || !Number.isFinite(have)) return null
  const diff = Math.round(10 * (have - need)) / 10
  return {
    need,
    have,
    diff,
    verdict: diff >= 5 ? 'value' : diff <= -5 ? 'priced_out' : 'fair',
  }
}
