// THE ONE HOOK the NFL tick and the LAMP goals tick call, last (2026-10-16): the night's recap for the sport (lib/posts/recapPost.js). No cron of its own, no new
// polling: it rides the tick that already runs. Free when the switch is off: RECAP_POSTS_ON is read first and nothing else is touched (no import of the sender,
// no database call). Never throws and never changes the tick's own answer.
//   recapAfterTick(res, { sport, days })   -> one line per day ("2026-10-18: posted (discord only)"), also logged; null when off
import { recapPostsOn } from './recapPost'

export async function recapAfterTick(res, { sport, days = [], db = null, now = Date.now() } = {}) {
  try {
    if (!recapPostsOn()) return null
    if (res && Number(res.status) >= 400) return null               // any refusal (401, 403, ...) did no work (2026-10-26; was 401 only). null = a caller inside an authorized tick
    const { adminClient } = await import('../supabase/admin')
    const { isMaintenanceMode } = await import('../edgeConfig')
    if (await isMaintenanceMode()) return null
    const client = db || adminClient()
    if (!client) return null
    const { postRecapOnce } = await import('./recapPost')
    const out = {}
    for (const day of [...new Set(days)].filter(Boolean)) out[day] = await postRecapOnce(client, { sport, day, now })
    console.log(`[recap] ${sport} ${JSON.stringify(out)}`)
    return out
  } catch (err) {
    console.error(`[recap] hook failed: ${err?.message || err}`)
    return null
  }
}
