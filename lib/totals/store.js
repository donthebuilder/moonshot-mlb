// TOP TOTALS: THE TABLE (server only). public.top_totals_calls, supabase/migrations/202610091600_top_totals.sql.
//
// THE RULES THE CODE AND THE DATABASE BOTH HOLD (the trigger in the migration is the backstop):
//   - a row is INSERTED only before its game starts (locked_at < start_at, a table check), one row per
//     (sport, game_id, model_version), ignore-duplicates: a second pass never rewrites it
//   - the lock columns (projected_total, line, rank, field_size, called ...) never change after the insert
//   - the result (actual_total, result, hit, graded_at) is written ONCE, by an update guarded on `result is null`
//   - a new model is a new model_version with new rows; old rows are left as they were
// Every function degrades while the table is missing (the migration not run yet): it says so and does nothing.
import { TOTALS_VERSION, TOTALS_SPORTS, lockRows, lockWindowOpen, gradeRow, TOTALS_UNITS, BOOK_LINE_SPORTS } from './core'
import { bookTotalsFor } from '../odds/gameTotal'

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
 * The slate's games with their stored BOOK game total attached (`game.book`), for the sports whose books quote our
 * unit (NHL goals, NBA points). Reads odds_game_totals, which the odds tick already fills from the events it fetches
 * anyway: no SGO call here, no new polling. A table not there yet, a read error, or a game with no stored total just
 * leaves the game without `.book` (it keeps the projection line). Never throws.
 */
export async function withBookTotals(db, sport, games, now = Date.now()) {
  if (!BOOK_LINE_SPORTS.includes(sport) || !games?.length) return games
  try {
    const dates = [...new Set(games.map((g) => g.game_date).filter(Boolean))]
    const { data, error } = await db.from('odds_game_totals').select('sport,event_id,starts_at,snap,taken_at,away,home,line,books').eq('sport', sport).in('game_date', dates).lt('taken_at', new Date(now).toISOString())
    if (error || !data?.length) return games
    const by = bookTotalsFor(sport, games, data, now)
    return games.map((g) => (by.has(String(g.game_id)) ? { ...g, book: by.get(String(g.game_id)) } : g))
  } catch { return games }
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
    let rows = lockRows({ sport, slate_key: slate.slate_key, games: await withBookTotals(db, sport, slate.games, now), now, version })
    if (!rows.length) return 'nothing-before-start'
    let note = ''
    let { error } = await db.from(TOTALS_TABLE).upsert(rows, { onConflict: 'sport,game_id,model_version', ignoreDuplicates: true })
    if (missing(error)) return MISSING
    // the book columns (migration 202610091800) not there yet: lock on the projection line rather than not at all
    if (error && /book_|line_source|schema cache|column/i.test(error.message || '') && rows.some((r) => r.line_source === 'book')) {
      rows = lockRows({ sport, slate_key: slate.slate_key, games: slate.games, now, version })
      note = ' book-columns-missing: projection lines'
      ;({ error } = await db.from(TOTALS_TABLE).upsert(rows, { onConflict: 'sport,game_id,model_version', ignoreDuplicates: true }))
    }
    return error ? `error: ${error.message}` : `locked ${rows.length} (${rows.filter((r) => r.called).length} called) book ${rows.filter((r) => r.line_source === 'book').length}${note}`
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
