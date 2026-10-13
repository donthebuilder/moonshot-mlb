// THE CARD'S FLOORS: THE ONE CONFIG (Donovan, 2026-10-11). Pure. The picker (lib/card/core.js planStraights / pickTwoMan), the loader
// (lib/card/sources.js loadLines), the tracking record (lib/card/store.js) and every line of copy (lib/card/text.js, CARD_RULE_TEXT) read
// THESE numbers and no others. Change a number here and nowhere else.
//
// DONOVAN, 2026-10-11 (his words): "the new line should be 100 yards rushing and receiving, not 40+, that's very low for these good players.
//   then the parlay (Two-Man) odds need to be minimum higher, at least 6 to 1 ... [final: 5 to 1 for the two-mans] and the straight I would like
//   no less than +120; Jahmyr Gibbs at -500 is a bad straight and honestly for events like HR/TD [anytime] it is dumb; goals are the exception,
//   and certain players for double double, but that's not what we're looking for all the way; yes we want to track them but returns too."
//   LINES   receiving yards 100+, rushing yards 100+, passing yards 300+ ("these are professionals"); catches raised too: 7+ is MY PROPOSAL.
//   NO PRICE  a pick with no stored price is not a Card straight: no price = not on the Card, still tracked.
//   FLOORS  every Card straight >= +120; the Two-Man's combined price >= +500 (5 to 1). His own Donovan lane (hand entries at /admin/two-man)
//           is never blocked by a floor (MY DEFAULT: it is his pick, his lane, his record).
//   SHORT PRICES  an anytime TD / HR at a heavy-favourite price is never a Card straight (the +120 floor does it). GOALS (NHL anytime) are the
//           exception and exempt from the straight floor. Everything that fails is TRACKED, not dropped: its own graded result and the units it
//           would have returned (win = price/100 at plus money, 100/|price| at minus, loss = -1), graded by the existing grader.
//
// A rule change applies from the NEXT lock forward: a locked card_calls row, its stored line, price and model_version are never touched.

/** The floors, in American odds. */
export const FLOORS = Object.freeze({
  straight: 120,    // a Card straight's stored median price at the lock must be +120 or longer
  twoMan: 500,      // the Two-Man's two stored prices multiplied: +500 (5 to 1) or longer
})

/**
 * MINIMUM BAR per sport and market: the line a straight must clear, in hits needed ("100+" yards = at least 100). A stored book line of 99.5 is a
 * 100+ bar (over 99.5 needs 100); a whole-number line of 100 needs 101. Keyed by the Card's own market key (lib/card/core.js MARKETS), then the
 * same key for markets that join a slot later. A market with no entry has no line floor (shots, hits and H+R+RBI were not changed on 10-11).
 * Catches (`rec`) 7+ is a PROPOSAL of mine, not Donovan's number.
 */
export const MIN_BAR = Object.freeze({
  nfl: Object.freeze({ rec_yds: 100, rush_yds: 100, pass_yds: 300, rec: 7 }),
  // BUCKETS (PREVIEW ONLY, 2026-10-12): NOT a new number. The bar each NBA market is already CALLED and graded on (lib/nba/model.js NBA_MARKETS bar: points 25+,
  // rebounds 10+, assists 8+, threes 4+, PRA 35+). A stored book line must be at least that high to be a Card straight, so a 14.5-point line on a role player is
  // tracked, not carded. scripts/check-buckets-parity.mjs holds these equal to the model's own bars.
  nba: Object.freeze({ pts: 25, reb: 10, ast: 8, '3pm': 4, pra: 35 }),
})

/** Markets exempt from the straight price floor, per sport: goals only (NHL anytime goal). They still need a stored price. */
export const PRICE_FLOOR_EXEMPT = Object.freeze({ nhl: Object.freeze(['anytime']) })

/** The lane never blocked by a floor: Donovan's hand entries. */
export const FLOOR_EXEMPT_LANES = Object.freeze(['donovan'])

/** The tracked record is per ONE unit staked (Donovan's definition of the return); it is its own record, never added to the Card's. */
export const TRACKED_STAKE = 1
export const TRACKED_VERSION = 'tracked-v1'
export const TRACKED_RULE = Object.freeze({ straight: 'tracked-straight-v1', two_man: 'tracked-two-man-v1' })

const fin = (v) => typeof v === 'number' && Number.isFinite(v)
const fmt = (a) => (a > 0 ? `+${a}` : `${a}`)

// ── PRICE ARITHMETIC (moved here from core.js so the floors and the record share it; core.js re-exports) ──
/** Profit on a 1-unit stake that wins at American odds `a`. */
export const winProfit = (a) => (a > 0 ? a / 100 : 100 / -a)
/** The decimal payout multiple (stake included) of an American price. */
export const decimalOf = (a) => 1 + winProfit(a)
/** A decimal multiple back to American odds, whole number. */
export const americanOfDecimal = (d) => (d >= 2 ? Math.round((d - 1) * 100) : -Math.round(100 / (d - 1)))

