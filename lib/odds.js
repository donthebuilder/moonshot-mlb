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

export const CATEGORY_MARKET = {
  TOP: 'batter_home_runs',
  HR: 'batter_home_runs',
  HIT: 'batter_hits',
  HRR: 'batter_hits_runs_rbis',
  CONTACT: 'batter_total_bases',
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
  const market = CATEGORY_MARKET[String(cat || '').toUpperCase()]
  if (!odds || !market || !player) return null
  const byId = odds.by_player_id?.[String(player.player_id ?? player.id)]
  const byName = odds.by_name?.[normName(player.name || player.player_name)]
  const q = (byId || byName)?.[market]
  if (!q) return null
  return { ...q, market, cat: String(cat).toUpperCase() }
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

/** Is this payload worth reading at all? */
export function oddsLooksReal(j) {
  if (!j || typeof j !== 'object') return false
  const a = j.by_player_id && Object.keys(j.by_player_id).length
  const b = j.by_name && Object.keys(j.by_name).length
  return Boolean(a || b)
}
