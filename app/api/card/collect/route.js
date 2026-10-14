// GET /api/card/collect?moment=nhl_hat_trick&id=<gameId:playerId>[&tier=base|star|elite|legend][&w=250..1000]   (PREVIEW ONLY: not linked, not posted, not cached)
// The COLLECTIBLE frame (lib/cards/collect/collectCard.js, PNG, 2.5 : 3.5 = 1000 x 1400). The card is drawn from one validated stored event (the same loaders as /api/card/special),
// the verified portrait (lib/cards/portrait: id + club checked, else the sport's placeholder) and the real card id; the issue number reads PREVIEW until the issuance table exists.
// The TIER is the event's own (lib/cards/rulesV2.js). `tier=` draws the FRAME of another tier for a look preview, and the card then says STYLE PREVIEW · TIER NOT EARNED on its face.
// The old special route (/api/card/special, 4:5) is untouched. BUCKETS moments are hidden behind the BUCKETS gate exactly as there. NHL, MLB and NFL only (the sports with a portrait adapter).
import { adminClient } from '../../../../lib/supabase/admin'
import { MOMENTS, isHiddenMoment } from '../../../../lib/cards/moments'
import { TIERS } from '../../../../lib/cards/moments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const json = (body, status) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } })

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const key = String(q.get('moment') || '')
  // hidden (BUCKETS) and unknown moments look the same: no such moment
  if (isHiddenMoment(key) || !Object.hasOwn(MOMENTS, key)) return json({ error: 'NOT FOUND', detail: 'no such moment' }, 404)
  const tierAsked = q.get('tier')
  if (tierAsked && !TIERS.includes(tierAsked)) return json({ error: 'BAD REQUEST', detail: `tier is one of ${TIERS.join(', ')}` }, 400)
  const width = Number(q.get('w')) || 1000
  let db = null
  try { db = adminClient({ anon: true }) } catch { db = null }
  if (!db) return json({ error: 'NOT CONFIGURED' }, 503)
  try {
    const { loadSpecial } = await import('../../../../lib/cards/specialData')
    const loaded = await loadSpecial({ key, id: String(q.get('id') || ''), db })
    if (!loaded.ok) return json({ error: loaded.status === 404 ? 'NOT FOUND' : loaded.status === 400 ? 'BAD REQUEST' : 'CARD DELAYED', detail: loaded.why }, loaded.status || 502)
    const { collectModel } = await import('../../../../lib/cards/collect/collectData')
    const c = await collectModel(key, loaded.row, { styleOnly: Boolean(tierAsked) })
    if (!c) return json({ error: 'NOT FOUND', detail: 'that moment did not happen (no tier earned)' }, 404)
    // a look preview of the tier it actually earned is not a "style preview"
    if (tierAsked === c.earned) c.model.collect.styleOnly = false
    const { renderCollect } = await import('../../../../lib/cards/collect/collectCard')
    const png = await renderCollect(c.model, { width, tier: tierAsked || c.earned })
    return new Response(png, { status: 200, headers: { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex', 'X-Card-Id': c.id?.cardId || '' } })
  } catch (e) {
    console.error(`[cards] collect ${key}: ${e?.message || e}`)
    return json({ error: 'CARD DELAYED', detail: 'render failed' }, 502)
  }
}
