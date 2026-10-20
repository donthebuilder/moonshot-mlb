// "OUR LINE": THE LOCK AND THE RESULT, EVERY SPORT (server only; 2026-10-19 BUCKETS, 2026-10-20 MLB / NFL / NHL).
// Table: game_line_calls (supabase/migrations/202610201000_game_lines_all_sports.sql).
//
// LOCK   a game starting within LOCK_WINDOW_MIN minutes gets ONE row per (sport, model_version): our home margin, what it
//        read, and the book's line in hand (odds_game_lines: the newest snapshot taken before now). Inserted once
//        (ignoreDuplicates); the database refuses a row at or after the start and never lets a locked row change.
//        win_share_home is LOGGED for calibration and never printed.
// RESULT after the final: the final margin and the spread side against the stored book number, written once.
// INFORMATION ONLY (Donovan 10-19 / 10-20): not a call, no record on the site.
// Run by /api/buckets/tick (nba) and /api/totals/tick (mlb, nfl, nhl), every 10 minutes through the playing day.
import { bookLinesFor } from './odds/gameLine'
import { atsResult } from './gameLines'

export const LOCK_WINDOW_MIN = 30
const MIN = 60 * 1000
const TABLE = 'game_line_calls'

/** Book rows for a sport's day (odds_game_lines), [] on any failure (the line still locks, with no book). */
export async function bookRowsFor(db, sport, date) {
  const r = await db.from('odds_game_lines').select('*').eq('sport', sport).eq('game_date', date)
  if (r.error) { console.error(`[our line] ${sport} book rows ${date}: ${r.error.message}`); return [] }
  return r.data || []
}

/** The book line on file for each game of a read, as of `now`. */
export const booksFor = (sport, games, rows, now) => bookLinesFor(sport, games.map((g) => ({ game_id: g.id, away: g.away, home: g.home, start_ms: Date.parse(g.start) })), rows, now)

/** What a locked row keeps of a game's read (the margin's inputs), without the win share. */
const inputsOf = (g, lines) => {
  const keep = {}
  for (const k of ['ratings', 'rest', 'short', 'neutral', 'miss', 'out']) if (g[k] !== undefined) keep[k] = g[k]
  if (lines.injuries) keep.injuries = lines.injuries
  return keep
}

/**
 * Lock the games starting within the window.
 *   day(date)   -> the cheap day read, [{ id, state, start }] (a scoreboard), checked first
 *   read(date)  -> the model's lines for the day (uncached): { version, games: [{ id, state, start, seasonType, away, home, margin, winShare, basis, ... }] }
 */
export async function lockGameLines(db, sport, { date, day, read, now = Date.now() }) {
  const out = { sport, locked: 0, due: 0, skipped: [] }
  const soon = (g) => g.state === 'pre' && Date.parse(g.start) > now && Date.parse(g.start) - now <= LOCK_WINDOW_MIN * MIN
  if (!(await day(date)).some(soon)) return out
  const lines = await read(date)
  const due = lines.games.filter(soon)
  out.due = due.length
  if (!due.length) return out
  const have = await db.from(TABLE).select('game_id').eq('sport', sport).eq('model_version', lines.version).in('game_id', due.map((g) => g.id))
  if (have.error) return { ...out, skipped: [{ why: `read: ${have.error.message}` }] }
  const done = new Set((have.data || []).map((r) => String(r.game_id)))
  const todo = due.filter((g) => !done.has(String(g.id)))
  if (!todo.length) return out
  const books = booksFor(sport, todo, await bookRowsFor(db, sport, date), Date.now())
  for (const g of todo) {
    if (!(Date.now() < Date.parse(g.start))) { out.skipped.push({ game: g.id, why: 'started' }); continue }   // the clock, re-read at the write
    const b = books.get(String(g.id)) || null
    const w = await db.from(TABLE).upsert({
      sport, game_id: g.id, model_version: lines.version, game_date: date, start_at: g.start, season_type: g.seasonType ?? null, away: g.away, home: g.home,
      our_margin_home: g.margin, win_share_home: g.winShare ?? null, basis: g.basis ?? null, inputs: inputsOf(g, lines),
      book_spread_home: b?.spread_home ?? null, book_ml_home: b?.ml_home ?? null, book_ml_away: b?.ml_away ?? null,
      book_taken_at: b?.taken_at ?? null, book_event_id: b?.event_id ?? null,
    }, { onConflict: 'sport,game_id,model_version', ignoreDuplicates: true })
    if (w.error) out.skipped.push({ game: g.id, why: w.error.message.slice(0, 120) }); else out.locked++
  }
  return out
}

