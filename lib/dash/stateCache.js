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

// BIG LISTS ARE READ IN SMALL BITES (2026-10-26, known-issues #87). `.in('user_id', [...])` puts every id in the URL
// (a UUID is 36 characters, so ~200 users is a URL the gateway refuses) and the API silently stops a read at 1,000
// rows. Today there are a handful of devices, so one bite is the whole list and nothing changes; past ~200 users the
// old read failed and the tick answered "state-unreadable" every minute. Now: at most 100 users per read (100 users x
// 2 keys = 200 rows, a ~4 KB URL; a full-value bite is ~2-3 MB at worst, a follow list being ~27 KB). Up to 100
// subscribers it is the same single read as before. A failed bite throws exactly as the single read did.
const STAMP_BITE = 100
const VALUE_BITE = 100
const bites = (xs, n) => { const out = []; for (let i = 0; i < xs.length; i += n) out.push(xs.slice(i, i + n)); return out }
// never ask for more than 900 rows in one bite, whatever number of keys the caller passes
const perBite = (n, keys) => Math.max(1, Math.min(n, Math.floor(900 / Math.max(1, keys.length))))

/** Rows [{ user_id, key, value }] for these users and keys, fetching values only when changed. */
export async function readUserState(db, userIds, keys, cache = _cache) {
  if (!userIds.length) return []
  const stamps = []
  for (const ids of bites(userIds, perBite(STAMP_BITE, keys))) {
    const { data, error } = await db.from('dash_user_state').select('user_id,key,updated_at').in('user_id', ids).in('key', keys)
    if (error) throw new Error(`dash_user_state stamps: ${error.message}`)
    for (const r of data || []) stamps.push(r)
  }
  const live = new Set()
  const stale = new Set()
  for (const s of stamps) {
    const k = `${s.user_id}|${s.key}`
    live.add(k)
    if (cache.get(k)?.at !== s.updated_at) stale.add(s.user_id)
  }
  for (const ids of bites([...stale], perBite(VALUE_BITE, keys))) {
    const { data, error: e } = await db.from('dash_user_state').select('user_id,key,value,updated_at').in('user_id', ids).in('key', keys)
    if (e) throw new Error(`dash_user_state values: ${e.message}`)
    for (const r of data || []) cache.set(`${r.user_id}|${r.key}`, { at: r.updated_at, value: r.value })
  }
  const asked = new Set(userIds)
  const askedKeys = new Set(keys)
  for (const k of [...cache.keys()]) {
    const [uid, key] = k.split('|')
    if (asked.has(uid) && askedKeys.has(key) && !live.has(k)) cache.delete(k)
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
