// THE CARD: THE TABLE (server only). public.card_calls, supabase/migrations/202610101000_card_calls.sql (+ 202610101100_card_map.sql).
//
// THE RULES THE CODE AND THE DATABASE BOTH HOLD (the trigger in the migration is the backstop):
//   - a bot row is INSERTED only before its first game starts, one row per (sport, card_date, lane, product, slot, model_version),
//     ignore-duplicates: a second pass never rewrites it
//   - the lock columns never change after the insert (Donovan's row may change only BEFORE its lock)
//   - the result (result, leg_results, graded_at) is written ONCE, by an update guarded on `result is null`
//   - a new model is a new model_version; old rows are left as they were (card-v1 rows are still read, in the same record lines)
// THE PRODUCTS: straight, two_man (the bot's and Donovan's), long_shot (one per sport with a full slate), and the cross-sport double (sport 'all').
// Every function degrades while the table is missing (the migration not run yet): it says so and does nothing.
import { CARD_VERSION, CARD_VERSIONS, DOUBLE_SPORT, planWindow, lockWindowOpen, legWord, gradeCardRow, recordsOf, rowPrice, legPriceOf, resultKey, resultKeyAny } from './core'
import { pricesFromRows, priceKey, readLockPrices } from '../odds/priceAtLock'

export const CARD_TABLE = 'card_calls'
const missing = (e) => e && (e.code === '42P01' || e.code === 'PGRST205' || /does not exist|schema cache/i.test(e.message || ''))
export const MISSING = 'table-missing (run supabase/migrations/202610101000_card_calls.sql and 202610101100_card_map.sql)'
const KEY = 'sport,card_date,lane,product,slot,model_version'

/** The bot's locked cards of the last nine days, of ANY card version (a date already locked by the first Card is never locked a second time). */
export async function lockedCards(db, sport, now = Date.now()) {
  const since = new Date(now - 9 * 864e5).toISOString()
  const { data, error } = await db.from(CARD_TABLE).select('card_date,start_at,product,slot').eq('sport', sport).eq('lane', 'bot').in('model_version', CARD_VERSIONS).gte('start_at', since)
  if (missing(error)) return { missing: true, rows: [] }
  if (error) throw new Error(error.message)
  return { missing: false, rows: data || [] }
}

/** True when a Double is already locked for this game date (bot lane, any card version). */
export async function doubleLocked(db, date) {
  const { data, error } = await db.from(CARD_TABLE).select('id').eq('sport', DOUBLE_SPORT).eq('lane', 'bot').eq('product', 'double').eq('card_date', date).in('model_version', CARD_VERSIONS).limit(1)
  if (missing(error)) return { missing: true, locked: false }
  if (error) throw new Error(error.message)
  return { missing: false, locked: Boolean(data?.length) }
}

/**
 * Lock one card window if its time has come and it has not been locked. `win` = lib/card/sources.js loadWindows' entry, `inputs` =
 * loadCardInputs (the markets, the games, the stored prices). The straights by slate size, the Two-Man and the Long Shot go in ONE insert.
 * Returns a short string for the tick's log; never throws.
 */
export async function lockCard(db, sport, win, inputs, { now = Date.now(), version = CARD_VERSION, pairNote = null } = {}) {
  try {
    if (!lockWindowOpen(win.first_start_ms, now)) return 'window-not-open'
    const plan = planWindow({ sport, win, inputs, now, version, pairNote })
    const rows = plan.rows
    if (!rows.length) return `nothing-before-start${plan.skipped.length ? ` (${plan.skipped.map((s) => `slot ${s.slot}: ${s.reason}`).join('; ')})` : ''}`
    // NOTHING PRE-GAME IS WRITTEN AT OR AFTER THE START: the clock is re-read just before the write
    const fresh = Date.now()
    const live = rows.filter((r) => Date.parse(r.start_at) > fresh)
    if (live.length !== rows.length) return 'started-while-locking'
    const { error } = await db.from(CARD_TABLE).upsert(rows, { onConflict: KEY, ignoreDuplicates: true })
    if (missing(error)) return MISSING
    if (error) return `error: ${error.message}`
    const n = (p) => rows.filter((r) => r.product === p).length
    const two = rows.find((r) => r.product === 'two_man')
    const skipped = plan.skipped.length ? ` · skipped ${plan.skipped.map((s) => `${s.slot}: ${s.reason}`).join('; ')}` : ''
    return `locked ${n('straight')} straight(s) of ${plan.games} game(s)${two ? (two.rule.includes('same-game') ? ' + same-game two-man' : ' + two-man') : ' (no two-man)'}${n('long_shot') ? ' + long shot' : ''}${skipped}`
  } catch (e) { return `error: ${e?.message}` }
}