/** Locked rows still open whose start is 2+ hours gone: the final margin and the spread side, once. finals(date) -> Map(game_id -> home margin). */
export async function gradeGameLines(db, sport, { finals, now = Date.now() }) {
  const out = { sport, graded: 0, skipped: [] }
  const open = await db.from(TABLE).select('game_id, model_version, game_date, book_spread_home').eq('sport', sport).is('final_margin_home', null).lt('start_at', new Date(now - 2 * 3600e3).toISOString()).limit(60)
  if (open.error) return { ...out, skipped: [{ why: `read: ${open.error.message}` }] }
  const byDay = new Map()
  for (const d of [...new Set((open.data || []).map((r) => r.game_date))]) byDay.set(d, await finals(d).catch(() => new Map()))
  for (const r of open.data || []) {
    const m = byDay.get(r.game_date)?.get(String(r.game_id))
    if (m == null) continue
    const spread = r.book_spread_home == null ? null : Number(r.book_spread_home)
    const w = await db.from(TABLE).update({ final_margin_home: m, ats: spread == null ? null : atsResult(m, spread), graded_at: new Date().toISOString() })
      .eq('sport', sport).eq('game_id', r.game_id).eq('model_version', r.model_version).is('final_margin_home', null)
    if (w.error) out.skipped.push({ game: r.game_id, why: w.error.message.slice(0, 120) }); else out.graded++
  }
  return out
}

/** The locked rows for a sport's day and model, by game id (the page shows these once a game has started). No win share. */
export async function lockedGameLinesFor(db, sport, date, version) {
  const r = await db.from(TABLE).select('game_id, our_margin_home, basis, inputs, book_spread_home, book_ml_home, book_ml_away, book_taken_at, locked_at, final_margin_home, ats')
    .eq('sport', sport).eq('game_date', date).eq('model_version', version)
  if (r.error) { console.error(`[our line] ${sport} locked rows ${date}: ${r.error.message}`); return new Map() }
  return new Map((r.data || []).map((x) => [String(x.game_id), x]))
}

/**
 * The page's answer for a sport's day: before the start, the live read and the newest book line; from the start on,
 * ONLY the row locked before it (no lock = no line). Never a win share.
 */
export function linesAnswer(sport, live, locked, books, now = Date.now()) {
  const names = (list) => (list ? list.map((p) => ({ id: p.id, name: p.name, status: p.status })) : null)
  const pregame = (g) => { const b = books.get(String(g.id)); return b ? { spread_home: b.spread_home, ml_home: b.ml_home, ml_away: b.ml_away, taken_at: b.taken_at } : null }
  const games = live.games.map((g) => {
    const started = g.state !== 'pre' || !(now < Date.parse(g.start))
    const L = locked.get(String(g.id))
    const head = { id: g.id, away: g.away, home: g.home, state: g.state, start: g.start }
    if (started) {
      if (!L) return { ...head, locked: false, our: null, book: null }
      return { ...head, locked: true, lockedAt: L.locked_at, basis: L.basis, our: { margin: L.our_margin_home },
        out: L.inputs?.out ? { away: names(L.inputs.out.away), home: names(L.inputs.out.home) } : null,
        b2b: L.inputs?.short || null,
        // the book line the lock held; a lock taken before the book's own pregame snapshot (NHL's comes 5-15 min before the
        // drop, after our 30-min lock) shows the newest book line taken before the start instead (bookLinesFor never
        // returns one taken at or after it)
        book: L.book_spread_home != null || L.book_ml_home != null
          ? { spread_home: L.book_spread_home == null ? null : Number(L.book_spread_home), ml_home: L.book_ml_home, ml_away: L.book_ml_away, taken_at: L.book_taken_at }
          : pregame(g),
        final: L.final_margin_home == null ? null : { margin: L.final_margin_home } }
    }
    return { ...head, locked: Boolean(L), basis: g.basis, b2b: g.b2b || g.short || null, our: { margin: g.margin },
      out: g.out ? { away: names(g.out.away), home: names(g.out.home) } : null, book: pregame(g) }
  })
  return { sport, date: live.date, version: live.version, unit: live.unit || null, injuries: live.injuries || null, games }
}
