// THE TOP THREE CARD'S DATA (server only, no JSX; READ-ONLY). Turns the night's ranked picks (lib/cards/digestRank.js) into the card model lib/cards/topThreeCard.js
// draws. A pick built from a feed event gets its real face, club mark and tone from the SAME loader the single special card uses (specialData.modelFromRow);
// a postseason pick gets them from the postseason edition loader. A picture that does not load is just absent: the tile draws a monogram, the card still goes.
//   tileFromSpecial(model, pick)   pure: one special-card model + the pick's own line -> a tile
//   topThreeModel({ sport, picks, tiles, night, postseason, test })   pure: the card model
//   loadTopThree({ sport, picks, night, postseason })                  the model with the real pictures (never throws; tiles that fail fall back to the pick's own words)
import { digestTitle } from './digestRank'
import { brandOf, prettyDay } from './model'

/** One tile from a special-card model (specialData.buildSpecialModel / modelFromRow) and the pick it stands for. Pure. */
export function tileFromSpecial(m, pick) {
  return {
    name: m.name || pick.name, team: m.team || pick.team, opp: m.opp || '', home: m.home == null ? null : m.home, club: m.club || m.teamName || '',
    face: m.face || '', logo: m.logo || '', logoPlate: Boolean(m.logoPlate), tone: m.tone || null,
    tier: pick.tier, holo: Boolean(m.moment?.holo), shimmer: Boolean(m.moment?.shimmer) && !m.moment?.holo, line: pick.line,
  }
}
/** A tile with no picture, from the pick alone (a picture or a model that did not load). The tier still wears its foil. */
export function tileFromPick(pick) {
  const holo = pick.rank >= 2
  return { name: pick.name, team: pick.team, opp: pick.opp || '', home: null, club: '', face: '', logo: '', logoPlate: false, tone: null, tier: pick.tier, holo, shimmer: !holo, line: pick.line }
}
/** The card model. `night` = the game date 'YYYY-MM-DD'. Pure. */
export function topThreeModel({ sport, picks, tiles, night, postseason = false, test = false }) {
  const list = (tiles && tiles.length ? tiles : (picks || []).map(tileFromPick)).slice(0, 3)
  return {
    sport: postseason ? 'mlb' : sport, brand: brandOf(postseason ? 'mlb' : sport), title: digestTitle(list.length, { sport, postseason }),
    dayWord: prettyDay(night), tiles: list, test: Boolean(test), note: '',
  }
}

/** The model with real pictures. Each tile is loaded on its own; one that fails falls back to the pick's words (a monogram, no club mark). */
export async function loadTopThree({ sport, picks, night, postseason = false }) {
  const tiles = await Promise.all((picks || []).slice(0, 3).map(async (p) => {
    try {
      if (p.tile) return p.tile
      if (p.event) {
        const { modelFromRow } = await import('./specialData')
        const m = await modelFromRow(p.event.moment, p.event.row)
        if (m) return tileFromSpecial(m, p)
      }
    } catch (err) { console.error(`[digest] picture for ${p?.name}: ${err?.message || err}`) }
    return tileFromPick(p)
  }))
  return topThreeModel({ sport, picks, tiles, night, postseason })
}
