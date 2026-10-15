// THE CARD'S 2+ HOOK (2026-10-15). Pure. For each candidate with an anytime price, asks lib/twoPlus/trigger.js whether the 2+ market is checked and
// whether it may be a Card straight, using ONLY a stored 2+ price (lib/card/sources.js loadTwoPlusPrices: the over-1.5 rung the odds tick captured at
// list / lock). No stored price = tracked, not carded; nothing is implied from the anytime price or from our model.
//   cands     [{ player_id, price: { median } | null, rank, of }]  (rank / of = his place on OUR 2+ board; null when unranked)
//   twoPrices Map(player_id -> { median, ... }) from loadTwoPlusPrices
// Returns Map(player_id -> { check2, card, tracked, why, twoPrice }).
import { twoPlusDecision } from '../twoPlus/trigger'

export function twoPlusHook({ sport, cands, twoPrices }) {
  const out = new Map()
  for (const c of cands || []) {
    const id = String(c.player_id)
    const stored = twoPrices?.get(id) || null
    const d = twoPlusDecision({ sport, anytime: c.price?.median ?? null, twoPrice: stored?.median ?? null, rank: c.rank ?? null, of: c.of ?? null })
    out.set(id, { ...d, twoPrice: stored ? stored.median : null })
  }
  return out
}
