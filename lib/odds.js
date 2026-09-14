'use client'

// 💰 ODDS — the book's line, and the only comparison that matters.
//
// The bot publishes odds_latest.json (bots/odds_fetch.py). This file is the
// site's read of it, and it exists to enforce ONE idea:
//
//   A HIT RATE IS ONLY MEANINGFUL AGAINST A PRICE.
//
// Every board on this site scores against a default bar. "Cleared it 62% of
// the time" reads like a good bet and is a LOSING one at -180, which needs
// 64.3% just to break even. The score can never tell you that; the line can.
// So nothing here renders a price on its own — it renders the price next to
// what you'd need, and says which way the gap points.
//
// The bot keys by MLB player_id where its name join succeeded, and by
// normalised name where it didn't. Both are tried, because a miss on the id
// map is exactly the case where the name is all anyone has.

// The props grid's own row keys -> the market that settles them. The grid has
// two rows no pick category covers (runs, RBIs) and two nothing prices at all
// (walks, strikeouts) — those simply carry no price, which is honest.
export const GRID_MARKET = {
  hit: 'batter_hits',
  tb2: 'batter_total_bases',
  hr: 'batter_home_runs',
  hrr: 'batter_hits_runs_rbis',
  run: 'batter_runs_scored',
  rbi: 'batter_rbis',
  bb: null,
  k1: null,
}

export const CATEGORY_MARKET = {
  TOP: 'batter_home_runs',
  HR: 'batter_home_runs',
  HIT: 'batter_hits',
  HRR: 'batter_hits_runs_rbis',
  CONTACT: 'batter_total_bases',
}

// The book line that asks for exactly what each pick's bar asks for. HR needs
// 1+, which is the over on 0.5; HRR needs 2+ H+R+RBI, the over on 1.5; CONTACT
// needs 2+ TB, also 1.5. These are the bars in lib/liveSlate.js's pickCleared()
// restated as market numbers, and they are the only lines whose price can be
// honestly shown beside a pick's record.
export const CATEGORY_LINE = {
  TOP: 0.5, HR: 0.5, HIT: 0.5, HRR: 1.5, CONTACT: 1.5,
}

const SUFFIX = /^(jr|sr|ii|iii|iv|v)$/

// Must match norm_name() in bots/odds_fetch.py. If these two ever disagree the
// by-name fallback silently stops matching anyone.
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

/**
 * THE PRICE RULE (Path to Victory A2, 2026-09-14). Home runs only.
 *
 * Measured on the site's own P&L — bots/odds_history.py, flat one unit at the
 * consensus price on every HR pick the board named, 08-15 → 09-13, 736 bets:
 *
 *   mid      +151..+400   n=142   hit 20.4%   ROI −13.0% ±14.6   priced short
 *   long     +401..+900   n=438   hit 15.8%   ROI  +4.4% ±11.8   TAKEN
 *   lottery  +901 and up  n=156   hit  5.1%   ROI −21.8% ±30.7   PASS
 *
 * Lottery is the leak in three independent samples (−22% here, −24% and −34%
 * in the two 09-13 joins), same direction every time, with a mechanism: +901
 * props are the wall-scraper bats the board measures BELOW random on. The
 * long band is the only one above water — "not losing," not "proven," at
 * that error bar. This changes NO score. It is a rule about which prices the
 * site will put its name next to, and every surface that prints a price
 * beside a homer pick reads it from here.
 */
export const PRICE_BANDS = [
  { key: 'lottery', label: 'PASS',  lo: 901, hi: Infinity, take: false, why: '+901 and up: 5.1% hit on 156 bets, ROI −21.8%. The wall-scraper price. Never taken.' },
  { key: 'long',    label: 'PLAY',  lo: 401, hi: 900,      take: true,  why: '+401 to +900: 15.8% hit on 438 bets, ROI +4.4%. The one band above water.' },
  { key: 'mid',     label: 'SHORT', lo: 151, hi: 400,      take: false, why: '+151 to +400: 20.4% hit on 142 bets, ROI −13.0%. Right about who, wrong about the number.' },
]

/** American price → the band it falls in, or null for prices the rule does not speak to. */
export function priceBand(american) {
  const v = Number(american)
  if (!Number.isFinite(v) || v === 0) return null
  return PRICE_BANDS.find((b) => v >= b.lo && v <= b.hi) || null
}

/** True when a homer price is one the site will stand behind. Non-plus and short prices are not refused here — only the lottery band is. */
export function priceTaken(american) {
  const b = priceBand(american)
  return !(b && b.take === false && b.key === 'lottery')
}

export function fmtOdds(odds) {
  const n = Number(odds)
  if (!Number.isFinite(n) || n === 0) return '—'
  return n > 0 ? `+${n}` : `${n}`
}

/**
 * The quote for one player in one pick category, or null.
 *
 * @param odds   the published odds_latest.json
 * @param player a slate row
 * @param cat    TOP | HR | HIT | HRR | CONTACT
 */
