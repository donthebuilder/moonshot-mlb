// THE CARD REGISTRY: which sports have player cards, and each one's adapter (server only; no JSX here, the adapters load lazily).
// A sport is listed ONCE, here, beside the Card's own list (lib/card/core.js CARD_SPORTS): there is no `sport === 'nfl' ? ...` anywhere
// in lib/cards. BUCKETS (nba) has an adapter (2026-10-12) but is a PREVIEW sport (lib/card/core.js PREVIEW_CARD_SPORTS): hasCards('nba') stays FALSE, so every PUBLIC card
// route (day, dual, slab, recent, special lists ...) still answers 404 for it. Only a route that has first asked the BUCKETS gate (lib/nba/gate.js bucketsGuard) may
// pass `allowPreview` to the card loaders; that is how an admin or an early-access holder gets a player card and nobody else does.
import { CARD_SPORTS, PREVIEW_CARD_SPORTS } from '../card/core'

const ADAPTERS = {
  nhl: () => import('./adapters/nhl'),
  mlb: () => import('./adapters/mlb'),
  nfl: () => import('./adapters/nfl'),
  nba: () => import('./adapters/nba'),     // PREVIEW sport: see above
}

/** True when the sport has player cards (a Card sport with an adapter). */
export const hasCards = (sport) => CARD_SPORTS.includes(String(sport)) && Object.hasOwn(ADAPTERS, String(sport))
/** True for a PREVIEW sport with an adapter (BUCKETS). Callers MUST have passed the BUCKETS gate before they act on it. */
export const hasPreviewCards = (sport) => PREVIEW_CARD_SPORTS.includes(String(sport)) && Object.hasOwn(ADAPTERS, String(sport))
/** The sports that have cards, in registry order. */
export const cardSports = () => CARD_SPORTS.filter(hasCards)
/** The sport's adapter ({ sport, modelFor(win, id), backOf(model), identity(leg) }), or null. */
export async function adapterFor(sport) {
  return hasCards(sport) || hasPreviewCards(sport) ? (await ADAPTERS[sport]()).default : null
}
