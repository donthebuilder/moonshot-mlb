// 🏀 BUCKETS' "OUR LINE": THE LOCK AND THE RESULT (server only, 2026-10-19). The shared lock / grade / page answer is
// lib/gameLinesStore.js (table game_line_calls, sport 'nba'); this hands it BUCKETS' read (with who plays) and scoreboard.
// Run by /api/buckets/tick. INFORMATION ONLY: not a call, no record. The win share is logged there, never printed.
import { ourLinesNow } from './gameLinesRead'
import { scoreboardFor, reduceScoreboard } from './api'
import { lockGameLines, gradeGameLines, lockedGameLinesFor, bookRowsFor as rowsFor, LOCK_WINDOW_MIN } from '../gameLinesStore'
import { GAME_LINES_VERSION } from './gameLines'

export { LOCK_WINDOW_MIN }
const day = async (date) => reduceScoreboard(await scoreboardFor(date))
async function finals(date) {
  const out = new Map()
  for (const g of await day(date)) if (g.state === 'final' && g.home.score != null && g.away.score != null) out.set(g.id, g.home.score - g.away.score)
  return out
}

export const bookRowsFor = (db, date) => rowsFor(db, 'nba', date)
export const lockOurLines = (db, { date, now = Date.now() }) => lockGameLines(db, 'nba', { date, now, day, read: ourLinesNow })
export const gradeOurLines = (db, { now = Date.now() } = {}) => gradeGameLines(db, 'nba', { finals, now })
export const lockedLinesFor = (db, date) => lockedGameLinesFor(db, 'nba', date, GAME_LINES_VERSION)
