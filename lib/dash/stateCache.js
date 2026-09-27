// SUBSCRIBERS' SETTINGS, READ BY STAMP (2026-09-27, BATCH-COST-CUT step 7).
//
// push/tick read every subscriber's dash_alerts_v1 + dash_follow_v1 in full
// once a minute. One follow list is ~270 players (27 KB), so the read was
// 31.5 KB a tick, ~950 ticks a day = ~29 MB/day of Supabase egress for data
// that changes a few times a week. Supabase's free egress is 5 GB a MONTH.
//
// updated_at is already the merge clock on dash_user_state (every write
// stamps it). So: read only (user_id, key, updated_at) -- a few bytes a row
// -- and fetch the full value only for rows whose stamp moved since this warm
// instance last saw them. A cold instance reads everything once, exactly as
// before. A row that disappears is dropped from the cache. Server only.

const _cache = new Map()   // `${user_id}|${key}` -> { at, value }

/** Rows [{ user_id, key, value }] for these users and keys, fetching values only when changed. */
export async function readUserState(db, userIds, keys, cache = _cache) {
  if (!userIds.length) return []
  const { data: stamps, error } = await db.from('dash_user_state').select('user_id,key,updated_at').in('user_id', userIds).in('key', keys)
  if (error) throw new Error(`dash_user_state stamps: ${error.message}`)
  const live = new Set()
  const stale = new Set()
  for (const s of stamps || []) {
    const k = `${s.user_id}|${s.key}`
    live.add(k)
    if (cache.get(k)?.at !== s.updated_at) stale.add(s.user_id)
  }
  if (stale.size) {
    const { data, error: e } = await db.from('dash_user_state').select('user_id,key,value,updated_at').in('user_id', [...stale]).in('key', keys)
    if (e) throw new Error(`dash_user_state values: ${e.message}`)
    for (const r of data || []) cache.set(`${r.user_id}|${r.key}`, { at: r.updated_at, value: r.value })
  }
  for (const k of [...cache.keys()]) {
    const [uid, key] = k.split('|')
    if (userIds.includes(uid) && keys.includes(key) && !live.has(k)) cache.delete(k)
  }
  const out = []
  for (const k of live) {
    const hit = cache.get(k)
    if (!hit) continue
    const [user_id, key] = k.split('|')
    out.push({ user_id, key, value: hit.value })
  }
  return out
}
