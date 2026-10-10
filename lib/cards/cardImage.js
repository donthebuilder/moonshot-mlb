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

/**
 * The day lineup image of one stored card. `scope`: 'full' | 'free' (see lib/cards/dayCard.js). A caller that serves the public (the
 * route) passes scope 'auto': 'full' only once the Card is public record (every row graded or every game started), else 'free'.
 * The members poster passes 'full' in-process (it never goes through a URL).
 */
export async function dayCardImage({ sport, date, scope = 'free', width = null, db = null, now = Date.now() }) {
  try {
    const { loadDayModel, cardIsRecord } = await import('./dayData')
    let use = scope
    if (scope === 'auto') {
      const probe = await loadDayModel({ sport, date, db, scope: 'free', now })
      if (!probe.ok) return probe
      use = cardIsRecord(probe.rows, now) ? 'full' : 'free'
    }
    const loaded = await loadDayModel({ sport, date, db, scope: use, now })
    if (!loaded.ok) return loaded
    const { renderDay } = await import('./dayCard')
    return { ok: true, png: await renderDay(loaded.day, { width }), day: loaded.day, scope: use }
  } catch (e) {
    console.error(`[cards] day ${sport}/${date}: ${e?.message || e}`)
    return miss('render failed', 502)
  }
}

/**
 * The Two-Man dual card of one stored card. `lane`: 'bot' | 'donovan'. `publicOnly` (the route's setting): the bot's Two-Man is members
 * content until the Card is public record (every row graded or every game started), so before that it answers 404; Donovan's is public
 * once its lock has passed (cardRows already hides it before). The members poster passes publicOnly:false and sends the bytes itself.
 */
export async function dualCardImage({ sport, date, lane = 'bot', width = null, db = null, now = Date.now(), publicOnly = true }) {
  try {
    const { loadDualModel } = await import('./dualData')
    const loaded = await loadDualModel({ sport, date, lane, db, now, publicOnly })
    if (!loaded.ok) return loaded
    const { renderDual } = await import('./dualCard')
    return { ok: true, png: await renderDual(loaded.dual, { width }), dual: loaded.dual }
  } catch (e) {
    console.error(`[cards] dual ${sport}/${date}: ${e?.message || e}`)
    return miss('render failed', 502)
  }
}

/**
 * The graded slab result card. kind 'card': one graded Card row ({ sport, date, lane, product, slot }); kind 'receipt': a night's stored receipt
 * ({ day }). Graded rows are public record, so there is no public/members split: a row that is not graded yet is a 404.
 */
export async function slabCardImage({ kind = 'card', width = null, db = null, now = Date.now(), ...q }) {
  try {
    const { loadSlabCard, loadSlabReceipt } = await import('./slabData')
    const loaded = kind === 'receipt' ? await loadSlabReceipt({ day: q.day, db, results: q.results || null, only: q.only || null }) : await loadSlabCard({ ...q, db, now })
    if (!loaded.ok) return loaded
    const { renderSlab } = await import('./slabCard')
    return { ok: true, png: await renderSlab(loaded.slab, { width }), slab: loaded.slab }
  } catch (e) {
    console.error(`[cards] slab ${kind}: ${e?.message || e}`)
    return miss('render failed', 502)
  }
}
