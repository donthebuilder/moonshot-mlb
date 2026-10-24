// KALSHI DEPTH FOR THE NHL ANYTIME-GOAL MARKET (2026-10-24). Server only. Public read API, no key.
// Used as a trust signal beside lib/odds/devig.js: a price with real money resting on both sides
// of Kalshi's book is a price to believe. "Trusted" = $500+ on BOTH sides.
//
// Measured 10-23 (retired devig script): the orderbook lives under `orderbook_fp`
// ({ yes_dollars, no_dollars }: [price, size] pairs); `orderbook` answers empty. The date in a
// ticker is the game's own ET date (26OCT23), never UTC.
//
// FAIL-SOFT: any failure returns null/empty and the devig row simply has no Kalshi fields.
// A player is matched ONLY when exactly one open market for that date carries his surname;
// two matches (or none) is no match -- never a guess.
const BASE = 'https://api.elections.kalshi.com/trade-api/v2'
export const SERIES = 'KXNHLGOAL'
export const TRUST_USD = 500
const MON = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']

/** '2026-10-23' -> '26OCT23' */
export const dateSlug = (ymd) => `${ymd.slice(2, 4)}${MON[Number(ymd.slice(5, 7)) - 1]}${ymd.slice(8, 10)}`

const j = async (path) => {
  const r = await fetch(`${BASE}${path}`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
  if (!r.ok) throw new Error(`kalshi ${r.status}`)
  return r.json()
}

/** Open ATG markets for one ET game date. [] on any failure. */
export async function openMarkets(ymd) {
  try {
    const slug = dateSlug(ymd)
    const d = await j(`/markets?series_ticker=${SERIES}&status=open&limit=200`)
    return (d.markets || []).filter((m) => String(m.ticker || '').includes(slug) && String(m.ticker).endsWith('-1'))
  } catch { return [] }
}

/** The single market whose ticker carries this surname, else null. Pure. */
export function matchMarket(markets, playerName) {
  const last = String(playerName || '').trim().split(/\s+/).pop().toUpperCase().replace(/[^A-Z]/g, '')
  if (last.length < 3) return null
  const hit = (markets || []).filter((m) => String(m.ticker || '').toUpperCase().includes(last))
  return hit.length === 1 ? hit[0] : null
}

/** { yes, no, trusted }: the resting SIZE column on each side (what the 10-23 devig run summed and the $500 bar
 *  was set against; the unit is the book's own -- not re-derived here), or null. */
export async function depth(ticker) {
  try {
    const book = (await j(`/markets/${encodeURIComponent(ticker)}/orderbook`)).orderbook_fp || {}
    const sum = (a) => (a || []).reduce((s, e) => s + (Array.isArray(e) && e.length >= 2 ? Number(e[1]) || 0 : 0), 0)
    const yes = Math.round(sum(book.yes_dollars) * 100) / 100
    const no = Math.round(sum(book.no_dollars) * 100) / 100
    return { yes, no, trusted: yes >= TRUST_USD && no >= TRUST_USD }
  } catch { return null }
}
