// THE CARD IMAGES, ONE ENTRY (server only; no JSX at the top, the drawing loads lazily). Everything that wants a card PNG (the image
// routes, the live CALLED alerts, the members card) comes through here, so the render is ONE piece of code with one failure shape:
//   { ok:true, png:Buffer, model }   or   { ok:false, status:404|502, why }     (never throws; a post falls back on ok:false)
//   playerCardImage({ sport, id, side:'front'|'back', date?, width?, db?, now? })
// A card exists only for a player the sport's real source lists in a card window (lib/card/sources.js): an unknown id, a sport with
// no cards (BUCKETS is not in the registry) or a day with no window answers 404 and no image.
import { hasCards, hasPreviewCards, adapterFor } from './registry'
import { loadWindows } from '../card/sources'
import { pricesForLegs } from './price'

export const ID_RE = /^[A-Za-z0-9_-]{1,24}$/
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const miss = (why, status = 404) => ({ ok: false, status, why })

/** The card MODEL of one player (real data, price from stored odds when there is one), or { ok:false }. */
export async function loadPlayerModel({ sport, id, date = null, db = null, now = Date.now(), allowPreview = false }) {
  // allowPreview: the caller has ALREADY passed the BUCKETS gate (lib/nba/gate.js); a public sport needs no gate, a preview sport (nba) needs it
  if (!(hasCards(sport) || (allowPreview && hasPreviewCards(sport)))) return miss('no cards for this sport')
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
export async function playerCardImage({ sport, id, side = 'front', date = null, width = null, db = null, now = Date.now(), allowPreview = false }) {
  try {
    const loaded = await loadPlayerModel({ sport, id, date, db, now, allowPreview })
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
    // SITUATION STAMPS (lib/cards/situations.js, pregame phase): the round, a milestone, a streak he is coming in with, his birthday, days of rest. Fact-only; none when unproven.
    const day = model.game?.date || model.day
    if (model.stamps === undefined && day) {
      const { stampsForCard } = await import('./situationData')
      model = { ...model, stamps: await stampsForCard({ sport: model.sport, playerId: model.playerId, day, opp: model.opp, phase: 'pre' }) }
    }
    return { ok: true, png: await renderFront(model, { width }), model }
  } catch (e) {
    console.error(`[cards] render ${model?.sport}/${model?.playerId}/${side}: ${e?.message || e}`)
    return miss('render failed', 502)
  }
}

/**
 * The day lineup image of one stored card. `scope`: 'full' | 'free' (see lib/cards/dayCard.js). A caller that serves the public (the
 * route) passes scope 'auto': 'full' only once a row of the Card is graded (lib/card/reveal.js; never the clock), else 'free'.
 * The members poster passes 'full' in-process (it never goes through a URL).
 */
export async function dayCardImage({ sport, date, scope = 'free', width = null, db = null, now = Date.now() }) {
  try {
    const { loadDayModel } = await import('./dayData')
    let use = scope
    if (scope === 'auto') {
      const probe = await loadDayModel({ sport, date, db, scope: 'free', now })
      if (!probe.ok) return probe
      use = probe.revealed ? 'full' : 'free'
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
 * content until a row of the Card is graded (lib/card/reveal.js; never the clock), so before that it answers 404; Donovan's is public
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
 * HIS N-MAN card (3 to 6 men, all must land): pregame until the row is graded, then the graded version (each leg's mark, the ticket CASHED / MISSED / VOID).
 * Always the PUBLIC view of his verified row (readCard hides it before its lock; a LATE entry is never read), so a free reader and a post get the same answer.
 */
export async function nManCardImage({ sport, date, width = null, db = null, now = Date.now(), slot = 1, requireGraded = false, hidePrice = false }) {
  try {
    const { loadNManModel } = await import('./nManData')
    const loaded = await loadNManModel({ sport, date, db, now, slot })
    if (!loaded.ok) return loaded
    if (requireGraded && !loaded.nman?.graded) return miss('not graded yet', 404)      // the RESULT post never draws the pregame card in its place
    const { renderNMan } = await import('./nManCard')
    return { ok: true, png: await renderNMan(loaded.nman, { width, hidePrice }), nman: loaded.nman }
  } catch (e) {
    console.error(`[cards] n-man ${sport}/${date}: ${e?.message || e}`)
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

/**
 * The SHARE cards (the 📸 downloads, 2026-10-12): ranked | game | pitcher | pick | record, in the baseball-card look (lib/cards/shareCards.js), from the
 * real boards (lib/cards/shareData.js). `q` = the request's parameters as a plain object ({ market, ids, game, id, date ... }). A source that is
 * down or a day with nothing is { ok:false, status:404|502, why }; nothing is drawn from a guess and nothing is written.
 */
export async function shareCardImage({ kind, sport, q = {}, width = null, now = Date.now() }) {
  try {
    const { loadShareModel } = await import('./shareData')
    const loaded = await loadShareModel(kind, String(sport || '').toLowerCase(), q, now)
    if (!loaded.ok) return loaded
    const { renderShare } = await import('./shareCards')
    return { ok: true, png: await renderShare(kind, loaded.model, { width }), model: loaded.model, name: loaded.name, day: loaded.day }
  } catch (e) {
    console.error(`[cards] share ${kind}/${sport}: ${e?.message || e}`)
    return miss('render failed', 502)
  }
}
