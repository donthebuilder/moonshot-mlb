// THE CARD AND THE TWO-MAN: THE PURE HALF (2026-10-10, Donovan's decisions).
//
// A CARD is what one slate (a night; a football game window) is called as:
//   3 STRAIGHTS  the top three CALLED players by score, flat 1 unit each
//   1 TWO-MAN    the two highest-scored CALLED players from DIFFERENT games, flat 0.5 unit
// both frozen at the lock and never edited after it. Graded from the real box score:
//   a straight   hit / miss; a player who did not play voids it
//   a two-man    BOTH-OR-NOTHING: both legs hit = hit; any leg void (did not play, postponed) = void, never a loss; else miss
// DONOVAN'S TWO-MAN is a separate lane (lane 'donovan'): two players he enters by hand BEFORE the lock, with a one-to-three line note.
// It has its own rows, its own record, and is never counted in the bot's.
//
// THE SELECTION RULE IS FIXED AND PUBLISHED (CARD_RULE_TEXT): nothing here depends on who runs it or when beyond the clock
// handed in. Candidates are the sport's CALLED players (the labels come from lib/callStatus / lib/nhl/goalModel scoreNight,
// never re-derived here) whose game has not started. Ranked by score, ties by the model's rate, then the earlier start, then the
// player id, so the order never depends on the order the feed listed them in.
//
// Pure: no fetch, no clock but `now`. The reads are lib/card/sources.js, the writes lib/card/store.js, the posts lib/card/post.js.
// Tests: scripts/check-two-man.mjs (TEST data only).
import { DEFAULT_LEAD_MIN, leadMinFor } from './lockRules'
import { trackingWords } from '../record/nbaFloor'
import { wilson } from '../interval.js'
import { FLOORS, FLOOR_WORDS, TRACKED_STAKE, TRACKED_RULE, straightVerdict, twoManVerdict, winProfit, decimalOf, americanOfDecimal, trackedUnits } from './rules.js'
export { decimalOf, americanOfDecimal, trackedUnits }

export const CARD_VERSION = 'card-v2'
/** Rows written by the first Card (3 straights + Two-Man, one market): still read, never rewritten, counted in the same lines. */
export const LEGACY_VERSIONS = ['card-v1']
export const CARD_VERSIONS = [...LEGACY_VERSIONS, CARD_VERSION]
// Rule ids are stored on every row. 2026-10-11 (Donovan's floors, lib/card/rules.js): the straight and the Two-Man rules moved to v3 / v2, so a
// row says which rule picked it. Rows locked before that keep their old ids and are never rewritten; the model_version stays card-v2.
// 2026-10-20: the Long Shot moved to v2 (+550 or longer, lib/card/rules.js FLOORS.longShot); its v1 rows keep 'long-shot-v1'.
export const CARD_RULE = {
  straight: 'straight-slots-v3-floors', two_man: 'two-man-top2-different-games-v2', two_man_same_game: 'two-man-same-game-v2', donovan: 'donovan-hand-picked-v1', donovan_late: 'donovan-late-v1',
  double: 'double-plus-money-v1', donovan_double: 'donovan-double-v1', long_shot: 'long-shot-v2-550', donovan_n_man: 'donovan-n-man-v1', donovan_straight: 'donovan-straight-v1',
}
/** Every rule id a same-game Two-Man ever carried (rows locked before 10-11 carry v1). */
export const SAME_GAME_RULES = Object.freeze(['two-man-same-game-v1', 'two-man-same-game-v2'])
export const isSameGameRule = (rule) => SAME_GAME_RULES.includes(rule)
export const STRAIGHTS = 3
export const STAKE = { straight: 1, two_man: 0.5, double: 0.5, long_shot: 1, n_man: 0.5 }
/**
 * DONOVAN'S N-MAN (2026-10-12, "i want to be able to do up a 6 man with a card too"): his own hand-picked ticket of 2 to 6 players (the Two-Man's bigger
 * sibling: product 'n_man', the same lane rules, the same note, the same optional card name). ALL legs must land. A 2-leg ticket on the Two-Man tab stays the
 * Two-Man (product 'two_man', unchanged); a 2-leg ticket on the N-man tab (2026-10-12, "2 yes") is the same bet in the N-man card's layout: product 'n_man' with
 * leg_count 2 ("ADMIN'S 2-MAN"), counted in donovan_n_man, never in donovan. The database accepts leg_count 2..6 for 'n_man'
 * (supabase/migrations/202610121200_card_calls_nman.sql + the leg_count patch).
 */
export const NMAN_MIN = 2
export const NMAN_MAX = 6
/** The stake of an N-man in units: 0.5 like the Two-Man unless he sets another, 0.25 to 1 in steps of 0.05. null when it is not a stake. */
export const NMAN_UNITS = Object.freeze({ min: 0.25, max: 1, step: 0.05, def: 0.5 })
export function cleanUnits(raw) {
  if (raw == null || raw === '') return NMAN_UNITS.def
  const v = Number(raw)
  if (!Number.isFinite(v) || v < NMAN_UNITS.min - 1e-9 || v > NMAN_UNITS.max + 1e-9) return null
  const r = Math.round(v * 100) / 100
  return Math.abs(Math.round(r / NMAN_UNITS.step) * NMAN_UNITS.step - r) < 1e-6 ? r : null
}
/**
 * DONOVAN'S LATE LANE (2026-10-12, his words: "i want to be able to submit mine whenever"). A Two-Man he saves after its card's lock, or with a player whose
 * game has already started, is NOT a pregame call: it is stored in its own lane, never in 'donovan', so it can never be in the verified record, the ledger,
 * a post or a public read. It is graded for his own reference and shown on /admin/two-man only, labelled LATE. supabase/migrations/202610121100_card_calls_late.sql.
 */
export const LATE_LANE = 'donovan_late'
export const isLateRow = (r) => r?.lane === LATE_LANE
/** Minutes after it was saved that a late entry can still be changed or withdrawn (a typo window; the database holds it too). */
export const LATE_EDIT_MIN = 15
/** Minutes before a card's first game that it locks (and that Donovan's entry closes). */
export const CARD_LOCK_LEAD_MIN = DEFAULT_LEAD_MIN   // the default; each sport's own lead is lib/card/lockRules.js leadMinFor
/** Units are quoted only from this many priced graded calls (the site's existing rule: lib/odds/roi MIN_N). */
export const MIN_PRICED = 100
/** The sports the Card runs in: LOCKED, stored, posted and graded. NBA (BUCKETS) is NOT here: it is hidden, so nothing about it is locked or posted. */
export const CARD_SPORTS = ['nhl', 'nfl', 'mlb', 'nba']   // nba 2026-10-20 (Donovan: "turn it on", BUCKETS public): its records under the 30-night floor (lib/card/store.js)
/**
 * The sports that have the Card's PARTS but no lock: BUCKETS (2026-10-12, parity pass). Its player card, its straight picker and its stored-line floors exist so a
 * holder of early access (or an admin) can see what the Card WOULD be (lib/card/nbaPreview.js, /api/buckets/card), but the tick never locks it, nothing is
 * written to card_calls for it and nothing is posted: that waits for the public switch (lib/openSwitch.js) AND a decision to add it to CARD_SPORTS.
 */
export const PREVIEW_CARD_SPORTS = []   // BUCKETS left the preview 2026-10-20
/** The sports whose cards have a POSTSEASON edition (MLB StatsAPI gameType=P: lib/cards/postseasonData.js). One list, so no component writes a sport ternary for it. */
export const POSTSEASON_SPORTS = ['mlb']

/** What each sport's straight is, in words (a table keyed by sport, not a ternary). */
export const CARD_WORDS = {
  nhl: { market: 'anytime goal', short: 'goal', window: 'night', brand: 'LAMP' },
  nfl: { market: 'anytime touchdown', short: 'TD', window: 'game window', brand: 'TUDDY' },
  mlb: { market: 'home run', short: 'HR', window: 'night', brand: 'MOONSHOT' },
  nba: { market: 'points', short: 'pts', window: 'night', brand: 'BUCKETS' },
}
/** The words of a PREVIEW sport (kept OUT of CARD_WORDS on purpose: `CARD_WORDS[sport]` is how the posters and the Card text ask "is this a Card sport?", and BUCKETS is not one). */
export const PREVIEW_CARD_WORDS = {}   // BUCKETS is a Card sport since 2026-10-20 (CARD_WORDS.nba)