export function quoteFor(odds, player, cat) {
  const key = String(cat || '').toUpperCase()
  const market = CATEGORY_MARKET[key]
  if (!odds || !market || !player) return null
  const byId = odds.by_player_id?.[String(player.player_id ?? player.id)]
  const byName = odds.by_name?.[normName(player.name || player.player_name)]
  const q = (byId || byName)?.[market]
  if (!q) return null
  // Does the book's number ask for the same thing the pick's bar does? An HR
  // pick has to clear 1+, which is the over on 0.5 — a book sitting on 1.5 is
  // selling a multi-homer game, and pairing that price with this pick's
  // record would be nonsense. Same failure the props grid guards against.
  const want = CATEGORY_LINE[key]
  const matches = want == null || Math.abs(Number(q.line) - want) < 1e-9
  return { ...q, market, cat: key, wantLine: want, matches }
}

/**
 * The verdict: does the model's rate clear what the price demands?
 *
 * `rate` is the hitter's own historical rate for that category, as a
 * percentage — the "When picked" / track-record number, NOT the 0-100 score.
 * A score is not a probability and must never be compared to one; passing a
 * score in here would produce confident nonsense, so it is the caller's job to
 * hand over a real rate and null otherwise.
 */
export function edgeOf(quote, rate) {
  const need = quote?.implied ?? impliedPct(quote?.over)
  if (rate == null || rate === '') return null
  const have = Number(rate)
  if (need == null || !Number.isFinite(have)) return null
  const diff = Math.round(10 * (have - need)) / 10
  return {
    need, have, diff,
    // Deliberately coarse. At the sample sizes this project actually has, a
    // 1.5-point "edge" is noise wearing a costume — see the NFL card, where
    // every market's measured edge sat inside its own error bar.
    verdict: diff >= 5 ? 'value' : diff <= -5 ? 'priced_out' : 'fair',
  }
}

export const VERDICT = {
  value: { label: 'value', tone: 'good' },
  fair: { label: 'fairly priced', tone: 'flat' },
  priced_out: { label: 'priced out', tone: 'bad' },
}

/**
 * The quote for a props-grid row, but ONLY when the book is offering the same
 * bet the row is measuring.
 *
 * A row reading "2+ TB" is the over on a 1.5 line — threshold = line + 0.5.
 * If the book is at 2.5, that is a DIFFERENT BET and pairing its price with
 * this row's hit rate would be quietly, confidently wrong. So a mismatch
 * returns the quote flagged rather than silently: the grid can then say the
 * book is at another number, which is itself useful.
 */
export function gridQuote(odds, player, rowKey, threshold) {
  const market = GRID_MARKET[rowKey]
  if (!odds || !market || !player) return null
  const byId = odds.by_player_id?.[String(player.player_id ?? player.id)]
  const byName = odds.by_name?.[normName(player.name || player.player_name)]
  const q = (byId || byName)?.[market]
  if (!q) return null
  const t = Number(q.line) + 0.5
  return { ...q, market, threshold: t, matches: Math.abs(t - Number(threshold)) < 1e-9 }
}

/**
 * The price at which a rate breaks even — his TRUE price for this prop.
 *
 * Donovan, 2026-08-15: "find the true price of a player to do certian things."
 * If he clears the bar 42% of the time, anything longer than +138 is value and
 * anything shorter is not. That single number is what makes a hit rate
 * actionable instead of trivia.
 */
export function fairOdds(pct) {
  const p = Number(pct) / 100
  if (!Number.isFinite(p) || p <= 0 || p >= 1) return null
  return p >= 0.5 ? -Math.round((100 * p) / (1 - p)) : Math.round((100 * (1 - p)) / p)
}

/** Is this payload worth reading at all? */
export function oddsLooksReal(j) {
  if (!j || typeof j !== 'object') return false
  const a = j.by_player_id && Object.keys(j.by_player_id).length
  const b = j.by_name && Object.keys(j.by_name).length
  return Boolean(a || b)
}

/**
 * His own per-GAME home-run probability, from the slate's `hr_per_pa`.
 *
 * This is the one category where the slate publishes a real rate rather than a
 * score, so it is the one category where a price can be judged on this site
 * without a per-player fetch. Everything else — hits, H+R+RBI, total bases —
 * gets its price shown and NO verdict, because the only per-game numbers the
 * slate carries for those are 0-100 scores and a score is not a probability.
 * Showing a green "value" chip off a score would be the most confident wrong
 * thing on the page.
 *
 * PA is the lineup spot's rough plate-appearance count, not a constant 4.2: a
 * leadoff man gets close to five trips and a nine-hole hitter closer to four,
 * which is a bigger swing than most of the edges being measured here.
 */
export function hrPerGame(player) {
  // New slates publish the same small-sample-shrunk season estimate used to
  // rank pair/pool legs. Prefer it so the odds screen and ticket builder do
  // not disagree about the player's baseline. Older slates fall through to
  // the original transparent HR/PA conversion below.
  const published = Number(player?.season_hr_game_probability)
  if (Number.isFinite(published) && published > 0 && published < 1) return 100 * published
  const perPa = Number(player?.hr_per_pa)
  if (!Number.isFinite(perPa) || perPa <= 0) return null
  const spot = Number(player?.lineup_spot)
  const pa = Number.isFinite(spot) && spot >= 1 && spot <= 9
    ? 4.7 - (spot - 1) * 0.085
    : 4.3
  return 100 * (1 - Math.pow(1 - perPa, pa))
}
