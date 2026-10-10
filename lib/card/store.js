// THE CARD: THE TABLE (server only). public.card_calls, supabase/migrations/202610101000_card_calls.sql.
//
// THE RULES THE CODE AND THE DATABASE BOTH HOLD (the trigger in the migration is the backstop):
//   - a bot row is INSERTED only before its first game starts, one row per (sport, card_date, lane, product, slot, model_version),
//     ignore-duplicates: a second pass never rewrites it
//   - the lock columns never change after the insert (Donovan's row may change only BEFORE its lock)
//   - the result (result, leg_results, graded_at) is written ONCE, by an update guarded on `result is null`
//   - a new model is a new model_version; old rows are left as they were
// Every function degrades while the table is missing (the migration not run yet): it says so and does nothing.
import { CARD_VERSION, lockRows, lockAtOf, lockWindowOpen, legWord, gradeCardRow, recordsOf, rowPrice } from './core'
import { pricesFromRows, priceKey, readLockPrices } from '../odds/priceAtLock'

export const CARD_TABLE = 'card_calls'
const missing = (e) => e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''))
export const MISSING = 'table-missing (run supabase/migrations/202610101000_card_calls.sql)'
const KEY = 'sport,card_date,lane,product,slot,model_version'

/** The bot's locked cards of the last nine days: which (card_date) are already locked, one select per sport per tick. */
export async function lockedCards(db, sport, now = Date.now(), version = CARD_VERSION) {
  const since = new Date(now - 9 * 864e5).toISOString()
  const { data, error } = await db.from(CARD_TABLE).select('card_date,start_at,product,slot').eq('sport', sport).eq('lane', 'bot').eq('model_version', version).gte('start_at', since)
  if (missing(error)) return { missing: true, rows: [] }
  if (error) throw new Error(error.message)
  return { missing: false, rows: data || [] }
}

/**
 * Lock one card window if its time has come and it has not been locked. `win` = lib/card/sources.js loadWindows' entry, `cands` its
 * candidates. Returns a short string for the tick's log; never throws.
 */
export async function lockCard(db, sport, win, cands, { now = Date.now(), version = CARD_VERSION, pairNote = null } = {}) {
  try {
    if (!lockWindowOpen(win.first_start_ms, now)) return 'window-not-open'
    const rows = lockRows({ sport, slate_key: win.slate_key, card_date: win.card_date, cands, now, lockAtMs: lockAtOf(win.first_start_ms), version, pairNote })
    if (!rows.length) return 'nothing-before-start'
    // NOTHING PRE-GAME IS WRITTEN AT OR AFTER THE START: the clock is re-read just before the write
    const fresh = Date.now()
    const live = rows.filter((r) => Date.parse(r.start_at) > fresh)
    if (live.length !== rows.length) return 'started-while-locking'
    const { error } = await db.from(CARD_TABLE).upsert(rows, { onConflict: KEY, ignoreDuplicates: true })
    if (missing(error)) return MISSING
    return error ? `error: ${error.message}` : `locked ${rows.filter((r) => r.product === 'straight').length} straight(s)${rows.some((r) => r.product === 'two_man') ? ' + two-man' : ' (no two-man: one game only)'}`
  } catch (e) { return `error: ${e?.message}` }
}

/** Save Donovan's two-man (a row from lib/card/core.js donovanRow). Allowed only before its lock; the database refuses it afterwards. */
export async function saveDonovan(db, row) {
  const { data, error } = await db.from(CARD_TABLE).upsert([row], { onConflict: KEY }).select('id,card_date,locks_at,start_at')
  if (missing(error)) return { ok: false, error: MISSING }
  if (error) return { ok: false, error: error.message }
  return { ok: true, row: data?.[0] || null }
}