export const CARD_RULE_TEXT = {
  straight: `One to three straights by the size of the slate (1 game: 1, 2: 1, 3 to 5: 2, 6 or more: 3), the highest-scored players of each slot\'s market (CALLED or, in football, ON THE BOARD), one per game, whose game has not started and who are not listed out, one unit each. A shots, yards or hits pick is an over at its stored line and price. ${FLOOR_WORDS.straight}`,
  two_man: `The highest-scored CALLED player, plus the highest-scored CALLED player from a different game; half a unit. On a one-game slate (never baseball) the two best players of that game, one from each team if possible. ${FLOOR_WORDS.two_man}`,
  tracked: FLOOR_WORDS.tracked,
  ties: 'A tie goes to the higher model rate, then the earlier start, then the player id.',
  grade: 'Graded from the box score. Both legs must land; a player who did not play voids the two-man.',
}


// ── THE MAP (Donovan, 2026-10-10): HOW MANY PLAYS, IN WHICH MARKETS ────────────────────────────────────────────────────────
/** Hard cap: straights + Two-Man per sport per window. The Double, the Long Shot and the shadow rows are not plays of a sport's Card. */
export const PLAY_CAP = 4
/** A "full slate" is this many games or more in the window (Donovan's default). */
export const FULL_SLATE = 6
/**
 * PLAYS PER SLATE. `games` = the games in the window (a sport's night; an NFL Thursday / Sunday / Monday).
 *   1 game  -> 1 straight + 1 Two-Man (the Two-Man may be SAME-GAME; never in baseball)
 *   2       -> 1 + 1 (different games)
 *   3 to 5  -> 2 + 1
 *   6+      -> 3 + 1
 * Straights are one per game, so a slate never has more straights than games. Never padded: fewer when fewer qualify (see planStraights).
 */
export const PLAYS_BY_GAMES = Object.freeze([[1, 1, 1], [2, 1, 1], [5, 2, 1], [Infinity, 3, 1]])   // [up to this many games, straights, two-man]
export function playsFor(games) {
  const g = Math.floor(Number(games))
  if (!Number.isFinite(g) || g < 1) return { games: 0, straights: 0, twoMan: 0, sameGame: false }
  const [, straights, twoMan] = PLAYS_BY_GAMES.find(([upTo]) => g <= upTo)
  const n = Math.min(straights, g)                       // one straight per game
  return { games: g, straights: n, twoMan: Math.min(twoMan, PLAY_CAP - n), sameGame: g === 1 }
}

/** The markets of each sport's straights. kind 'yn' = a yes/no prop (anytime); 'ou' = an over (graded against a stored line). `lineMarket` = lib/odds/lines.js EXTRA key. */
export const MARKETS = Object.freeze({
  nhl: {
    anytime: { label: 'anytime goal', short: 'goal', kind: 'yn' },
    sog: { label: 'shots on goal over', short: 'shots', kind: 'ou', lineMarket: 'sog', unit: 'shots' },
  },
  nfl: {
    anytime: { label: 'anytime touchdown', short: 'TD', kind: 'yn' },
    rec_yds: { label: 'receiving yards over', short: 'rec yds', kind: 'ou', lineMarket: 'rec_yds', unit: 'yards' },
    rush_yds: { label: 'rushing yards over', short: 'rush yds', kind: 'ou', lineMarket: 'rush_yds', unit: 'yards' },
  },
  mlb: {
    anytime: { label: 'home run', short: 'HR', kind: 'yn' },
    hit: { label: 'hits over', short: 'hits', kind: 'ou', lineMarket: 'hits', unit: 'hits' },
    hrr: { label: 'hits + runs + RBI over', short: 'H+R+RBI', kind: 'ou', lineMarket: 'hrr', unit: 'H+R+RBI' },
  },
  // BUCKETS (PREVIEW ONLY): the five over/under markets the NBA model really scores AND the odds tick really stores (lib/odds/lines.js EXTRA.NBA), keyed by the
  // model's own market keys (lib/nba/model.js NBA_MARKETS). No yes/no (anytime) market exists: first basket has no stored price, double-double has no published line.
  nba: {
    pts: { label: 'points over', short: 'pts', kind: 'ou', lineMarket: 'pts', unit: 'points' },
    reb: { label: 'rebounds over', short: 'reb', kind: 'ou', lineMarket: 'reb', unit: 'rebounds' },
    ast: { label: 'assists over', short: 'ast', kind: 'ou', lineMarket: 'ast', unit: 'assists' },
    '3pm': { label: 'threes over', short: '3pm', kind: 'ou', lineMarket: '3pm', unit: 'threes' },
    pra: { label: 'points + rebounds + assists over', short: 'PRA', kind: 'ou', lineMarket: 'pra', unit: 'PRA' },
  },
})
/**
 * THE STRAIGHT SLOTS, in the order a slate fills them (markets are never compared by raw score). Each slot lists the markets it may come
 * from, tried in order:
 *   NHL  1 anytime goal | 2 shots on goal over | 3 a 2nd goal pick, else a 2nd shots pick
 *   NFL  1 anytime TD   | 2 receiving yards over | 3 rushing yards over
 *   MLB  1 home run     | 2 hits over, else hits + runs + RBI over | 3 a 2nd home run
 * NBA is not built (BUCKETS is hidden).
 */
export const SLOTS = Object.freeze({
  nhl: [['anytime'], ['sog'], ['anytime', 'sog']],
  nfl: [['anytime'], ['rec_yds'], ['rush_yds']],
  mlb: [['anytime'], ['hit', 'hrr'], ['anytime']],
  //   NBA (preview only, a PROPOSAL of the parity pass: the slots follow the model's market order)   1 points over | 2 rebounds over, else assists over | 3 threes over, else PRA over
  nba: [['pts'], ['reb', 'ast'], ['3pm', 'pra']],
})
/** Sports whose one-game window may have a SAME-GAME Two-Man (baseball never does: MLB is always different games). */
export const SAME_GAME_SPORTS = Object.freeze({ nhl: true, nfl: true, mlb: false, nba: true })
export const marketOf = (sport, key) => MARKETS[sport]?.[key || 'anytime'] || null
export const marketWords = (sport, key, line = null) => { const m = marketOf(sport, key); return m ? (m.kind === 'ou' && Number.isFinite(Number(line)) && line !== null ? `${m.label} ${line}` : m.label) : '' }

/** The plus-money window (a stored MEDIAN anytime price at lock): +160 to +500. THE DOUBLE only since 2026-10-20 (the Long Shot is +550 or longer: isLongShotPrice). */
export const PLUS_MONEY = Object.freeze({ min: 160, max: 500 })
export const inPlusMoney = (a) => Number.isInteger(a) && a >= PLUS_MONEY.min && a <= PLUS_MONEY.max
/** The Long Shot publishes counts only until this many graded long shots (per sport); K of N and units after. */
export const MIN_LONG_SHOTS = 300

export const SAME_GAME_NOTE = "Both legs are from one game, so they are correlated and the \"if independent\" count understates what to expect. The two prices multiplied is also higher than a real same-game parlay price (books mark these down)."
export const LONG_SHOT_NOTE = 'A long shot: most of these miss.'

const fin = (v) => (typeof v === 'number' && Number.isFinite(v))
const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
const r1 = (v) => Math.round(v * 10) / 10

// ── SELECTION ─────────────────────────────────────────────────────────────────
/**
 * The fixed order: score high to low; ties by the model rate (high first, a missing rate last), then the earlier start,
 * then the player id. A candidate is { player_id, name, team, opp, game_id, game_date, start_ms, score, rate?, ... }.
 */
export function cmpCandidate(a, b) {
  const ra = fin(a.rate) ? a.rate : -Infinity
  const rb = fin(b.rate) ? b.rate : -Infinity
  return (b.score - a.score) || (rb - ra) || (a.start_ms - b.start_ms) || String(a.player_id).localeCompare(String(b.player_id))
}

