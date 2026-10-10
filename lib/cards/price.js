// THE PRICE SLOT'S DATA (server only). A card prints a price only when odds_snap holds one WITH its book count:
//   1. the LOCK snapshot's best price (lib/odds/priceAtLock readLockPrices: what the books offered when the call was locked), else
//   2. the newest stored pre-game price (lib/card/store.js currentPrices: what the members text prints).
// Never a guess: no stored price (or no database) answers nothing, and the slot draws nothing. The American price is the best among
// the books that listed him; `books` is how many did.
import { readLockPrices, priceKey } from '../odds/priceAtLock'
import { currentPrices } from '../card/store'
import { priceWords } from './model'

/** Map(player_id -> { best:'+110', books, source }) for the legs { player_id, game_date }; players with no stored price are absent. */
export async function pricesForLegs(db, sport, legs) {
  const out = new Map()
  if (!db || !legs?.length) return out
  try {
    const dates = [...new Set(legs.map((l) => l.game_date).filter(Boolean))].sort()
    if (dates.length) {
      const lock = await readLockPrices(db, { sport, since: dates[0], until: dates.at(-1) })
      if (!lock.error) for (const l of legs) { const w = priceWords(lock.prices.get(priceKey(sport, l.game_date, String(l.player_id)))); if (w) out.set(String(l.player_id), { ...w, source: 'lock' }) }
    }
    const missing = legs.filter((l) => !out.has(String(l.player_id)))
    if (missing.length) {
      const cur = await currentPrices(db, sport, missing)
      for (const l of missing) { const w = priceWords(cur.get(String(l.player_id))); if (w) out.set(String(l.player_id), { ...w, source: 'latest' }) }
    }
  } catch { /* a price we cannot read is "no price on file", never a guess */ }
  return out
}
