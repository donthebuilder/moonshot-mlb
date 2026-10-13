// BUCKETS' LANE NIGHTS, WIRED TO THE BUCKETS TICK (2026-10-12, BUCKETS parity pass). Server only; the tick (app/api/buckets/tick) calls these.
// THE RULE THAT MATTERS: THESE WRITE NOTHING WHILE BUCKETS IS HIDDEN. Both functions return { skipped: 'hidden' } before they touch the database unless
// the ONE open switch (lib/openSwitch.js bucketsOpen) is on: no new stored data while hidden (Donovan's rule), and an early-access grant does not open it
// (a grant opens reads, never a writer). The shared record (lib/numerology/record.js) is the same code LAMP, TUDDY and MOONSHOT's ticks run; only the two
// adapters are BUCKETS' own (lib/numerology/nbaNight.js).
//
//   recordNbaLanes(db, { date, games })     BEFORE tip: the night's players of games still ahead, written once (first write wins), preseason left out
//   gradeNbaLanes(db, { game, box })        AFTER the final: every logged player of that game graded from its box score (a man with no line did not play: void)
//
// Needs supabase/migrations/202610122000_numerology_nba.sql (the three numerology tables' sport check accepts 'nba'). Until it has run a write fails with a clear
// message that the tick logs and moves past: nothing else in the tick depends on it.
import { bucketsOpen } from '../openSwitch'
import { writeNight, gradeNight, refreshLaneNights } from './record'
import { nbaLanePlayers, nbaBoxResults } from './nbaNight'

/** The games whose lanes are recorded: regular season and playoffs (never preseason), still to tip. Pure. */
export function lanesGames(games, now = Date.now()) {
  return (games || []).filter((g) => (g.seasonType === 2 || g.seasonType === 3) && g.state === 'pre' && Date.parse(g.start) > now)
}

/**
 * Write the night's lane players for the games still ahead. `read` = lib/nba/numerology.js readNbaNumerology(date) (injected so a test hands in a fake).
 * -> { skipped } | { games, players, rows }
 */
export async function recordNbaLanes(db, { date, games, now = Date.now(), read = null, write = writeNight, open = bucketsOpen } = {}) {
  if (!open()) return { skipped: 'hidden' }
  const ahead = lanesGames(games, now)
  if (!ahead.length) return { skipped: 'no regular-season game still ahead' }
  const ids = new Set(ahead.map((g) => String(g.id)))
  const reader = read || (await import('../nba/numerology')).readNbaNumerology
  const night = await reader(date)
  // only players listed from a ROSTER (nothing seen after tip), of a game that is still ahead
  const players = nbaLanePlayers({ all: (night?.all || []).filter((r) => r.from === 'roster' && ids.has(String(r.gameId))) })
  if (!players.length) return { games: ahead.length, players: 0, rows: 0 }
  const res = await write(db, 'nba', date, players)
  return { games: ahead.length, ...res }
}

/**
 * Grade a final game's logged players and refresh the night's lane summary. `box` = reduceBox() rows of the final.
 * -> { skipped } | { graded }
 */
export async function gradeNbaLanes(db, { game, day, box, grade = gradeNight, refresh = refreshLaneNights, open = bucketsOpen } = {}) {
  if (!open()) return { skipped: 'hidden' }
  if (!game || game.seasonType === 1) return { skipped: 'preseason is not recorded' }
  const logged = await db.from('numerology_log').select('player_id').eq('sport', 'nba').eq('day', day).eq('lane', '_eligible').in('team', [game.away.abbrev, game.home.abbrev]).is('graded_at', null)
  if (logged.error) throw new Error(`numerology_log read: ${logged.error.message}`)
  const ids = (logged.data || []).map((r) => String(r.player_id))
  if (!ids.length) return { graded: 0 }
  const results = nbaBoxResults(box, ids)
  const graded = await grade(db, 'nba', day, results)
  if (graded) await refresh(db, 'nba', day)
  return { graded }
}