/** The field: candidates with a real score, a real start and an id, whose game has NOT started, one per player (his best line kept), ranked. */
export function fieldOf(cands, now) {
  const seen = new Map()
  for (const c of cands || []) {
    if (!c || c.player_id == null || c.player_id === '' || c.game_id == null || !fin(c.score) || !fin(c.start_ms) || !fin(now) || !(c.start_ms > now)) continue
    const k = String(c.player_id)
    const prev = seen.get(k)
    if (!prev || cmpCandidate(c, prev) < 0) seen.set(k, { ...c, player_id: k, game_id: String(c.game_id) })
  }
  return [...seen.values()].sort(cmpCandidate)
}

// ── PERCENTILE (the X lead pick) ──────────────────────────────────────────────────────────────────────────────────────────
/** Where a score sits on its OWN market's board that night, 0 to 100 (mid-rank: below + half the ties). null without a board. Never printed as a chance. */
export function percentileOf(score, board) {
  const b = (board || []).filter(fin)
  if (!fin(score) || !b.length) return null
  const below = b.filter((x) => x < score).length
  const eq = b.filter((x) => x === score).length
  return Math.round((1000 * (below + eq / 2)) / b.length) / 10
}

/** What a leg stores of a candidate (the lock freezes exactly this). A volume pick also freezes its market, line, price and board percentile. */
export const legOf = (c) => ({
  player_id: String(c.player_id), name: c.name || null, team: c.team || null, opp: c.opp || null, pos: c.pos || null,
  game_id: String(c.game_id), game_date: c.game_date, start_at: new Date(c.start_ms).toISOString(),
  score: fin(c.score) ? c.score : null, rate: fin(c.rate) ? Math.round(c.rate * 1000) / 1000 : null, role: c.role || null, why: c.why || null, status: c.status === 'board' ? 'board' : 'called',
  ...(c.market ? { market: c.market } : {}),
  ...(fin(c.line) ? { line: c.line } : {}),
  ...(c.price && Number.isInteger(c.price.median) ? { price: { median: c.price.median, best: Number.isInteger(c.price.best) ? c.price.best : c.price.median, books: c.price.books ?? null, taken_at: c.price.taken_at ?? null } } : {}),
  ...(fin(c.board_pct) ? { board_pct: c.board_pct, board_n: c.board_n ?? null } : {}),
  ...(c.sport ? { sport: c.sport } : {}),
  ...(c.slate_key ? { slate_key: c.slate_key } : {}),      // football: the week the box score is read from (a Double's NFL leg has no row-level week)
})

const startOf = (legs) => new Date(Math.min(...legs.map((l) => Date.parse(l.start_at)))).toISOString()

/** "3 with no stored price, 2 under the +120 floor" from a list of failed verdicts. */
const failWords = (fails) => {
  const by = { no_price: 0, price: 0, line: 0 }
  for (const v of fails) by[v.code] = (by[v.code] || 0) + 1
  const out = []
  if (by.line) out.push(`${by.line} under the line floor`)
  if (by.no_price) out.push(`${by.no_price} with no stored price`)
  if (by.price) out.push(`${by.price} under the +${FLOORS.straight} floor`)
  return out.join(', ')
}

/**
 * THE STRAIGHTS, SLOT BY SLOT. `byMarket` = { anytime: { cands, board }, sog: { cands, board }, ... } (lib/card/sources.js): each market's eligible
 * candidates (a candidate carries its stored `price.median`, and a volume candidate its `line`, or it is not usable) and the whole board's scores for the
 * percentile. Each slot (SLOTS[sport]) takes the best-scored candidate of its first market that has one from a game no earlier straight used AND that
 * clears the floors (lib/card/rules.js: the line floor, a stored price, the price floor). A slot with nobody is SKIPPED and says why; never padded,
 * never filled from another market out of turn. `floors: false` is the pre-10-11 rule (no price needed for an anytime pick, no floors): the
 * tracking record uses it to find what the Card would have picked, never the lock.
 * @returns {{ picks: [{ slot, market, cand }], skipped: [{ slot, market, reason }] }}
 */
export function planStraights({ sport, n, byMarket, now, floors = true }) {
  const picks = []
  const skipped = []
  const used = new Set()
  const slots = (SLOTS[sport] || []).slice(0, Math.max(0, n))
  slots.forEach((from, i) => {
    const why = []
    let got = null
    for (const key of from) {
      const def = marketOf(sport, key)
      const m = byMarket?.[key]
      if (!def || !m) { why.push(`${def?.label || key}: no board was read`); continue }
      const field = fieldOf(m.cands, now)
      let usable = field
      if (def.kind === 'ou') {
        usable = field.filter((c) => fin(c.line) && c.price && Number.isInteger(c.price.median))
        if (field.length && !usable.length) { why.push(`${def.label}: no stored line and price at lock for any of the ${field.length} eligible`); continue }
      }
      if (!field.length) { why.push(`${def.label}: nobody eligible`); continue }
      let cleared = usable
      if (floors) {
        const fails = []
        cleared = usable.filter((c) => { const v = straightVerdict(sport, key, c); if (!v.ok) fails.push(v); return v.ok })
        if (!cleared.length) { why.push(`${def.label}: none of the ${usable.length} eligible cleared the floors (${failWords(fails)})`); continue }
      }
      const free = cleared.filter((c) => !used.has(c.game_id))
      if (!free.length) { why.push(`${def.label}: every eligible player is in a game already used`); continue }
      const c = free[0]
      got = { slot: i + 1, market: key, cand: { ...c, market: key, board_pct: percentileOf(c.score, m.board), board_n: (m.board || []).filter(fin).length || null } }
      break
    }
    if (got) { used.add(got.cand.game_id); picks.push(got) } else skipped.push({ slot: i + 1, market: from.map((k) => marketOf(sport, k)?.label || k).join(' or '), reason: why.join('; ') || 'nobody eligible' })
  })
  return { picks, skipped }
}

/**
 * The top three straights of ONE market, at most one per game (the first Card's rule, kept for callers that have a single board).
 * Fewer when fewer games qualify; never padded with a second player from a used game.
 */
export function pickStraights(cands, now, n = STRAIGHTS) {
  const used = new Set()
  const out = []
  for (const c of fieldOf(cands, now)) {
    if (used.has(c.game_id)) continue
    used.add(c.game_id); out.push(c)
    if (out.length === n) break
  }
  return out
}

/** Is this pair long enough for a Two-Man? (lib/card/rules.js: the two stored prices multiplied, +500 or longer.) */
export const pairClears = (a, b) => twoManVerdict([a?.price, b?.price]).ok

/**
 * The bot's Two-Man: the best candidate, then the best one from a DIFFERENT game. null when there is no second game. With `pairOk` (the price
 * floor) the first pair, in rank order (the better player first, then the better partner), that the test passes: when the top man has no partner
 * that clears it, the next man is tried. Without it, the pre-10-11 rule.
 */
export function pickTwoMan(cands, now, pairOk = null) {
  const f = fieldOf(cands, now)
  for (let i = 0; i < f.length; i += 1) {
    for (let j = i + 1; j < f.length; j += 1) {
      if (f[j].game_id === f[i].game_id) continue
      if (!pairOk || pairOk(f[i], f[j])) return [f[i], f[j]]
    }
    if (!pairOk) return null          // the old rule only ever tried the top man
  }
  return null
}

/**
 * The SAME-GAME Two-Man (a one-game window only): the two highest-scored eligible players of that game, one from each team when both
 * teams have one. null with fewer than two players, or when the field spans more than one game. `pairOk` as in pickTwoMan.
 */
export function pickTwoManSameGame(cands, now, pairOk = null) {
  const f = fieldOf(cands, now)
  if (f.length < 2 || new Set(f.map((c) => c.game_id)).size !== 1) return null
  for (let i = 0; i < f.length; i += 1) {
    const a = f[i]
    const rest = f.slice(i + 1)
    const order = [...rest.filter((c) => c.team && a.team && c.team !== a.team), ...rest.filter((c) => !(c.team && a.team && c.team !== a.team))]
    const b = order.find((c) => !pairOk || pairOk(a, c))
    if (b) return [a, b].sort(cmpCandidate)
    if (!pairOk) return null
  }
  return null
}

/** The Two-Man a window gets: same-game when the window has exactly one game and the sport is not baseball, else two players from different games. */
export function pickTwoManFor({ sport, games, cands, now, pairOk = null }) {
  if (games === 1 && SAME_GAME_SPORTS[sport]) { const p = pickTwoManSameGame(cands, now, pairOk); return p ? { legs: p, sameGame: true } : null }
  const p = pickTwoMan(cands, now, pairOk)
  return p ? { legs: p, sameGame: false } : null
}

