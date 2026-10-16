// THE COLLECTIBLE CARD'S BACK, DATA (server only, no JSX): a validated moment row -> { model, back, earned, id } for lib/cards/collect/collectBack.js.
// The model is the FRONT's (collectModel: the same words, the same real card id), without the portrait fetch (the back wears the club mark, not a photograph).
// The stat table is the sport adapter's own backOf(model): the same rows the old 4:5 back drew (NHL landing seasonTotals, MLB statsapi yearByYear, NFL game logs); nothing is
// invented here and a source that is down is an empty table that says so. Read-only.
import { collectModel } from './collectData'
import { adapterFor } from '../registry'

export const EMPTY_BACK = Object.freeze({ bio: [], cols: [['YEAR', 1.2, 'season'], ['TEAM', 1.4, 'tm']], rows: [], career: null, playoffs: null, title: 'CAREER STATS', note: '', seasonsShown: [], source: 'none' })

/**
 * @param face  'stats' reads the adapter's table; 'brand' needs no table (no network)
 * @param opts  test: a TEST row (no stat source is asked; pass `back` to draw a table from a fixture)
 */
export async function collectBackModel(key, row, { test = false, face = 'stats', back = null, tier = null } = {}) {
  const c = await collectModel(key, row, { test, portrait: false, tier })
  if (!c) return null
  let b = back
  if (!b && face === 'stats' && !test) {
    try {
      const adapter = await adapterFor(c.model.sport)
      b = adapter ? await adapter.backOf({ ...c.model, playerId: String(c.model.playerId) }) : null
    } catch { b = null }
  }
  return { model: c.model, earned: c.earned, id: c.id, back: b || EMPTY_BACK, live: Boolean(b && b !== EMPTY_BACK && (b.rows || []).length) }
}
