// THE ONE HOOK the existing ticks call, last (2026-10-12; no new cron, no new polling): the LAMP goals tick (sources ['nhl']), the homers tick (['mlb'] + the
// postseason big nights), the NFL tick (['nfl']) and the card tick (['daily']: the 100-yard games of the published logs and the long shots that cashed).
//   momentAfterTick(res, { sources, postseason })   -> the passes' one-line results (also logged); never throws, never changes `res`
// Free when the switch is off: MOMENT_POSTS_ON is read first and nothing else is touched (no import of the senders, no database call).
import { momentPostsOn } from '../cards/momentPosting'

export async function momentAfterTick(res, { sources = [], postseason = false, db = null, now = Date.now() } = {}) {
  try {
    if (!momentPostsOn()) return null
    if (res && Number(res.status) >= 400) return null               // any refusal (401, 403, ...) did no work (2026-10-26; was 401 only). null = a caller inside an authorized tick
    const { adminClient } = await import('../supabase/admin')
    const { isMaintenanceMode } = await import('../edgeConfig')
    if (await isMaintenanceMode()) return null
    const client = db || adminClient()
    if (!client) return null
    const out = {}
    const { momentPass } = await import('./momentPost')
    for (const source of sources) out[source] = await momentPass(client, { source, now })
    if (postseason) out.postseason = await (await import('./postseasonPost')).postseasonPass(client, { now })
    console.log(`[moment] ${JSON.stringify(out)}`)
    return out
  } catch (err) {
    console.error(`[moment] hook failed: ${err?.message || err}`)
    return null
  }
}