/** The X lead among a card's straight rows: the highest board percentile, ties to the scorer slot (the lower slot), then the earlier game. */
export function leadStraight(rows) {
  const s = (rows || []).filter((r) => r?.lane === 'bot' && r.product === 'straight' && r.legs?.[0])
  const pct = (r) => (fin(r.legs[0].board_pct) ? r.legs[0].board_pct : -Infinity)
  return [...s].sort((a, b) => (pct(b) - pct(a)) || (a.slot - b.slot) || (Date.parse(a.legs[0].start_at) - Date.parse(b.legs[0].start_at)) || String(a.legs[0].player_id).localeCompare(String(b.legs[0].player_id)))[0] || null
}

/** The games a field spans (the plays-per-slate count when the loader did not say). */
export const gamesIn = (cands, now) => new Set(fieldOf(cands, now).map((c) => c.game_id)).size

/**
 * THE LOCK, planned. The rows to store for one card window at `now`, and what was skipped and why. Only players whose game has not started are
 * in the field, so nothing is ever written at or after a start. `games` = the games in the window (the plays-per-slate count).
 * `byMarket` as in planStraights; `cands` alone = the single anytime board (a caller with one market). Returns rows [] when nothing can be called.
 */
export function lockPlan({ sport, slate_key, card_date, cands = null, byMarket = null, games = null, now, lockAtMs, version = CARD_VERSION, pairNote = null }) {
  const bm = byMarket || { anytime: { cands: cands || [], board: (cands || []).map((c) => c.score) } }
  const anytime = bm.anytime?.cands || []
  const G = Number.isFinite(games) && games > 0 ? games : gamesIn(anytime, now)
  const plays = playsFor(G)
  const base = { sport, card_date, slate_key, lane: 'bot', model_version: version, locks_at: new Date(lockAtMs).toISOString(), window_games: G || null }
  const plan = planStraights({ sport, n: plays.straights, byMarket: bm, now })
  const rows = plan.picks.map(({ slot, market, cand }) => {
    const legs = [legOf(cand)]
    return { ...base, product: 'straight', slot, market, rule: CARD_RULE.straight, stake: STAKE.straight, legs, leg_count: 1, note: null, start_at: startOf(legs) }
  })
  const skipped = [...plan.skipped]
  // TRACKED, NOT ON THE CARD: what the pre-floor rule would have picked, where it fails a floor (lib/card/rules.js). Never dropped.
  const tbase = { sport, card_date, slate_key, model_version: version, locks_at: base.locks_at, window_games: base.window_games }
  const tracked = []
  for (const { slot, market, cand } of planStraights({ sport, n: plays.straights, byMarket: bm, now, floors: false }).picks) {
    const v = straightVerdict(sport, market, cand)
    if (v.ok) continue
    const legs = [legOf(cand)]
    tracked.push({ ...tbase, product: 'straight', slot, market, rule: TRACKED_RULE.straight, stake: TRACKED_STAKE, legs, leg_count: 1, start_at: startOf(legs), reason_code: v.code, reason: v.code === 'no_price' && cand.no_price_why ? `${v.reason}: ${cand.no_price_why}` : v.reason })
  }
  if (plays.twoMan) {
    const two = pickTwoManFor({ sport, games: G, cands: anytime, now, pairOk: pairClears })
    if (two) {
      const legs = two.legs.map(legOf)
      const pn = !two.sameGame && typeof pairNote === 'function' ? pairNote(two.legs[0], two.legs[1]) : null
      if (pn) legs[0].pair_note = pn          // MLB: the measured pair rule the two meet (lib/pairEvidence), frozen with the call
      rows.push({ ...base, product: 'two_man', slot: 1, market: null, rule: two.sameGame ? CARD_RULE.two_man_same_game : CARD_RULE.two_man, stake: STAKE.two_man, legs, leg_count: 2, note: null, start_at: startOf(legs) })
    } else {
      const eligible = new Set(fieldOf(anytime, now).map((c) => c.game_id)).size
      skipped.push({ slot: 'two-man', market: 'anytime', reason: G === 1 && SAME_GAME_SPORTS[sport] ? 'one game, but fewer than two eligible players in it, or none of the pairs cleared the +' + FLOORS.twoMan + ' floor' : eligible < 2 ? 'fewer than two eligible players from different games' : 'no pair of eligible players cleared the +' + FLOORS.twoMan + ' floor (or a leg has no stored price)' })
    }
    // the pre-floor pair, tracked when its stored prices multiplied fall short (or a leg has none)
    const was = pickTwoManFor({ sport, games: G, cands: anytime, now })
    if (was) {
      const v = twoManVerdict(was.legs.map((c) => c.price))
      if (!v.ok) {
        const legs = was.legs.map(legOf)
        tracked.push({ ...tbase, product: 'two_man', slot: 1, market: null, rule: TRACKED_RULE.two_man, stake: TRACKED_STAKE, legs, leg_count: 2, start_at: startOf(legs), reason_code: v.code, reason: v.code === 'no_price' ? `${v.reason}${was.legs.find((c) => !c.price)?.no_price_why ? `: ${was.legs.find((c) => !c.price).no_price_why}` : ''}` : v.reason })
      }
    }
  }
  return { rows, tracked, skipped, plays, games: G }
}

/** The rows of lockPlan (the first Card's call shape, kept). */
export const lockRows = (args) => lockPlan(args).rows

// ── THE LONG SHOT OF THE DAY ───────────────────────────────────────────────────────────────────────────────────────────────
/** Players of a field with a stored MEDIAN anytime price in +160..+500. `prices` = Map(player_id -> { median, best, books, taken_at }). */
export function plusMoneyField(cands, prices, now) {
  return fieldOf(cands, now).map((c) => ({ ...c, price: prices?.get?.(String(c.player_id)) || null })).filter((c) => inPlusMoney(c.price?.median))
}

/** A Long Shot price: a stored MEDIAN anytime price of FLOORS.longShot (+550) or longer (Donovan, 2026-10-20). */
export const isLongShotPrice = (a) => Number.isInteger(a) && a >= FLOORS.longShot
/**
 * One sport's Long Shot: the top-scored player of a FULL slate (6+ games) priced +550 or longer, else null with the reason (nothing shorter is
 * ever substituted). `prices` = the anytime price map; without one (BUCKETS: no anytime market, Donovan 2026-10-20 "basketball long shot can
 * be from any market, just has to meet the criteria") each candidate brings his own market, line and stored price.
 */
export function pickLongShot({ games, cands, prices, now }) {
  if (!(games >= FULL_SLATE)) return { pick: null, reason: `${games || 0} game${games === 1 ? '' : 's'} (a full slate is ${FULL_SLATE}+)` }
  const withPrice = (c) => (prices ? { ...c, price: prices?.get?.(String(c.player_id)) || null } : c)
  const f = fieldOf(cands, now).map(withPrice).filter((c) => isLongShotPrice(c.price?.median))
  return f.length ? { pick: { ...f[0], market: prices ? 'anytime' : (f[0].market || 'anytime') }, reason: null } : { pick: null, reason: `skipped: no price of +${FLOORS.longShot} or longer on file` }
}
/** BUCKETS' Long Shot field: every CALLED man of every market, in that market, with his stored over line and price (one row per man and market). */
export const anyMarketField = (byMarket) => Object.entries(byMarket || {}).flatMap(([key, m]) => (m?.cands || []).filter((c) => c.price && Number.isInteger(c.price.median)).map((c) => ({ ...c, market: key })))

/** The long_shot row: one leg, the stored median price frozen with it, graded all-or-nothing at that price. */
export function longShotRow({ sport, slate_key, card_date, pick, games, lockAtMs, version = CARD_VERSION, board = null }) {
  const c = { ...pick, market: pick?.market || 'anytime', board_pct: board ? percentileOf(pick.score, board) : null, board_n: board ? board.filter(fin).length : null }
  const legs = [legOf(c)]
  return { sport, card_date, slate_key, lane: 'bot', product: 'long_shot', slot: 1, market: pick?.market || 'anytime', model_version: version, rule: CARD_RULE.long_shot, stake: STAKE.long_shot, legs, leg_count: 1, note: null, start_at: startOf(legs), locks_at: new Date(lockAtMs).toISOString(), window_games: games || null }
}