/** Lock the Double (a row from lib/card/core.js doubleRow). Insert-only and ignore-duplicates; refused at or after its earliest start. */
export async function lockDouble(db, row, now = Date.now()) {
  try {
    if (!(Date.parse(row.start_at) > Date.now()) || !(Date.parse(row.start_at) > now)) return 'started-while-locking'
    const { error } = await db.from(CARD_TABLE).upsert([row], { onConflict: KEY, ignoreDuplicates: true })
    if (missing(error)) return MISSING
    return error ? `error: ${error.message}` : 'locked double'
  } catch (e) { return `error: ${e?.message}` }
}

/** Save Donovan's two-man or Double (a row from lib/card/core.js donovanRow / donovanDoubleRow). Allowed only before its lock; the database refuses it afterwards. */
export async function saveDonovan(db, row) {
  const { data, error } = await db.from(CARD_TABLE).upsert([row], { onConflict: KEY }).select('id,card_date,locks_at,start_at')
  if (missing(error)) return { ok: false, error: MISSING }
  if (error) return { ok: false, error: error.message }
  return { ok: true, row: data?.[0] || null }
}

/** Withdraw Donovan's open entry (the database only allows it before the lock). `product` 'double' withdraws his Double (sport 'all'). */
export async function withdrawDonovan(db, { sport, card_date, product = 'two_man', version = CARD_VERSION }) {
  const { error } = await db.from(CARD_TABLE).delete().match({ sport: product === 'double' ? DOUBLE_SPORT : sport, card_date, lane: 'donovan', product, slot: 1, model_version: version })
  return error ? { ok: false, error: error.message } : { ok: true }
}

/** Rows with no result whose first game has started (the candidates for grading). `sport` 'all' = the Doubles. */
export async function openRows(db, sport, now = Date.now()) {
  const { data, error } = await db.from(CARD_TABLE).select('*').eq('sport', sport).is('result', null).lt('start_at', new Date(now).toISOString())
  if (missing(error)) return []
  if (error) throw new Error(error.message)
  return data || []
}

/** The box-score entry of a leg in a results Map (a Double's legs carry their sport in the key). A game never played answers { played: false }. */
export const resultOfLeg = (results, row, leg) => results.get(resultKey(row, leg)) ?? results.get(resultKeyAny(row, leg)) ?? null

/** Grade the open rows whose legs are final. `results` = lib/card/sources.js loadLegResults. The write is once-only. */
export async function gradeCardRows(db, rows, results, now = Date.now()) {
  let done = 0
  for (const r of rows) {
    const words = (r.legs || []).map((l) => legWord(resultOfLeg(results, r, l), l))
    const g = gradeCardRow(r, words)
    if (!g) continue
    const { error, data } = await db.from(CARD_TABLE).update({ ...g, graded_at: new Date(now).toISOString() }).eq('id', r.id).is('result', null).select('id')
    if (error) { console.error(`[card] grade ${r.sport} ${r.id}: ${error.message}`); continue }
    done += data?.length || 0
  }
  return done
}

/** One card's rows (bot + Donovan's once his lock has passed; his open entry is never returned here). Every card version for the date. */
export async function cardRows(db, sport, cardDate, { now = Date.now() } = {}) {
  const { data, error } = await db.from(CARD_TABLE).select('*').eq('sport', sport).eq('card_date', cardDate).in('model_version', CARD_VERSIONS).order('lane').order('product', { ascending: false }).order('slot')
  if (missing(error)) return []
  if (error) throw new Error(error.message)
  return (data || []).filter(publicRow(now))
}

