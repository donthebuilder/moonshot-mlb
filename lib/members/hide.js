// THE SERVER-SIDE HIDING RULES FOR THE PAGES AND IMAGES THAT ARE NOT THE FRONT DOOR (2026-10-17). Pure functions, no I/O, no clock of their own, so
// scripts/check-pages-no-leak.mjs can test them with labelled test data.
//
// THE RULE (the same one as the front page and the in-app gate): a visitor who is not a member sees the free four CALLED picks per sport; every other CALLED
// pick of tonight that has not started is drawn as a plain ON THE BOARD player (no CALLED, no score, no why, no price, no accent). A pick that already has
// a result, or whose game has started, is public proof and keeps its real label for everyone. A member sees what they always saw.
//
// FAIL SAFE, THE OTHER WAY FROM THE BROWSER GATE: the browser gate fails OPEN (it is cosmetic). These run on the server where the hiding is real, so an unknown
// start time counts as NOT started, and an unknown viewer is a non-member (lib/members/viewer.js).
import { FREE_CALLS_PER_SPORT } from './limits'

/** Is this a CALLED pick that is still hidden-able: called, no result yet, and its game has not started (unknown start = not started)? */
export function isOpenCall({ status, startMs = null, graded = false, now = Date.now() } = {}) {
  if (status !== 'called' || graded) return false
  const t = typeof startMs === 'number' ? startMs : startMs ? Date.parse(startMs) : NaN
  return !(Number.isFinite(t) && now >= t)
}

/**
 * A list of called picks (the /called calls panel, /m Today) -> { items, hidden }. Members get everything. A non-member keeps every PUBLIC item
 * (`isPublic(item)`: it scored, it has a result, its game started) and the first `free` open ones (or, with `byPlace`, whoever is in the list's first `free` places), in the list's own order; the rest are dropped
 * and counted (a number, never a name).
 */
export function gateCalls(list, { member = false, isPublic = () => false, free = FREE_CALLS_PER_SPORT, byPlace = false } = {}) {
  const all = Array.isArray(list) ? list : []
  if (member) return { items: all, hidden: 0 }
  let open = 0
  const items = []
  for (let i = 0; i < all.length; i += 1) {
    const it = all[i]
    if (isPublic(it)) { items.push(it); continue }
    // byPlace: the free four are the list's first four places, started or not (the front door's previewOf), so the image route and this list name the same men
    if (byPlace ? i < free : open < free) { open += 1; items.push(it) }
  }
  return { items, hidden: all.length - items.length }
}

/** A player-card model (lib/cards/model.js) of a CALLED, open pick -> the same man as a plain ON THE BOARD card: no score, why, price, call line or rank. */
export function boardCardModel(m) {
  return {
    ...m, status: 'board', statusWord: 'ON THE BOARD', score: null, scoreWord: '', rankLine: [], callLine: '', why: null, price: null, role: null, stamps: [],
  }
}

const quiet = (r) => (r && typeof r === 'object' && r.status === 'called' && !r.result && !r.miss
  ? { ...r, status: 'board', score: null, pct: null, tag: '', line: '', scoreWord: '' }
  : r)

/**
 * A share-card model (lib/cards/shareData.js: a list with a lead + rows, or one pick) -> the same model with every open CALLED row (not one of `freeIds`) drawn as
 * ON THE BOARD. Returns { model, changed }: `changed` says whether anything was open (so the caller knows the picture is per-viewer and must not sit on a shared cache).
 */
export function gateShareModel(model, freeIds = null) {
  if (!model || typeof model !== 'object') return { model, changed: false }
  let changed = false
  const keep = (r) => Boolean(freeIds && r?.id != null && freeIds.has(String(r.id)))
  const row = (r) => {
    if (!(r && r.status === 'called' && !r.result && !r.miss)) return r
    changed = true
    return keep(r) ? r : quiet(r)
  }
  const out = { ...model }
  if (out.lead) out.lead = row(out.lead)
  if (Array.isArray(out.rows)) out.rows = out.rows.map(row)
  // one pick (TUDDY / BUCKETS): a called, ungraded pick keeps no score tile, grade or rung
  if (!out.rows && !out.lead && out.status === 'called' && !out.result) {
    changed = true
    if (!keep({ id: out.id })) {
      out.status = 'board'; out.score = null; out.rung = null; out.grade = null
      if (Array.isArray(out.tiles)) out.tiles = out.tiles.filter((t) => !/SCORE/i.test(String(t?.label || '')))
    }
  }
  return { model: out, changed }
}
