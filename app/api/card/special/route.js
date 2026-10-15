// GET /api/card/special?moment=nhl_goal&id=<gameId:playerId:goalN>[&sport=nhl][&date=YYYY-MM-DD][&w=360|540|720|1080][&v=1]   (the collectible 5:7 frame by default; v=1 = the old 4:5 card, kept for one release)
// A SPECIAL card (PNG, 4:5): one real moment (lib/cards/moments.js) drawn in the player-card frame, with a shimmer for a STAR card and a holo foil for the ELITE and LEGEND ones (tier words: BASE, STAR, ELITE, LEGEND).
//   id shapes: nhl_goal / nhl_season_goal_milestone  gameId:playerId:goalN      nhl_hat_trick / nhl_three_points  gameId:playerId
//              mlb_multi_hr  gamePk:playerId      nfl_multi_td  gameId:gsisId      nfl_100_yards  gsisId:season:week (the published game logs, every week)
//              long_shot_cashed  sport:playerId:YYYY-MM-DD   (or sport:playerId plus &date=)
// Drawn only from stored public feeds, read-only (no db writes, no polling). A moment that did not happen, or an event that does not exist, is a
// 404 JSON; a sport that does not match the moment is a 404; a bad id is a 400. There is no members content on these cards, and no printed probability.
import { adminClient } from '../../../../lib/supabase/admin'
import { MOMENTS, NBA_MOMENTS, isHiddenMoment } from '../../../../lib/cards/moments'
import { DATE_RE } from '../../../../lib/cards/cardImage'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const WIDTHS = [360, 540, 720, 1080]
const json = (body, status, cache = 'no-store') => Response.json(body, { status, headers: { 'Cache-Control': cache } })

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const key = String(q.get('moment') || '')
  // BUCKETS' moments (hidden, lib/cards/moments.js NBA_MOMENTS) answer only a visitor its gate lets in; to anyone else they are "no such moment", like any unknown key
  const hidden = isHiddenMoment(key)
  if (hidden) {
    const { bucketsGuard } = await import('../../../../lib/nba/gate')
    if (await bucketsGuard()) return json({ error: 'NOT FOUND', detail: 'no such moment' }, 404, 'no-store')
  }
  const moment = Object.hasOwn(MOMENTS, key) ? MOMENTS[key] : hidden ? NBA_MOMENTS[key] : null
  if (!moment) return json({ error: 'NOT FOUND', detail: 'no such moment' }, 404, 'public, max-age=300')
  const sport = String(q.get('sport') || '').toLowerCase()
  if (sport && moment.sport !== 'any' && sport !== moment.sport) return json({ error: 'NOT FOUND', detail: 'that moment is not in that sport' }, 404, 'public, max-age=300')
  const date = q.get('date')
  if (date && !DATE_RE.test(date)) return json({ error: 'BAD REQUEST', detail: 'date is YYYY-MM-DD' }, 400)
  let id = String(q.get('id') || '')
  if (key === 'long_shot_cashed' && date && id.split(':').length === 2) id = `${id}:${date}`
  let db = null
  try { db = adminClient(hidden ? {} : { anon: true }) } catch { db = null }
  if (!db) return json({ error: 'NOT CONFIGURED' }, 503)
  const w = Number(q.get('w'))
  const width = WIDTHS.includes(w) ? w : 1080
  try {
    const { loadSpecial, modelFromRow } = await import('../../../../lib/cards/specialData')
    const loaded = await loadSpecial({ key, id, db })
    if (!loaded.ok) return json({ error: loaded.status === 404 ? 'NOT FOUND' : loaded.status === 400 ? 'BAD REQUEST' : 'CARD DELAYED', detail: loaded.why }, loaded.status || 502, loaded.status === 404 ? 'public, max-age=60' : 'no-store')
    if (date && key !== 'long_shot_cashed' && loaded.row.day && loaded.row.day !== date) return json({ error: 'NOT FOUND', detail: 'no such event on that date' }, 404, 'public, max-age=60')
    // THE COLLECTIBLE FRAME IS THE DEFAULT (2026-10-14, 5:7, lib/cards/collect): ?v=1 keeps the old 4:5 card for one release. A moment the v2 rules do not recognise
    // (a hidden BUCKETS moment, a long shot priced after the lock) is drawn by the old card, so nothing that used to draw is lost.
    if (q.get('v') !== '1' && !hidden) {
      const { collectModel } = await import('../../../../lib/cards/collect/collectData')
      const c = await collectModel(key, loaded.row, {})
      if (c) {
        const { issueNoOf, issueLabel } = await import('../../../../lib/cards/issue')
        c.model.collect.issue = issueLabel(await issueNoOf(db, c.id.cardId))
        const { renderCollect } = await import('../../../../lib/cards/collect/collectCard')
        const cpng = await renderCollect(c.model, { width })
        return new Response(cpng, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1200', 'X-Card-Look': 'collect', 'X-Card-Id': c.id.cardId } })
      }
    }
    const model = await modelFromRow(key, loaded.row)
    if (!model) return json({ error: 'NOT FOUND', detail: 'that moment did not happen' }, 404, 'public, max-age=60')
    const { renderSpecial } = await import('../../../../lib/cards/specialCard')
    const png = await renderSpecial(model, { width })
    return new Response(png, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': hidden ? 'private, no-store' : 'public, s-maxage=600, stale-while-revalidate=1200' } })
  } catch (e) {
    console.error(`[cards] special ${key}/${id}: ${e?.message || e}`)
    return json({ error: 'CARD DELAYED', detail: 'render failed' }, 502)
  }
}
