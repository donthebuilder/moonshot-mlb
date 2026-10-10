// THE CARD REGISTRY: which sports have player cards, and each one's adapter (server only; no JSX here, the adapters load lazily).
// A sport is listed ONCE, here, beside the Card's own list (lib/card/core.js CARD_SPORTS): there is no `sport === 'nfl' ? ...` anywhere
// in lib/cards. BUCKETS (nba) has no adapter and so no public card at all: every card route answers 404 for it, hidden or not.
import { CARD_SPORTS } from '../card/core'

const ADAPTERS = {
  nhl: () => import('./adapters/nhl'),
  mlb: () => import('./adapters/mlb'),
  nfl: () => import('./adapters/nfl'),
}

/** True when the sport has player cards (a Card sport with an adapter). */
export const hasCards = (sport) => CARD_SPORTS.includes(String(sport)) && Object.hasOwn(ADAPTERS, String(sport))
/** The sports that have cards, in registry order. */
export const cardSports = () => CARD_SPORTS.filter(hasCards)
/** The sport's adapter ({ sport, modelFor(win, id), backOf(model), identity(leg) }), or null. */
export async function adapterFor(sport) {
  return hasCards(sport) ? (await ADAPTERS[sport]()).default : null
}