// ── THE DOUBLE ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
export const DOUBLE_SPORT = 'all'
/**
 * THE DOUBLE: each sport's BEST plus-money player (highest score among stored median anytime prices +160..+500), the two sports with the biggest
 * slates (a tie: the sport key, alphabetical), one leg each. `pools` = [{ sport, games, cands, prices, lockAtMs, board }]. No Double without two sports.
 * @returns {{ legs, sports, lockAtMs } | { legs: null, why }}
 */
export function pickDouble(pools, now) {
  const best = []
  for (const p of pools || []) {
    const f = plusMoneyField(p.cands, p.prices, now)
    if (f.length) best.push({ sport: p.sport, games: p.games || 0, cand: { ...f[0], sport: p.sport, market: 'anytime', board_pct: p.board ? percentileOf(f[0].score, p.board) : null, board_n: p.board ? p.board.filter(fin).length : null }, lockAtMs: p.lockAtMs })
  }
  if (best.length < 2) return { legs: null, why: best.length ? `only ${best[0].sport} has a plus-money player` : 'no sport has a plus-money player' }
  best.sort((a, b) => (b.games - a.games) || String(a.sport).localeCompare(String(b.sport)))
  const two = best.slice(0, 2)
  return { legs: two.map((x) => x.cand), sports: two.map((x) => x.sport), lockAtMs: Math.min(...two.map((x) => x.lockAtMs)) }
}

/** The double row: two legs from two sports, both frozen at the EARLIER of the two locks; 0.5 unit. Donovan's own Double is the same row in his lane. */
export function doubleRow({ legs: cands, lockAtMs, card_date, version = CARD_VERSION, lane = 'bot', note = null, games = null }) {
  const legs = cands.map(legOf)
  return { sport: DOUBLE_SPORT, card_date, slate_key: card_date, lane, product: 'double', slot: 1, market: null, model_version: version, rule: lane === 'donovan' ? CARD_RULE.donovan_double : CARD_RULE.double, stake: STAKE.double, legs, leg_count: 2, note, start_at: startOf(legs), locks_at: new Date(lockAtMs).toISOString(), window_games: games }
}

/** True when a row may still be written at `now` (a row whose first game has started is refused). */
export const mayLockRow = (row, now) => fin(now) && Date.parse(row?.start_at) > now

/** May the card be locked now? From CARD_LOCK_LEAD_MIN before its first start, until that start. */
export function lockWindowOpen(firstStartMs, now, leadMin = CARD_LOCK_LEAD_MIN) {
  return fin(firstStartMs) && fin(now) && now >= firstStartMs - leadMin * 60e3
}
export const lockAtOf = (firstStartMs, leadMin = CARD_LOCK_LEAD_MIN) => firstStartMs - leadMin * 60e3
/** THE SPORT'S OWN lock moment and window (lib/card/lockRules.js): what every caller with a sport in hand uses. */
export const lockAtFor = (sport, firstStartMs) => lockAtOf(firstStartMs, leadMinFor(sport))
export const lockOpenFor = (sport, firstStartMs, now) => lockWindowOpen(firstStartMs, now, leadMinFor(sport))

// ── THE NFL's WINDOWS ─────────────────────────────────────────────────────────
const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
/**
 * One card window per game DAY of the football week (the game's own Eastern date): Thursday night, Sunday, Monday night ...
 * `games` = the week file's games ({ game_id, kickoff }); `etDay(ms)` = the Eastern date of a kickoff (lib/data easternDate).
 * @returns [{ card_date, first_start_ms, last_start_ms, label }] oldest first
 */
export function nflWindowsOf(games, etDay) {
  const byDay = new Map()
  for (const g of games || []) {
    const t = Date.parse(String(g?.kickoff || ''))
    if (!g?.game_id || !Number.isFinite(t)) continue
    const d = etDay(t)
    const cur = byDay.get(d) || { first: Infinity, last: -Infinity, games: new Set() }
    cur.games.add(String(g.game_id))
    byDay.set(d, { first: Math.min(cur.first, t), last: Math.max(cur.last, t), games: cur.games })
  }
  return [...byDay.entries()].sort().map(([d, t]) => ({ card_date: d, first_start_ms: t.first, last_start_ms: t.last, games: t.games.size, label: `${WEEKDAY[new Date(`${d}T12:00:00Z`).getUTCDay()]} ${d}` }))
}

