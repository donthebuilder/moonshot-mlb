// FANTASY BETTING LINES, FOR FUN (2026-09-07)
//
// Donovan: "add like betting odds moneyline for fun and like a spread type
// thing." Nobody is staking anything on these -- they are a way of saying
// "this matchup is close" or "you are a big favourite" in the language the
// rest of DASH already speaks.
//
// ── WHAT THESE NUMBERS ARE, AND WHAT THEY ARE NOT ──────────────────────────
//
// The spread is just the projected margin. That part is honest arithmetic.
//
// The moneyline is NOT. It rests on one assumption: how much a fantasy team's
// weekly score bounces around its projection. That is a real, measurable
// number and this league has not played a game yet, so it cannot be measured
// here. TEAM_SD below is the published range for a 9-starter PPR league
// (weekly team scores land roughly 25 points either side of projection), used
// as a stated prior rather than a fitted value.
//
// Everything downstream inherits that. A 10-point favourite is priced at about
// -175 with TEAM_SD 25; move the assumption to 20 and the same matchup is
// -260. So the WIDTH of these prices is a guess even when the projections are
// good. After a few weeks of real scores the league's own SD can replace it,
// and the lines get sharper for free -- that is the upgrade worth doing, and
// it needs data this league does not have yet.
//
// NO VIG. A sportsbook prices both sides so the pair adds to more than 100% --
// that gap is its margin. There is no book here and no money, so the two
// moneylines are fair odds off the same probability and they add to exactly
// 100%. If these ever sat beside real prices, the difference between the two
// is the thing to look at, and vig on our side would just be noise in it.

/** Weekly standard deviation of one fantasy team's score, in points. A stated
 *  prior, not a fit -- see the header. */
export const TEAM_SD = 25

/** Two independent team scores, so the margin's SD is sqrt(2) times one. */
const MARGIN_SD = TEAM_SD * Math.SQRT2

// Abramowitz & Stegun 7.1.26. Max error 1.5e-7, which is far below the error
// in TEAM_SD and costs nothing.
function erf(x) {
  const sign = x < 0 ? -1 : 1
  const z = Math.abs(x)
  const t = 1 / (1 + 0.3275911 * z)
  const y = 1 - ((((1.061405429 * t - 1.453152027) * t + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z)
  return sign * y
}

const normalCdf = (x) => 0.5 * (1 + erf(x / Math.SQRT2))

/** American odds from a fair probability. Rounded to 5, the way a book quotes.
 *  Clamped: a 99% favourite is -2000 here rather than -9900, because past a
 *  point the number stops meaning anything and starts looking broken. */
export function americanOdds(probability) {
  const p = Math.min(0.95, Math.max(0.05, Number(probability) || 0))
  const raw = p >= 0.5 ? -(p / (1 - p)) * 100 : ((1 - p) / p) * 100
  const rounded = Math.round(raw / 5) * 5
  return Math.max(-2000, Math.min(2000, rounded))
}

export const formatOdds = (odds) => (odds > 0 ? `+${odds}` : String(odds))

/** Half-point spreads, so a line can never push. */
const half = (n) => Math.round(n * 2) / 2

/**
 * The line for one matchup.
 *
 * Returns null unless BOTH sides have something to price. A team that has not
 * set a lineup projects 0, and pricing that produces "Flash Mob -107.5" --
 * which reads as a historic mismatch and is really a manager who has not opened
 * the app yet. Franchise had exactly this on its Week 1 board (juu team, 0.0
 * projected). Saying nothing is the honest output; the row falls back to "vs".
 */
export function matchupOdds(homeProjection, awayProjection) {
  const home = Number(homeProjection) || 0
  const away = Number(awayProjection) || 0
  if (home <= 0 || away <= 0) return null

  const margin = home - away
  const homeWinProbability = normalCdf(margin / MARGIN_SD)
  const awayWinProbability = 1 - homeWinProbability
  const spread = half(margin)

  return {
    total: half(home + away),
    margin,
    spread,                                  // positive = home favoured
    homeWinProbability,
    awayWinProbability,
    homeOdds: americanOdds(homeWinProbability),
    awayOdds: americanOdds(awayWinProbability),
    // The favourite's line is the negative number: "HOME -6.5".
    homeSpreadLabel: spread === 0 ? 'PK' : (spread > 0 ? `-${half(Math.abs(spread))}` : `+${half(Math.abs(spread))}`),
    awaySpreadLabel: spread === 0 ? 'PK' : (spread > 0 ? `+${half(Math.abs(spread))}` : `-${half(Math.abs(spread))}`),
    pickEm: Math.abs(spread) < 0.5,
  }
}

/** One line of plain English for the card, so the numbers are never alone. */
export function oddsSentence(odds, homeName, awayName) {
  if (!odds) return ''
  if (odds.pickEm) return 'A coin flip on the projections.'
  const favourite = odds.spread > 0 ? homeName : awayName
  const pct = Math.round(Math.max(odds.homeWinProbability, odds.awayWinProbability) * 100)
  return `${favourite || 'The favourite'} by ${Math.abs(odds.spread)}, and wins this ${pct} times in 100 — if a fantasy week were as predictable as its projections, which it is not.`
}
