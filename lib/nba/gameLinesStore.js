// 🏀 BUCKETS' "OUR LINE": THE LOCK AND THE RESULT (server only, 2026-10-19). Run by /api/buckets/tick (every 10 min on
// NBA nights). Table: nba_line_calls (supabase/migrations/202610192100_nba_game_lines.sql).
//
// LOCK   a game whose tip is within LOCK_WINDOW_MIN minutes gets ONE row per model_version: our home margin, what it read
//        (ratings, rest, who is out, the injury report's time) and the book's line in hand (odds_game_lines, the newest
//        snapshot taken before now). Inserted once (ignoreDuplicates); the database refuses a row at or after tip and
//        never lets a locked row change. win_share_home is LOGGED for calibration and never printed.
// RESULT after the final, the final margin and the spread side against the stored book number, written once.
// INFORMATION ONLY (Donovan 10-19): not a call, no record on the site.
import { ourLinesNow } from './gameLinesRead'
import { bookLinesFor } from '../odds/gameLine'
import { atsResult, GAME_LINES_VERSION } from './gameLines'
import { scoreboardFor, reduceScoreboard } from './api'

export const LOCK_WINDOW_MIN = 30
const MIN = 60 * 1000

/** Book rows for a day (odds_game_lines), [] on any failure (the line still locks, with no book). */
export async function bookRowsFor(db, date) {
  const r = await db.from('odds_game_lines').select('*').eq('sport', 'nba').eq('game_date', date)
  if (r.error) { console.error(`[our line] book rows ${date}: ${r.error.message}`); return [] }
  return r.data || []
}

export async function lockOurLines(db, { date, now = Date.now() }) {
  const out = { locked: 0, due: 0, skipped: [] }
  // the cheap read first: nothing within the window = no model run this tick
  const soon = (g) => g.state === 'pre' && Date.parse(g.start) > now && Date.parse(g.start) - now <= LOCK_WINDOW_MIN * MIN
  if (!reduceScoreboard(await scoreboardFor(date)).some(soon)) return out
  const lines = await ourLinesNow(date)
  const due = lines.games.filter(soon)
  out.due = due.length
  if (!due.length) return out
  const have = await db.from('nba_line_calls').select('game_id').eq('model_version', GAME_LINES_VERSION).in('game_id', due.map((g) => g.id))
  if (have.error) return { ...out, skipped: [{ why: `read: ${have.error.message}` }] }
  const done = new Set((have.data || []).map((r) => String(r.game_id)))
  const todo = due.filter((g) => !done.has(String(g.id)))
  if (!todo.length) return out
  const books = bookLinesFor('nba', todo.map((g) => ({ game_id: g.id, away: g.away, home: g.home, start_ms: Date.parse(g.start) })), await bookRowsFor(db, date), Date.now())
  for (const g of todo) {
    if (!(Date.now() < Date.parse(g.start))) { out.skipped.push({ game: g.id, why: 'tipped' }); continue }   // the clock, re-read at the write
    const b = books.get(String(g.id)) || null
    const row = {
      game_id: g.id, model_version: GAME_LINES_VERSION, game_date: date, start_at: g.start, season_type: g.seasonType, away: g.away, home: g.home,
      our_margin_home: g.margin, win_share_home: g.winShare, basis: g.basis,
      inputs: { ratings: g.ratings, rest: g.rest, miss: g.miss, out: g.out, injuries: lines.injuries },
      book_spread_home: b?.spread_home ?? null, book_ml_home: b?.ml_home ?? null, book_ml_away: b?.ml_away ?? null,
      book_taken_at: b?.taken_at ?? null, book_event_id: b?.event_id ?? null,
    }
    const w = await db.from('nba_line_calls').upsert(row, { onConflict: 'game_id,model_version', ignoreDuplicates: true })
    if (w.error) out.skipped.push({ game: g.id, why: w.error.message.slice(0, 120) }); else out.locked++
  }
  return out
}

/** Locked rows still waiting on a result, whose tip is 2+ hours gone: the final margin and the spread side, once. */
export async function gradeOurLines(db, { now = Date.now() } = {}) {
  const out = { graded: 0, skipped: [] }
  const open = await db.from('nba_line_calls').select('game_id, model_version, game_date, home, book_spread_home').is('final_margin_home', null).lt('start_at', new Date(now - 2 * 3600e3).toISOString()).limit(60)
  if (open.error) return { ...out, skipped: [{ why: `read: ${open.error.message}` }] }
  const days = [...new Set((open.data || []).map((r) => r.game_date))]
  const finals = new Map()
  for (const d of days) {
    const sb = reduceScoreboard(await scoreboardFor(d).catch(() => null))
    for (const g of sb) if (g.state === 'final' && g.home.score != null && g.away.score != null) finals.set(g.id, g.home.score - g.away.score)
  }
  for (const r of open.data || []) {
    const m = finals.get(String(r.game_id))
    if (m == null) continue
    const spread = r.book_spread_home == null ? null : Number(r.book_spread_home)
    const w = await db.from('nba_line_calls').update({ final_margin_home: m, ats: spread == null ? null : atsResult(m, spread), graded_at: new Date().toISOString() })
      .eq('game_id', r.game_id).eq('model_version', r.model_version).is('final_margin_home', null)
    if (w.error) out.skipped.push({ game: r.game_id, why: w.error.message.slice(0, 120) }); else out.graded++
  }
  return out
}

/** The locked rows for a day, by game id (the page shows these once a game has tipped). win_share_home is left out. */
export async function lockedLinesFor(db, date) {
  const r = await db.from('nba_line_calls').select('game_id, model_version, our_margin_home, basis, inputs, book_spread_home, book_ml_home, book_ml_away, book_taken_at, locked_at, final_margin_home, ats')
    .eq('game_date', date).eq('model_version', GAME_LINES_VERSION)
  if (r.error) { console.error(`[our line] locked rows ${date}: ${r.error.message}`); return new Map() }
  return new Map((r.data || []).map((x) => [String(x.game_id), x]))
}
