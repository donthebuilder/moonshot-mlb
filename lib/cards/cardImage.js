// THE CARD IMAGES, ONE ENTRY (server only; no JSX at the top, the drawing loads lazily). Everything that wants a card PNG (the image
// routes, the live CALLED alerts, the members card) comes through here, so the render is ONE piece of code with one failure shape:
//   { ok:true, png:Buffer, model }   or   { ok:false, status:404|502, why }     (never throws; a post falls back on ok:false)
//   playerCardImage({ sport, id, side:'front'|'back', date?, width?, db?, now? })
// A card exists only for a player the sport's real source lists in a card window (lib/card/sources.js): an unknown id, a sport with
// no cards (BUCKETS is not in the registry) or a day with no window answers 404 and no image.
import { hasCards, adapterFor } from './registry'
import { loadWindows } from '../card/sources'
import { pricesForLegs } from './price'

export const ID_RE = /^[A-Za-z0-9_-]{1,24}$/
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const miss = (why, status = 404) => ({ ok: false, status, why })

/** The card MODEL of one player (real data, price from stored odds when there is one), or { ok:false }. */
export async function loadPlayerModel({ sport, id, date = null, db = null, now = Date.now() }) {
  if (!hasCards(sport)) return miss('no cards for this sport')
  if (!ID_RE.test(String(id || ''))) return miss('bad player id', 400)
  if (date && !DATE_RE.test(date)) return miss('bad date', 400)
  const adapter = await adapterFor(sport)
  const w = await loadWindows(sport, now)
  if (!w.ok) return miss(`no card window: ${w.why}`, 404)
  const wins = (date ? w.windows.filter((x) => x.card_date === date) : w.windows).filter((x) => date || x.last_start_ms > now - 6 * 3600e3 || w.windows.length === 1)
  for (const win of wins.length ? wins : w.windows.slice(0, 1)) {
    const model = await adapter.modelFor(win, String(id), { now })
    if (!model) continue
    const price = (await pricesForLegs(db, sport, [{ player_id: model.playerId, game_date: model.game?.date || model.day }])).get(model.playerId)
    return { ok: true, model: { ...model, price: price ? { best: price.best, books: price.books } : null }, adapter }
  }
  return miss('that player is not on a card window')
}

/** One side of a player's card as PNG bytes. */
export async function playerCardImage({ sport, id, side = 'front', date = null, width = null, db = null, now = Date.now() }) {
  try {
    const loaded = await loadPlayerModel({ sport, id, date, db, now })
    if (!loaded.ok) return loaded
    return await renderModel(loaded.model, loaded.adapter, { side, width })
  } catch (e) {
    console.error(`[cards] ${sport}/${id}/${side}: ${e?.message || e}`)
    return miss('render failed', 502)
  }
}

/** Draw a model that is already loaded (the alerts call this with the model they built). */
export async function renderModel(model, adapter, { side = 'front', width = null } = {}) {
  try {
    if (side === 'back') {
      const [{ renderBack }, back] = await Promise.all([import('./playerBack'), adapter.backOf(model)])
      return { ok: true, png: await renderBack(model, back, { width }), model, back }
    }
    const { renderFront } = await import('./playerCard')
    return { ok: true, png: await renderFront(model, { width }), model }
  } catch (e) {
    console.error(`[cards] render ${model?.sport}/${model?.playerId}/${side}: ${e?.message || e}`)
    return miss('render failed', 502)
  }
}