/** Units a tracked bet returned on ONE unit staked: a win is price/100 (plus money) or 100/|price| (minus), a loss is -1; a void, a push or an ungraded one returns nothing (null). */
export function trackedUnits(result, median) {
  if (!Number.isInteger(median) || median === 0) return null
  if (result === 'hit') return winProfit(median)
  if (result === 'miss') return -1
  return null
}

// ── LINE FLOOR ────────────────────────────────────────────────────────────────
/** The hits needed to beat an over line: 99.5 -> 100, 100 -> 101. */
export const barOfLine = (line) => (line == null || line === '' || !fin(Number(line)) ? null : Math.floor(Number(line)) + 1)
/** The minimum bar for a market (null = none). */
export const minBarOf = (sport, market) => MIN_BAR[sport]?.[market] ?? null
/** True when a stored over line clears the market's floor (a market with no floor always does; a missing line never does when there is a floor). */
export function lineClears(sport, market, line) {
  const floor = minBarOf(sport, market)
  if (floor == null) return true
  const bar = barOfLine(line)
  return bar != null && bar >= floor
}
/**
 * Among the stored over rungs of ONE player in ONE market ([{ line, ...}]): the rung to use. The lowest rung that clears the floor when one is
 * published ("selects 100+ rungs whenever published"); else the lowest published rung (it fails the floor and says so). null with none.
 */
export function chooseRung(rungs, sport, market) {
  const list = (rungs || []).filter((r) => fin(Number(r?.line))).sort((a, b) => Number(a.line) - Number(b.line))
  if (!list.length) return null
  return list.find((r) => lineClears(sport, market, r.line)) || list[0]
}

// ── PRICE FLOOR ───────────────────────────────────────────────────────────────
export const isPriceExempt = (sport, market) => (PRICE_FLOOR_EXEMPT[sport] || []).includes(market || 'anytime')

/**
 * May this candidate be a CARD straight? `cand` = { price: { median }, line? }. The checks run in order: line floor, price on file, price floor.
 * @returns {{ ok: true } | { ok: false, code: 'line'|'no_price'|'price', reason: string }}
 */
export function straightVerdict(sport, market, cand) {
  const key = market || 'anytime'
  const floor = minBarOf(sport, key)
  if (floor != null && fin(Number(cand?.line)) && !lineClears(sport, key, cand.line)) return { ok: false, code: 'line', reason: `line ${cand.line} (${barOfLine(cand.line)}+) is under the ${floor}+ floor` }
  const m = cand?.price?.median
  if (!Number.isInteger(m)) return { ok: false, code: 'no_price', reason: 'no stored price at the lock' }
  if (!isPriceExempt(sport, key) && m < FLOORS.straight) return { ok: false, code: 'price', reason: `${fmt(m)} is under the ${fmt(FLOORS.straight)} floor` }
  return { ok: true }
}

/** The combined American price of legs' stored median prices multiplied, or null when any leg has none. */
export function combinedPrice(prices) {
  const p = prices || []
  if (!p.length || p.some((x) => !x || !Number.isInteger(x.median))) return null
  return americanOfDecimal(p.reduce((a, x) => a * decimalOf(x.median), 1))
}

/** Is a combined American price long enough for a Two-Man? */
export const meetsTwoManFloor = (combined) => Number.isInteger(combined) && combined >= FLOORS.twoMan

/**
 * May this pair be a CARD Two-Man? `prices` = the two legs' stored { median }.
 * @returns {{ ok: true, combined } | { ok: false, code: 'no_price'|'price', reason, combined? }}
 */
export function twoManVerdict(prices) {
  const combined = combinedPrice(prices)
  if (combined == null) return { ok: false, code: 'no_price', reason: 'a leg has no stored price at the lock' }
  if (!meetsTwoManFloor(combined)) return { ok: false, code: 'price', combined, reason: `${fmt(combined)} multiplied is under the ${fmt(FLOORS.twoMan)} floor` }
  return { ok: true, combined }
}

/** Is a lane exempt from every floor? (Donovan's.) */
export const laneExempt = (lane) => FLOOR_EXEMPT_LANES.includes(lane)

// ── THE WORDS (one sentence per rule, built from the numbers above so the copy can never drift from the config) ──
const BAR_WORD = { rec_yds: 'receiving yards', rush_yds: 'rushing yards', pass_yds: 'passing yards', rec: 'catches', pts: 'points', reb: 'rebounds', ast: 'assists', '3pm': 'threes', pra: 'PRA' }
export const lineFloorWords = (sport) => Object.entries(MIN_BAR[sport] || {}).map(([k, v]) => `${BAR_WORD[k] || k} ${v}+`).join(', ')
export const FLOOR_WORDS = Object.freeze({
  straight: `A straight needs a stored price of ${fmt(FLOORS.straight)} or longer${Object.keys(PRICE_FLOOR_EXEMPT).length ? ' (goals are the exception)' : ''}, and a yards pick a high line (receiving and rushing 100+, passing 300+); with no stored price a pick is tracked, not called.`,
  two_man: `The two prices multiplied must be ${fmt(FLOORS.twoMan)} (5 to 1) or longer.`,
  tracked: 'Picks that fell short of those floors are tracked, not dropped: the result and the units it would have returned at one unit are kept apart from the Card.',
})