// ── DONOVAN'S LANE ────────────────────────────────────────────────────────────
export const NOTE_MAX_LINES = 3
export const NOTE_MAX_CHARS = 420
/** Words and shapes his note may not carry: it can go to X, and X never sees links, hashtags, "lock", "guaranteed" or "winners". */
const NOTE_BANNED = [
  [/https?:\/\/|www\.|\b[a-z0-9-]+\.(?:com|net|org|io|co|app|gg)\b/i, 'a link'],
  [/[#@][A-Za-z_]/, 'a hashtag or an @mention'],
  [/\block(?:ed|s|ing)?\b/i, 'the word "lock"'],
  [/guarantee/i, 'the word "guaranteed"'],
  [/\bwinners?\b/i, 'the word "winner"'],
  [/\bfree money\b|\bcan'?t lose\b|\bsure thing\b/i, 'a sure-thing phrase'],
]

// ── THE ADMIN'S TWO-MAN: ITS NAME (2026-10-12, "just put admins two man or give me the ability to name the card") ──
/** The default title of the admin's Two-Man everywhere it is shown (the lane id 'donovan' is a key, never a label). */
export const ADMIN_TWO_MAN = "Admin's Two-Man"
export const ADMIN_DOUBLE = "Admin's Double"
export const ADMIN_STRAIGHT = "Admin's Straight"
/** HIS LANE, ENTRIES (2026-10-12, "give me 3 post max, ranging from straight to 6man"): any mix of straights (slots 1..3), his Two-Man, N-men (slots 1..3), saved without a cap; only the first DON_MAX_POSTS of a sport-day (oldest saved first) are POSTED. */
export const DON_SLOTS = 3
export const DON_MAX_POSTS = 3
/** The default title of the admin's N-man by its leg count: "ADMIN'S 6-MAN" (the card prints it in capitals; so does the X text). */
export const adminNMan = (n) => `ADMIN'S ${n}-MAN`
export const CARD_NAME_MAX = 28
/**
 * The name he may give his card: optional, trimmed, 28 characters at most, letters / numbers / spaces / basic punctuation only. '@' and '#' are stripped,
 * a link or any of the banned words of a note (lock, guaranteed, winner ...) is refused. Blank = null (the default title). { ok, name } or { ok:false, error }.
 */
export function cleanCardName(raw) {
  const t = String(raw == null ? '' : raw).replace(/[@#]/g, '').replace(/\s+/g, ' ').trim()
  if (!t) return { ok: true, name: null }
  if ([...t].length > CARD_NAME_MAX) return { ok: false, error: `The card name is ${[...t].length} characters; ${CARD_NAME_MAX} at most.` }
  if (!/^[A-Za-z0-9 .,'&!?:+()\-]+$/.test(t)) return { ok: false, error: 'The card name may use letters, numbers, spaces and . , \' & ! ? : + ( ) - only.' }
  for (const [re, what] of NOTE_BANNED) if (re.test(t)) return { ok: false, error: `The card name carries ${what}; it can be posted, so it cannot.` }
  return { ok: true, name: t }
}
/** The name stored with an entry (frozen in its first leg), or null. */
export const cardNameOf = (row) => { const n = row?.legs?.[0]?.card_name; return typeof n === 'string' && n.trim() ? n.trim() : null }
/** The title of an admin Two-Man row for text (as typed, or "Admin's Two-Man"). */
export const twoManTitle = (row) => cardNameOf(row) || (row?.product === 'n_man' ? adminNMan(row.legs?.length || row.leg_count) : row?.product === 'straight' ? ADMIN_STRAIGHT : ADMIN_TWO_MAN)

/** A note, cleaned: one to three non-empty lines, trimmed. { ok, note } or { ok:false, error }. */
export function cleanNote(raw) {
  const lines = String(raw == null ? '' : raw).split(/\r?\n/).map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean)
  if (!lines.length) return { ok: false, error: 'Add a note of one to three lines.' }
  if (lines.length > NOTE_MAX_LINES) return { ok: false, error: `The note is ${lines.length} lines; three at most.` }
  const note = lines.join('\n')
  if ([...note].length > NOTE_MAX_CHARS) return { ok: false, error: `The note is too long (${[...note].length} characters; ${NOTE_MAX_CHARS} at most).` }
  for (const [re, what] of NOTE_BANNED) if (re.test(note)) return { ok: false, error: `The note carries ${what}; it can be posted, so it cannot.` }
  return { ok: true, note }
}

/**
 * Donovan's entry, checked and shaped. `field` = the card's candidates (the board/slate picker's real players, with their ids),
 * `playerIds` = the two he chose. Refused when: not two different real players, a game has started, the lock has passed, or the
 * note is not one to three clean lines. On success the row is ready to store (lane 'donovan').
 * @returns {{ ok: true, row } | { ok: false, error }}
 */
export function donovanRow({ sport, slate_key, card_date, field, playerIds, note, now, lockAtMs, version = CARD_VERSION, allowLate = false, cardName = null, product = 'two_man', units = null, slot = 1 }) {
  // product 'n_man' = HIS N-MAN (NMAN_MIN..NMAN_MAX players, ALL must land); every rule below is the Two-Man's, unchanged, and a 'two_man' call is byte for byte what it always was
  const nman = product === 'n_man'
  const straight = product === 'straight'      // HIS STRAIGHT (2026-10-12): one player, the anytime market, 1 unit; slots 1..DON_SLOTS like his N-men (his own lane, so the key never meets the bot's straights)
  if (product !== 'two_man' && !nman && !straight) return { ok: false, error: 'Not a product he can enter.' }
  if (!Number.isInteger(slot) || slot < 1 || slot > (nman || straight ? DON_SLOTS : 1)) return { ok: false, error: `Slot ${slot} is not one he can use.` }
  const ids = (playerIds || []).map((v) => String(v == null ? '' : v).trim())
  if (straight ? ids.length !== 1 || !ids[0] : nman ? ids.length < NMAN_MIN || ids.length > NMAN_MAX || ids.some((v) => !v) : ids.length !== 2 || ids.some((v) => !v)) return { ok: false, error: straight ? 'Pick one player.' : nman ? `Pick ${NMAN_MIN} to ${NMAN_MAX} players.` : 'Pick two players.' }
  if (new Set(ids).size !== ids.length) return { ok: false, error: nman ? 'Pick different players: no one twice.' : 'Pick two different players.' }
  if (!fin(now) || !fin(lockAtMs)) return { ok: false, error: 'No lock time for this card.' }
  const stake = nman ? cleanUnits(units) : straight ? STAKE.straight : STAKE.two_man
  if (stake == null) return { ok: false, error: `The stake is ${NMAN_UNITS.min} to ${NMAN_UNITS.max} units, in steps of ${NMAN_UNITS.step}.` }
  const byId = new Map((field || []).map((c) => [String(c.player_id), c]))
  const legsIn = ids.map((id) => byId.get(id))
  if (legsIn.some((c) => !c)) return { ok: false, error: straight ? 'That player must come from tonight\'s board.' : nman ? 'Every player must come from tonight\'s board.' : 'Both players must come from tonight\'s board.' }
  // ALWAYS OPEN (2026-10-12), three cases, decided by the clock and the two games' starts (only when the caller passes `allowLate`; without it this refuses
  // exactly as it always did):
  //   before the card's lock, no game started   VERIFIED, locks at the card's lock (as always)
  //   after the lock, no game of his started    VERIFIED, LOCKS AT SAVE (locks_at = now): genuinely pregame, frozen from this moment
  //   a game of his has started                 LATE: its own lane, never the record, never posted
  const started = legsIn.some((c) => !(c.start_ms > now))
  const late = started
  const lockAtSave = !started && now >= lockAtMs
  if (late && !allowLate) return { ok: false, error: 'A game has started; the entry is closed.' }
  if (lockAtSave && !allowLate) return { ok: false, error: 'The lock has passed; the entry is closed.' }
  const n = cleanNote(note)
  if (!n.ok) return n
  const cn = cleanCardName(cardName)
  if (!cn.ok) return cn
  // OUR BOARD WORD stays true on his legs: legOf folds anything but "on the board" into CALLED, which is right for the bot (it only picks CALLED
  // men) and wrong for a hand pick of a man who is not on the board, so his legs keep the sport's own word (called | board | off).
  const legs = legsIn.map((c, k) => ({ ...legOf(c), status: c.status === 'called' || c.status === 'board' ? c.status : 'off', ...(k === 0 && cn.name ? { card_name: cn.name } : {}) }))      // the card's name is frozen with the row, in its first leg (no new column)
  const start_at = startOf(legs)
  return {
    ok: true, late, lockAtSave,
    lateWhy: late ? 'a game had already started' : null,
    row: {
      sport, card_date, slate_key, lane: late ? LATE_LANE : 'donovan', model_version: version,
      locks_at: new Date(late ? Math.min(lockAtMs, Date.parse(start_at)) : lockAtSave ? now : lockAtMs).toISOString(),
      product, slot, rule: late ? CARD_RULE.donovan_late : straight ? CARD_RULE.donovan_straight : nman ? CARD_RULE.donovan_n_man : CARD_RULE.donovan, stake, legs, leg_count: legs.length, note: n.note, start_at,
      ...(straight ? { market: 'anytime' } : {}),
    },
  }
}

/**
 * DONOVAN'S OWN DOUBLE (optional, daily): two players from two DIFFERENT sports he enters by hand, with a one-to-three line note, before the
 * EARLIER of the two sports' locks. Same freeze and no-edit-after-lock rules as his Two-Man (the database holds them). He is not held to the
 * plus-money window: it is his pick, in his own lane and his own record.
 * `fields` = { nhl: [candidates], ... } the sports' whole boards (real ids), `picks` = [{ sport, player_id }, { sport, player_id }],
 * `locks` = { nhl: lockAtMs, ... }. @returns {{ ok: true, row } | { ok: false, error }}
 */
export function donovanDoubleRow({ card_date, fields, picks, note, now, locks, version = CARD_VERSION }) {
  const ps = (picks || []).map((p) => ({ sport: String(p?.sport || ''), id: String(p?.player_id == null ? '' : p.player_id).trim() }))
  if (ps.length !== 2 || ps.some((p) => !p.sport || !p.id)) return { ok: false, error: 'Pick two players.' }
  if (ps[0].sport === ps[1].sport) return { ok: false, error: 'A Double is two different sports.' }
  if (!fin(now)) return { ok: false, error: 'No clock.' }
  const legsIn = []
  for (const p of ps) {
    const c = (fields?.[p.sport] || []).find((x) => String(x.player_id) === p.id)
    if (!c) return { ok: false, error: `${p.sport.toUpperCase()}: that player is not on tonight's board.` }
    if (!(c.start_ms > now)) return { ok: false, error: 'A game has started; the entry is closed.' }
    legsIn.push({ ...c, sport: p.sport })
  }
  const lockList = ps.map((p) => locks?.[p.sport])
  if (lockList.some((x) => !fin(x))) return { ok: false, error: 'No lock time for this card.' }
  const lockAtMs = Math.min(...lockList)
  if (now >= lockAtMs) return { ok: false, error: 'The lock has passed; the entry is closed.' }
  const n = cleanNote(note)
  if (!n.ok) return n
  return { ok: true, row: doubleRow({ legs: legsIn, lockAtMs, card_date, version, lane: 'donovan', note: n.note }) }
}

// ── GRADING ───────────────────────────────────────────────────────────────────
/**
 * One leg's word from what the box score said: { played, landed, value?, values? }. A volume leg (it stored a `line`) is graded against that line from
 * `value`: over the line = hit, equal = push, under = miss; no value yet = not final. A yes/no leg is `landed`. A player who did not play is void.
 */
export function legWord(s, leg = null) {
  if (s == null) return null
  if (s.played === false) return 'void'
  if (leg && fin(leg.line)) {
    const v = s.values && leg.market && fin(s.values[leg.market]) ? s.values[leg.market] : s.value   // a player's stat per market ({ rec_yds, rush_yds })
    return !fin(v) ? null : v > leg.line ? 'hit' : v === leg.line ? 'push' : 'miss'
  }
  return s.landed ? 'hit' : 'miss'
}

/**
 * The row's result from its legs' words ('hit' / 'miss' / 'push' / 'void' / null = not final yet).
 *   straight, long_shot   its one leg
 *   two_man, double       BOTH-OR-NOTHING: any leg void = void (never a loss); both hit = hit; else miss; nothing until BOTH legs are known
 *   n_man                 ALL-OR-NOTHING, the same rule over every leg: any leg void (did not play, postponed) voids the whole ticket (never a loss, the stake comes
 *                         back; it is NOT re-priced as a shorter ticket); every leg hit = hit; else miss; nothing until EVERY leg is known (a leg that already
 *                         missed waits for the others, exactly as the Two-Man waits for its second leg, so the ticket is graded once, from the final box scores)
 */
export function productResult(product, legWords) {
  const w = legWords || []
  if (product === 'straight' || product === 'long_shot') return w[0] === 'hit' || w[0] === 'miss' || w[0] === 'void' || w[0] === 'push' ? w[0] : null
  if (w.length < 2 || w.some((x) => x !== 'hit' && x !== 'miss' && x !== 'void')) return null
  if (w.includes('void')) return 'void'
  return w.every((x) => x === 'hit') ? 'hit' : 'miss'
}

/** The fields a row takes once, when graded: { result, leg_results } or null. */
export function gradeCardRow(row, words) {
  const result = productResult(row?.product, words)
  return result ? { result, leg_results: words.map((w, i) => ({ player_id: row.legs?.[i]?.player_id ?? null, result: w })) } : null
}

/** A graded row may be written once: true when it has no result yet. */
export const isOpen = (row) => row && row.result == null

/** Where a leg's box-score entry sits in the results Map: a Double's legs are from different sports, so its key carries the sport. */
export const resultKey = (row, leg) => (row?.sport === DOUBLE_SPORT ? `${leg.sport}|${leg.game_id}|${leg.player_id}` : `${leg.game_id}|${leg.player_id}`)
export const resultKeyAny = (row, leg) => (row?.sport === DOUBLE_SPORT ? `${leg.sport}|${leg.game_id}|*` : `${leg.game_id}|*`)

// ── THE RECORD ────────────────────────────────────────────────────────────────
/**
 * The price of a row from its legs' stored prices (leg prices: [{ median, best }|null, ...]): a straight is its leg's price; a
 * two-man or a double is the PRODUCT of its two legs' prices (the two stored prices multiplied), and only when BOTH are on file.
 * @returns {{ median, best } | null}  American odds of the combined bet
 */
export function rowPrice(row, legPrices) {
  const p = legPrices || []
  if (p.length !== (row?.legs?.length || 0) || p.some((x) => !x || !fin(Number(x.median)) || !fin(Number(x.best)))) return null
  if (row.product === 'straight' || row.product === 'long_shot') return { median: Number(p[0].median), best: Number(p[0].best) }
  const dm = p.reduce((a, x) => a * decimalOf(Number(x.median)), 1)
  const db = p.reduce((a, x) => a * decimalOf(Number(x.best)), 1)
  return { median: americanOfDecimal(dm), best: americanOfDecimal(db), decimal: { median: dm, best: db } }
}

/** A leg's price when the lock FROZE one with it (a volume pick, a Long Shot, a Double leg); else the lock snapshot's (`fallback`). */
export const legPriceOf = (leg, fallback = null) => (leg?.price && Number.isInteger(leg.price.median) ? { median: leg.price.median, best: Number.isInteger(leg.price.best) ? leg.price.best : leg.price.median } : fallback)

/** The count the model expects of ONE row if its legs were independent: the product of each leg's stored rate. null when a rate is missing. */
export function rowExpected(row) {
  const rates = (row?.legs || []).map((l) => num(l?.rate))
  return rates.length && rates.every((r) => r != null && r >= 0 && r <= 1) ? rates.reduce((a, b) => a * b, 1) : null
}

/**
 * ONE RECORD from rows (one product of one lane). `priceOf(row)` -> { median, best } | null (lib/card/store.js joins the stored lock
 * prices). Voids are no result; a push (a volume pick that landed on the line) is no result either and returns the stake. Units are quoted only at
 * `minPriced` priced graded calls (MIN_PRICED; a Long Shot needs MIN_LONG_SHOTS), at each row's flat stake; fewer says so.
 * @returns {{ n, graded, hits, misses, voids, pushes, pending, pct, ci, expected, expectedN, priced, units, unitsWhy }}
 */
export function recordOf(rows, { priceOf = () => null, minPriced = MIN_PRICED } = {}) {
  const out = { n: 0, graded: 0, hits: 0, misses: 0, voids: 0, pushes: 0, pending: 0, pct: null, ci: null, expected: null, expectedN: 0, priced: 0, units: null, unitsWhy: null }
  let exp = 0
  const mix = { called: 0, board: 0 }
  const priced = []
  for (const r of rows || []) {
    out.n += 1
    if (r.result == null) { out.pending += 1; continue }
    if (r.result === 'void') { out.voids += 1; continue }
    if (r.result === 'push') { out.pushes += 1; continue }
    if (r.result !== 'hit' && r.result !== 'miss') continue
    out.graded += 1
    for (const l of r.legs || []) { if (l?.status === 'off') mix.off = (mix.off || 0) + 1; else mix[l?.status === 'board' ? 'board' : 'called'] += 1 }   // a hand-picked man who is not on the board is counted as neither
    if (r.result === 'hit') out.hits += 1; else out.misses += 1
    const e = rowExpected(r)
    if (e != null) { exp += e; out.expectedN += 1 }
    const p = priceOf(r)
    if (p) priced.push({ r, p })
  }
  if (out.graded) { out.pct = r1((100 * out.hits) / out.graded); out.ci = wilson(out.hits, out.graded) }
  if (out.expectedN) out.expected = r1(exp)
  out.mix = mix
  out.priced = priced.length
  if (priced.length >= minPriced) {
    const ret = (key) => priced.reduce((a, { r, p }) => {
      const stake = num(r.stake) ?? STAKE[r.product] ?? 1
      if (r.result !== 'hit') return a - stake
      const dec = key === 'best' ? (p.decimal?.best ?? decimalOf(p.best)) : (p.decimal?.median ?? decimalOf(p.median))
      return a + stake * (dec - 1)
    }, 0)
    out.units = { median: Math.round(ret('median') * 10) / 10, best: Math.round(ret('best') * 10) / 10 }
  } else {
    out.unitsWhy = `not enough priced calls yet (${priced.length} of ${minPriced})`
  }
  return out
}

/** The market a stored straight row belongs to (a first-Card row has none: it is the anytime market). */
export const marketKeyOf = (row) => row?.market || row?.legs?.[0]?.market || 'anytime'

/**
 * The records a sport shows, lanes and markets never mixed:
 *   straight           the bot's anytime straights (the first Card's included)
 *   volume[market]     one record per volume market that has rows (shots on goal, receiving yards ...)
 *   two_man            the bot's Two-Man from different games
 *   two_man_same_game  the bot's SAME-GAME Two-Man, shown separately (its legs are correlated)
 *   donovan            Donovan's Two-Man
 *   double, donovan_double   the cross-sport Double (rows of sport 'all'), the bot's and his
 *   long_shot          the Long Shot of the day: units and K of N only from MIN_LONG_SHOTS graded
 */
export function recordsOf(rows, opts) {
  const all = rows || []
  const by = (lane, product) => all.filter((r) => r.lane === lane && r.product === product)
  const straights = by('bot', 'straight')
  const volume = {}
  for (const r of straights) { const k = marketKeyOf(r); if (k !== 'anytime') (volume[k] ||= []).push(r) }
  const twoMan = by('bot', 'two_man')
  return {
    straight: recordOf(straights.filter((r) => marketKeyOf(r) === 'anytime'), opts),
    volume: Object.fromEntries(Object.entries(volume).map(([k, v]) => [k, recordOf(v, opts)])),
    two_man: recordOf(twoMan.filter((r) => !isSameGameRule(r.rule)), opts),
    two_man_same_game: recordOf(twoMan.filter((r) => isSameGameRule(r.rule)), opts),
    donovan: recordOf(by('donovan', 'two_man'), opts),
    donovan_straight: recordOf(by('donovan', 'straight'), opts),      // HIS straights (2026-10-12): their own record, never in the bot's `straight`, the Card's, his Two-Man's or N-man's
    donovan_n_man: recordOf(by('donovan', 'n_man'), opts),      // his N-man (2 to 6 legs, all must land): its own record, never mixed into his Two-Man's (a 2-leg N-man counts HERE, not in `donovan`)
    double: recordOf(by('bot', 'double'), opts),
    donovan_double: recordOf(by('donovan', 'double'), opts),
    long_shot: recordOf(by('bot', 'long_shot'), { ...opts, minPriced: MIN_LONG_SHOTS }),
  }
}

// ── WORDS (the same sentence on the site, the ledger and the posts) ───────────
const ci = (x) => (x?.ci ? `${x.ci[0].toFixed(0)}–${x.ci[1].toFixed(0)}%` : null)
const signed = (v) => `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}`
const fmtAmerican = (a) => (a == null ? null : a > 0 ? `+${a}` : `${a}`)
export { fmtAmerican }

/**
 * A record as short plain sentences: K of N, how many the legs' stored rates expected if they were independent, the 95% range, and
 * units only when there are enough priced calls. Counts only; no chance is printed. `label` names a market's line ("shots on goal straights");
 * `sameGame` adds the correlation caption; a Long Shot (product 'long_shot') shows ONLY a count until MIN_LONG_SHOTS are graded.
 */
export function recordWords(rec, { product = 'straight', who = '', label = null, sameGame = false } = {}) {
  if (!rec || (!rec.graded && !rec.voids && !rec.pending && !rec.pushes)) return []
  if (rec.tracking) return [`${who}${trackingWords(rec.tracking)}`]   // BUCKETS under the 30-night floor (lib/card/store.js nbaFloored): no tally
  if (product === 'long_shot' && rec.graded < MIN_LONG_SHOTS) {
    const total = rec.graded + rec.voids + rec.pushes
    return [`${who}${total} long shot${total === 1 ? '' : 's'} so far${rec.pending ? `, ${rec.pending} waiting on a final` : ''}.`, `Counts only until ${MIN_LONG_SHOTS} are graded; each day's result is posted, wins and misses alike.`]
  }
  const pair = product === 'two_man' || product === 'double' || product === 'n_man'
  const nm = label || (product === 'two_man' ? 'two-mans' : product === 'n_man' ? 'tickets' : product === 'double' ? 'doubles' : product === 'long_shot' ? 'long shots' : 'straights')
  const head = rec.graded
    ? `${who}${rec.hits} of ${rec.graded} ${nm} ${product === 'n_man' ? 'landed every leg' : pair ? 'landed both legs' : product === 'long_shot' ? 'landed' : 'hit'}${rec.pct != null ? ` (${rec.pct}%${ci(rec) ? `, 95% range ${ci(rec)}` : ''})` : ''}.`
    : `${who}No ${nm} graded yet${rec.pending ? ` (${rec.pending} waiting on a final)` : ''}.`
  const out = [head]
  if (rec.graded && rec.expected != null) out.push(`If the legs were independent we would expect ${rec.expected.toFixed(1)} (${rec.expectedN} of ${rec.graded} with a stored rate).`)
  if (rec.mix?.board) out.push(`Legs: ${rec.mix.called} CALLED, ${rec.mix.board} ON THE BOARD.`)
  if (rec.voids) out.push(`${rec.voids} voided (a player did not play).`)
  if (rec.pushes) out.push(`${rec.pushes} pushed (landed on the line; the stake is returned).`)
  if (rec.units) out.push(`Flat stakes on ${rec.priced} priced calls: ${signed(rec.units.median)} units at the median price${product === 'long_shot' ? '' : `, ${signed(rec.units.best)} at the best`}.`)
  else if (rec.graded) out.push(`Units: ${rec.unitsWhy || 'not enough priced calls yet'}.`)
  if (sameGame) out.push(SAME_GAME_NOTE)
  return out
}

// ── TRACKED, NOT ON THE CARD (Donovan, 2026-10-11) ─────────────────────────────────────────────────────────────────
/**
 * The record of the picks that fell short of a floor (rows of card_tracked: lib/card/store.js), graded by the same grader as the Card. Per ONE unit
 * staked: a win returns price/100 (plus money) or 100/|price| (minus), a loss is -1 (rules.js trackedUnits). Units are quoted on the priced ones
 * from the first (it is a record of what the floors kept off the Card, not a sample for a decision); a pick with no stored price is graded and has no units.
 * @returns {{ straight, two_man }} each recordOf's shape plus `units` over the priced graded ones
 */
export function trackedRecordsOf(rows) {
  const by = (product) => (rows || []).filter((r) => r.product === product)
  const rec = (list) => recordOf(list, { minPriced: 1, priceOf: (r) => rowPrice(r, (r.legs || []).map((l) => legPriceOf(l, null))) })
  return { straight: rec(by('straight')), two_man: rec(by('two_man')) }
}

/** A tracked record in plain sentences: K of N, the 95% range, units on the priced ones, and how many had no price. Counts only; no chance is printed. */
export function trackedWords(rec, { product = 'straight' } = {}) {
  if (!rec || (!rec.graded && !rec.voids && !rec.pending && !rec.pushes)) return []
  if (rec.tracking) return [trackingWords(rec.tracking)]
  const nm = product === 'two_man' ? 'two-mans' : 'straights'
  const head = rec.graded
    ? `${rec.hits} of ${rec.graded} ${nm} ${product === 'two_man' ? 'landed both legs' : 'hit'}${rec.pct != null ? ` (${rec.pct}%${ci(rec) ? `, 95% range ${ci(rec)}` : ''})` : ''}.`
    : `No tracked ${nm} graded yet${rec.pending ? ` (${rec.pending} waiting on a final)` : ''}.`
  const out = [head]
  if (rec.voids) out.push(`${rec.voids} voided (a player did not play).`)
  if (rec.pushes) out.push(`${rec.pushes} pushed (landed on the line; the stake is returned).`)
  if (rec.units) out.push(`One unit each on ${rec.priced} priced: ${signed(rec.units.median)} units at the median price.`)
  const unpriced = rec.graded - rec.priced
  if (unpriced > 0) out.push(`${unpriced} had no stored price, so they are counted above and carry no units.`)
  out.push(`These fell short of the Card's floors (straights +${FLOORS.straight}, a Two-Man +${FLOORS.twoMan}, high lines for yards). Tracked apart from the Card.`)
  return out
}

// ── ONE WINDOW, PLANNED (the pure heart of the lock and of the dry run) ─────────────────────────────────────────
/**
 * Everything one card window locks at `now`: the straights by slate size (in their markets), the Two-Man (same-game on a one-game non-baseball
 * window), and the Long Shot (a full slate only). `inputs` = lib/card/sources.js loadCardInputs. Nothing is written here.
 * @returns {{ rows, tracked, skipped, plays, games, longShot: { pick, reason } }}  (`tracked` = the picks that fell short of a floor: kept, graded, not on the Card)
 */
export function planWindow({ sport, win, inputs, now, version = CARD_VERSION, pairNote = null }) {
  const lockAtMs = lockAtFor(sport, win.first_start_ms)
  const p = lockPlan({ sport, slate_key: win.slate_key, card_date: win.card_date, byMarket: inputs.byMarket, games: inputs.games ?? win.games, now, lockAtMs, version, pairNote })
  const rows = [...p.rows]
  let longShot = { pick: null, reason: p.games >= FULL_SLATE ? 'stored prices could not be read' : `${p.games} game${p.games === 1 ? '' : 's'} (a full slate is ${FULL_SLATE}+)` }
  // a sport with no anytime market (BUCKETS) takes its Long Shot from any market, each man at his own stored line and price
  const anyMarket = !MARKETS[sport]?.anytime
  if (inputs.prices || anyMarket) {
    longShot = pickLongShot({ games: p.games, cands: anyMarket ? anyMarketField(inputs.byMarket) : (inputs.all || inputs.byMarket?.anytime?.cands || []), prices: anyMarket ? null : inputs.prices, now })
    if (longShot.pick) rows.push(longShotRow({ sport, slate_key: win.slate_key, card_date: win.card_date, pick: longShot.pick, games: p.games, lockAtMs, version, board: inputs.byMarket?.anytime?.board || null }))
  }
  return { rows, tracked: p.tracked, skipped: p.skipped, plays: p.plays, games: p.games, longShot }
}