/** What the public may read: the bot's rows, Donovan's once his lock has passed; the bot's DOUBLE only once graded (members get the ticket, the public the result). */
export const publicRow = (now) => (r) => (r.lane === 'bot' ? !(r.product === 'double' && r.result == null) : now >= Date.parse(r.locks_at))

/** Every Card row of one game date, all sports and the Double (THE DAY, #members, reads this). Donovan's only once his lock has passed. */
export async function dayRows(db, cardDate, { now = Date.now() } = {}) {
  const { data, error } = await db.from(CARD_TABLE).select('*').eq('card_date', cardDate).in('model_version', CARD_VERSIONS).order('sport').order('lane').order('product', { ascending: false }).order('slot')
  if (missing(error)) return []
  if (error) throw new Error(error.message)
  return (data || []).filter((r) => r.lane === 'bot' || now >= Date.parse(r.locks_at))
}

/** Donovan's row for a card, whatever its state (the admin form reads it back). `product` 'double' = his Double. */
export async function donovanEntry(db, sport, cardDate, product = 'two_man', version = CARD_VERSION) {
  const { data, error } = await db.from(CARD_TABLE).select('*').match({ sport: product === 'double' ? DOUBLE_SPORT : sport, card_date: cardDate, lane: 'donovan', product, slot: 1, model_version: version }).maybeSingle()
  if (missing(error) || error) return null
  return data || null
}

/** The newest card_date locked for a sport (the page's default), or null. */
export async function latestCardDate(db, sport, now = Date.now()) {
  const { data, error } = await db.from(CARD_TABLE).select('card_date,lane,locks_at').eq('sport', sport).in('model_version', CARD_VERSIONS).order('card_date', { ascending: false }).limit(12)
  if (missing(error) || error) return null
  return (data || []).find((r) => r.lane === 'bot' || now >= Date.parse(r.locks_at))?.card_date || null
}

/** Every row of the sport for the record (Donovan's only once locked), every card version. 'all' = the Doubles. */
export async function recordRows(db, sport, { now = Date.now(), limit = 2000 } = {}) {
  const { data, error } = await db.from(CARD_TABLE).select('*').eq('sport', sport).in('model_version', CARD_VERSIONS).order('card_date', { ascending: false }).limit(limit)
  if (missing(error)) return []
  if (error) throw new Error(error.message)
  return (data || []).filter((r) => r.lane === 'bot' || now >= Date.parse(r.locks_at))
}

/**
 * The records of a sport (lib/card/core.js recordsOf: the bot's anytime straights, one line per volume market, the Two-Man, the SAME-GAME Two-Man,
 * Donovan's, the Long Shot, never mixed), with each graded row's price: a pick that froze its own line and price takes THAT (a volume straight, the
 * Long Shot); an anytime straight takes the stored LOCK snapshot's (odds_snap, lib/odds/priceAtLock); a two-man the product of its two legs'. A row
 * with a leg that has no stored price has no price, and says so (units are quoted only from MIN_PRICED priced calls; 300 for the Long Shot).
 */
export async function recordsFor(db, sport, rows) {
  const dates = rows.map((r) => String(r.card_date).slice(0, 10)).sort()
  let prices = new Map()
  const needsSnap = rows.some((r) => (r.result === 'hit' || r.result === 'miss') && r.legs.some((l) => !(l.price && Number.isInteger(l.price.median))))
  if (dates.length && needsSnap && sport !== DOUBLE_SPORT) {
    const lock = await readLockPrices(db, { sport, since: dates[0], until: dates.at(-1) })
    if (!lock.error) prices = lock.prices
  }
  const priceOf = (r) => rowPrice(r, r.legs.map((l) => legPriceOf(l, prices.get(priceKey(sport, l.game_date, String(l.player_id))) || null)))
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