/** Withdraw Donovan's open entry (the database only allows it before the lock). */
export async function withdrawDonovan(db, { sport, card_date, version = CARD_VERSION }) {
  const { error } = await db.from(CARD_TABLE).delete().match({ sport, card_date, lane: 'donovan', product: 'two_man', slot: 1, model_version: version })
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Rows with no result whose first game has started (the candidates for grading). */
export async function openRows(db, sport, now = Date.now()) {
  const { data, error } = await db.from(CARD_TABLE).select('*').eq('sport', sport).is('result', null).lt('start_at', new Date(now).toISOString())
  if (missing(error)) return []
  if (error) throw new Error(error.message)
  return data || []
}

/** Grade the open rows whose legs are final. `results` = lib/card/sources.js loadLegResults. The write is once-only. */
export async function gradeCardRows(db, rows, results, now = Date.now()) {
  let done = 0
  for (const r of rows) {
    const words = (r.legs || []).map((l) => legWord(results.get(`${l.game_id}|${l.player_id}`) ?? results.get(`${l.game_id}|*`) ?? null))
    const g = gradeCardRow(r, words)
    if (!g) continue
    const { error, data } = await db.from(CARD_TABLE).update({ ...g, graded_at: new Date(now).toISOString() }).eq('id', r.id).is('result', null).select('id')
    if (error) { console.error(`[card] grade ${r.sport} ${r.id}: ${error.message}`); continue }
    done += data?.length || 0
  }
  return done
}

/** One card's rows (bot + Donovan's once his lock has passed; his open entry is never returned here). */
export async function cardRows(db, sport, cardDate, { now = Date.now(), version = CARD_VERSION } = {}) {
  const { data, error } = await db.from(CARD_TABLE).select('*').eq('sport', sport).eq('card_date', cardDate).eq('model_version', version).order('lane').order('product', { ascending: false }).order('slot')
  if (missing(error)) return []
  if (error) throw new Error(error.message)
  return (data || []).filter((r) => r.lane === 'bot' || now >= Date.parse(r.locks_at))
}

/** Donovan's row for a card, whatever its state (the admin form reads it back). */
export async function donovanEntry(db, sport, cardDate, version = CARD_VERSION) {
  const { data, error } = await db.from(CARD_TABLE).select('*').match({ sport, card_date: cardDate, lane: 'donovan', product: 'two_man', slot: 1, model_version: version }).maybeSingle()
  if (missing(error) || error) return null
  return data || null
}

/** The newest card_date locked for a sport (the page's default), or null. */
export async function latestCardDate(db, sport, now = Date.now(), version = CARD_VERSION) {
  const { data, error } = await db.from(CARD_TABLE).select('card_date,lane,locks_at').eq('sport', sport).eq('model_version', version).order('card_date', { ascending: false }).limit(12)
  if (missing(error) || error) return null
  return (data || []).find((r) => r.lane === 'bot' || now >= Date.parse(r.locks_at))?.card_date || null
}

/** Every row of the sport for the record (Donovan's only once locked). */
export async function recordRows(db, sport, { now = Date.now(), version = CARD_VERSION, limit = 2000 } = {}) {
  const { data, error } = await db.from(CARD_TABLE).select('*').eq('sport', sport).eq('model_version', version).order('card_date', { ascending: false }).limit(limit)
  if (missing(error)) return []
  if (error) throw new Error(error.message)
  return (data || []).filter((r) => r.lane === 'bot' || now >= Date.parse(r.locks_at))
}

/**
 * The records of a sport (the bot's straights, the bot's two-man, Donovan's two-man, never mixed), with each graded row's price from the
 * stored LOCK snapshot (odds_snap, lib/odds/priceAtLock): a straight's leg price; a two-man the product of its two. A row with a leg
 * that has no stored price has no price, and says so (units are quoted only from MIN_PRICED priced calls).
 */
export async function recordsFor(db, sport, rows) {
  const dates = rows.map((r) => String(r.card_date).slice(0, 10)).sort()
  let prices = new Map()
  if (dates.length && rows.some((r) => r.result === 'hit' || r.result === 'miss')) {
    const lock = await readLockPrices(db, { sport, since: dates[0], until: dates.at(-1) })
    if (!lock.error) prices = lock.prices
  }
  const priceOf = (r) => rowPrice(r, r.legs.map((l) => prices.get(priceKey(sport, l.game_date, String(l.player_id))) || null))
  return recordsOf(rows, { priceOf })
}

/** The newest stored anytime prices for a card's players (members text): Map(player_id -> { best, median, books } | absent). */
export async function currentPrices(db, sport, legs) {
  const ids = [...new Set(legs.map((l) => String(l.player_id)))]
  const dates = [...new Set(legs.map((l) => l.game_date))]
  const out = new Map()
  if (!ids.length) return out
  try {
    const { data, error } = await db.from('odds_snap').select('sport,event_id,game_date,our_player_id,book,odds,available,fair_odds,open_odds,taken_at').eq('sport', sport).in('our_player_id', ids).in('game_date', dates).order('taken_at', { ascending: false }).limit(1500)
    if (error || !data?.length) return out
    const newest = new Map()
    for (const r of data) if (!newest.has(r.our_player_id)) newest.set(r.our_player_id, r.taken_at)
    const keep = data.filter((r) => r.taken_at === newest.get(r.our_player_id))
    const { prices } = pricesFromRows(keep)
    for (const l of legs) { const p = prices.get(priceKey(sport, l.game_date, String(l.player_id))); if (p) out.set(String(l.player_id), { best: p.best, median: p.median, books: p.books, at: newest.get(l.player_id) || newest.get(String(l.player_id)) || null }) }
  } catch { /* a price we cannot read is "no price on file yet", never a guess */ }
  return out
}
