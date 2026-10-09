// TOP TOTALS: THE TABLE (server only). public.top_totals_calls, supabase/migrations/202610091600_top_totals.sql.
//
// THE RULES THE CODE AND THE DATABASE BOTH HOLD (the trigger in the migration is the backstop):
//   - a row is INSERTED only before its game starts (locked_at < start_at, a table check), one row per
//     (sport, game_id, model_version), ignore-duplicates: a second pass never rewrites it
//   - the lock columns (projected_total, line, rank, field_size, called ...) never change after the insert
//   - the result (actual_total, result, hit, graded_at) is written ONCE, by an update guarded on `result is null`
//   - a new model is a new model_version with new rows; old rows are left as they were
// Every function degrades while the table is missing (the migration not run yet): it says so and does nothing.
import { TOTALS_VERSION, TOTALS_SPORTS, lockRows, lockWindowOpen, gradeRow, TOTALS_UNITS } from './core'

export const TOTALS_TABLE = 'top_totals_calls'
const missing = (e) => e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''))
const MISSING = `table-missing (run supabase/migrations/202610091600_top_totals.sql)`

/** A slate already locked? One select per sport per tick: the locked slate keys and when their games start. */
export async function lockedKeys(db, sport, now = Date.now(), version = TOTALS_VERSION) {
  const since = new Date(now - 9 * 864e5).toISOString()
  const { data, error } = await db.from(TOTALS_TABLE).select('slate_key,start_at,game_id,result').eq('sport', sport).eq('model_version', version).gte('start_at', since)
  if (missing(error)) return { missing: true, rows: [] }
  if (error) throw new Error(error.message)
  return { missing: false, rows: data || [] }
}

/**
 * Lock one sport's slate if its window is open and it has not been locked. `slate` is lib/totals/sources.js
 * loadSlate's answer. Returns a short string for the tick's log; never throws.
 */
export async function lockSlate(db, sport, slate, { now = Date.now(), version = TOTALS_VERSION, have = null } = {}) {
  try {
    if (!slate?.ok) return `no-slate: ${slate?.why || 'unread'}`
    if (!slate.games.length) return 'no-games'
    // the window is the WHOLE slate's: it opens LOCK_LEAD_MIN before the first game, started or not
    if (!lockWindowOpen(slate.games, now)) return 'window-not-open'
    const keys = have ? have : await lockedKeys(db, sport, now, version)
    if (keys.missing) return MISSING
    if (keys.rows.some((r) => r.slate_key === slate.slate_key)) return 'already-locked'
    const rows = lockRows({ sport, slate_key: slate.slate_key, games: slate.games, now, version })
    if (!rows.length) return 'nothing-before-start'
    const { error } = await db.from(TOTALS_TABLE).upsert(rows, { onConflict: 'sport,game_id,model_version', ignoreDuplicates: true })
    if (missing(error)) return MISSING
    return error ? `error: ${error.message}` : `locked ${rows.length} (${rows.filter((r) => r.called).length} called)`
  } catch (e) { return `error: ${e?.message}` }
}

/** Grade the sport's open rows whose game is final. `finals` = lib/totals/sources.js loadFinals(sport, rows). The write is once-only. */
export async function gradeRows(db, rows, finals, now = Date.now()) {
  let done = 0
  for (const r of rows) {
    const g = gradeRow(r, finals.get(r.game_id))
    if (!g) continue
    const { error, data } = await db.from(TOTALS_TABLE).update({ ...g, graded_at: new Date(now).toISOString() })
      .match({ sport: r.sport, game_id: r.game_id, model_version: r.model_version }).is('result', null).select('game_id')
    if (error) { console.error(`[totals] grade ${r.sport} ${r.game_id}: ${error.message}`); continue }
    done += data?.length || 0
  }
  return done
}

/** The sport's rows with no result whose start has passed (the candidates for grading). */
export async function openRows(db, sport, now = Date.now()) {
  const { data, error } = await db.from(TOTALS_TABLE).select('*').eq('sport', sport).is('result', null).lt('start_at', new Date(now).toISOString())
  if (missing(error)) return []
  if (error) throw new Error(error.message)
  return data || []
}

/** One slate's rows, best projection first. */
export async function slateRows(db, sport, slateKey, version = TOTALS_VERSION) {
  const { data, error } = await db.from(TOTALS_TABLE).select('*').eq('sport', sport).eq('slate_key', slateKey).eq('model_version', version).order('rank', { ascending: true })
  if (missing(error)) return []
  if (error) throw new Error(error.message)
  return data || []
}

/** The newest slate's key for a sport (the page's default), or null. */
export async function latestKey(db, sport, version = TOTALS_VERSION) {
  const { data, error } = await db.from(TOTALS_TABLE).select('slate_key,start_at').eq('sport', sport).eq('model_version', version).order('start_at', { ascending: false }).limit(1)
  if (missing(error) || error) return null
  return data?.[0]?.slate_key || null
}

/** The graded CALLED rows (newest first) for the Ledger's record, plus every CALLED row of the window. */
export async function recordRows(db, sport, { limit = 400, version = TOTALS_VERSION } = {}) {
  const { data, error } = await db.from(TOTALS_TABLE).select('*').eq('sport', sport).eq('model_version', version).order('start_at', { ascending: false }).limit(limit)
  if (missing(error)) return []
  if (error) throw new Error(error.message)
  return data || []
}

export { TOTALS_SPORTS, TOTALS_UNITS }
