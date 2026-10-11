// WHERE LAMP AND BUCKETS RECORD THEIR ORDERINGS (2026-10-10). Server only. Their boards are computed by this site's own
// routes (app/api/lamp/board, app/api/buckets/board), so the snapshot is taken where the route has just computed the
// night: no extra read, no cron. Never throws and never delays the board more than a quick query; a missing table or a
// database that cannot be reached is a silent no-op. Only the current slate window (yesterday to tomorrow) is recorded:
// browsing an old night writes nothing.
import { adminClient } from '../supabase/admin'
import { recordAndPrev } from './store'
import { nhlBoards, nbaBoard } from './compute'

const WINDOW_MS = 2 * 86400000
const inWindow = (date, now = Date.now()) => Math.abs(Date.parse(`${date}T12:00:00Z`) - now) <= WINDOW_MS

let offUntil = 0     // the table is missing or the database is down: do not ask again for five minutes
async function recordAll(sport, date, boards, now) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !inWindow(date, now) || now < offUntil) return
  const db = adminClient()
  if (!db) return
  for (const [board, ranks] of Object.entries(boards)) {
    const r = await recordAndPrev(db, { sport, board, date, ranks, now })
    if (r.status === 'unreachable') { offUntil = now + 300000; return }     // no table yet (or no database): stop quietly, the next board would say the same
  }
}

export async function recordNhlBoard(date, market, board, now = Date.now()) {
  try { await recordAll('nhl', date, nhlBoards(market, board), now) } catch { /* the board never waits on this */ }
}

export async function recordNbaBoard(date, market, board, now = Date.now()) {
  try { await recordAll('nba', date, { [market]: nbaBoard(board) }, now) } catch { /* the board never waits on this */ }
}
