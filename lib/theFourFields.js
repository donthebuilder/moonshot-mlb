// THE FOUR, TRIMMED FOR THE WIRE (2026-09-21)
//
// `components/BotPicksStrip.js` is a client component, and the funnel page
// (`app/start/page.js`) is server-rendered. Handing the strip the raw slate
// would mean serialising today_slim.json's rows into the RSC payload — 480
// keys and ~17 KB PER ROW, measured off the live file on 2026-09-21. On a full
// slate that is roughly 1.8 MB of JSON crossing the wire so that four cards
// can print twelve names, which is the exact mistake the FRANCHISE Wire pass
// fixed this week (1924 -> 471 bytes per player).
//
// So the page filters to the designated rows, trims each one to the fields the
// strip actually reads, and hands those over. BotPicksStrip is UNCHANGED and
// still does its own bucketing — which is deliberate, not laziness:
//
//   pickBuckets() computes `_slateGames` (his team plays twice tonight) by
//   counting how many slate rows each man has IN THE ARRAY IT IS GIVEN. Pass
//   it only the twelve winners and every count collapses to 1, silently
//   dropping the "plays 2x" note. Pass it every designated row and the count
//   is right, and it picks the same twelve it would have picked from the full
//   slate, because a row with no role was never in its pool to begin with.
//
// WHY A WHITELIST AND NOT A DENYLIST. The row carries 480 keys; the strip
// reads 40. Listing what is needed is short enough to check by eye against the
// component, and it fails LOUD (a missing stat renders nothing, which the
// strip is already written to do) rather than quietly shipping a megabyte.
//
// ── KEEP THIS IN SYNC ─────────────────────────────────────────────────────
// Every key below was read directly out of components/BotPicksStrip.js on
// 2026-09-21 — its render block, statLine(), microStat(), and the accessors in
// lib/player.js that CATEGORIES' own score functions call. If that component
// starts reading a new field, add it here or it will render blank on /start
// while still working everywhere else. There is no import binding the two
// files together on purpose: the alternative was making a 'use client'
// component's internals a public contract, and this file is the contract.

// Identity, and the three things the card prints next to the name.
const IDENTITY = [
  'player_id', 'name', 'player', 'player_name',
  'team', 'team_abbr', 'batting_team',
  'game_pk', 'game_pick_role',
  'pitcher_name', 'pitcher_throws', 'weak_spot_flag',
]

// The four category scores, with the fallback key names lib/player.js's
// hrScore/hitScore/prodScore/tbScore try in order. Cheap to carry all of them;
// guessing which one today's bot run publishes is how a card renders 0.0.
const SCORES = [
  'hr_score',
  'hit_shape_score', 'hit_score', 'contact_hit_score', 'base_hit_score', 'hit_model_score',
  'production_shape_score', 'hrr_score', 'hrr_model_score', 'run_rbi_score', 'prod_score',
  'contact_shape_score', 'contact_score', 'tb_score', 'total_base_score', 'xbh_score',
]

// statLine() for the featured pick and microStat() for #2/#3 — form first,
// season anchor behind it, per category.
const EVIDENCE = [
  'last5_hr', 'last5_hits', 'last5_xbh', 'last5_runs', 'last5_rbi', 'last5_avg',
  'season_avg', 'season_slg', 'season_iso', 'season_runs', 'season_rbi',
  'l20pa_barrel_rate', 'recent_barrel_rate',
]

export const FOUR_FIELDS = [...IDENTITY, ...SCORES, ...EVIDENCE]

/** Does the bot designate this row for one of the four categories? */
export const isDesignated = (r) => Boolean(String(r?.game_pick_role || '').trim())

/**
 * Every designated row, trimmed to FOUR_FIELDS.
 *
 * Undefined keys are dropped rather than written as `undefined` — a key with
 * no value still costs bytes in the payload, and every reader here is already
 * null-safe.
 */
export function trimForFour(rows = []) {
  const out = []
  for (const r of rows) {
    if (!r || !isDesignated(r)) continue
    const slim = {}
    for (const k of FOUR_FIELDS) if (r[k] !== undefined) slim[k] = r[k]
    out.push(slim)
  }
  return out
}
