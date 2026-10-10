// THE CARD MODEL: the one shape every sport's adapter hands the drawing (pure, no I/O, no JSX; safe for scripts).
//
//   { sport, brand:{sport,name,league}, status:'called'|'board'|'off', statusWord,
//     name, team, teamName, club, opp, home, pos, bats, number, role,
//     face, logo, logoPlate, tone,                       pictures as data URIs; '' = none (the card draws a monogram / a club code)
//     score, scoreWord,                                  the board's own 0-100 score (a rank, never a chance)
//     stats:[{label,value,unit,pct,sub}], statNote,      pct = percentile 0-100 inside the POOL that statNote names
//     poolWord,                                          the pool in words, for the back's blurb
//     rankLine:[..], callLine, why, price, day, dayWord, game, playerId }
//
// Nothing in a model is invented: a field the source does not hold is absent (null / ''), and the card draws no tile for it.
import { BRAND, sportKey } from '../routes'
import { STATUS_WORD } from '../callStatus'
import { fmtAmerican } from '../card/core'

const MONTH = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const prettyDay = (d) => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(d || '')); return m ? `${MONTH[Number(m[2]) - 1]} ${Number(m[3])}` : '' }
export const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }

/** {sport,name,league} from the routes registry. */
export const brandOf = (sport) => ({ sport, name: BRAND[sportKey(sport)].name, league: BRAND[sportKey(sport)].league })

/** The status a candidate wears. Only the three states lib/callStatus knows; anything else is 'off' (never promoted to CALLED). */
export const statusOf = (s) => (s === 'called' ? 'called' : s === 'board' ? 'board' : 'off')
/** The status word, ONLY from lib/callStatus STATUS_WORD. */
export const statusWordOf = (s) => STATUS_WORD[statusOf(s)]

/**
 * A stored price as the card prints it: { best:'+110', books:N }. The price slot needs BOTH a price and the number of books that
 * listed it; a price with no book count, or none at all, is null and the slot draws nothing. Never made up here.
 * `p` = { best, books } as lib/odds/priceAtLock / lib/card/store.js currentPrices return it (best = American odds as a number).
 */
export function priceWords(p) {
  const best = num(p?.best)
  const books = num(p?.books)
  if (best == null || !(books >= 1)) return null
  return { best: fmtAmerican(best), books }
}

/** The percentile (0-100) of `v` among `pool` values (a plain array of numbers), ties counting half. null for a thin pool or no value. */
export function pctInPool(pool, v, { min = 40 } = {}) {
  const x = num(v)
  if (x == null) return null
  const vals = (pool || []).filter((y) => Number.isFinite(y))
  if (vals.length < min) return null
  let below = 0, same = 0
  for (const y of vals) { if (y < x) below++; else if (y === x) same++ }
  return ((below + same / 2) / vals.length) * 100
}

/** The call line under the banner: the role and market for a CALLED man, the market alone for ON THE BOARD, nothing for NOT ON THE BOARD. */
export const callLineOf = ({ status, role, market }) => (status === 'called' ? [role, market].filter(Boolean).join(' · ').toUpperCase() : status === 'board' ? String(market || '').toUpperCase() : '')
