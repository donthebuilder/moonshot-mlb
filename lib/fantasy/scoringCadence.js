// WHEN THE SCORING CRON HAS NOTHING TO DO (2026-09-24).
//
// vercel.json fires /api/fantasy/scoring every 10 minutes from 17:00 to 07:59
// UTC, every day -- ~120 runs a day, Tuesday and Wednesday included, each one
// reading rosters, lineups and matchups out of Supabase. The free plan's egress
// was exceeded this cycle. Most of those runs change nothing.
//
// The cron keeps its schedule (a schedule cannot know about Christmas games or
// a Friday in Brazil); the route asks this function first, using the NFL feed
// it already loaded from GitHub -- no Supabase read. A tick is QUIET when:
//
//   · it is not the top-of-hour heartbeat (minute < HEARTBEAT_MINUTES keeps
//     one full run an hour: waivers clear, injuries refresh, playoffs seed), and
//   · no game is in progress, and
//   · no game kicks off within LEAD_MS (auto-lineups fill from an hour before
//     the first kickoff, and lineups lock at kickoff), and
//   · no game kicked off within TAIL_MS (a game plus its final stat
//     corrections).
//
// Anything it cannot read (no games, a bad kickoff) counts as NOT quiet: when
// unsure, do the work.
export const HEARTBEAT_MINUTES = 10
export const LEAD_MS = 90 * 60 * 1000
export const TAIL_MS = 5 * 60 * 60 * 1000
const IDLE = new Set(['scheduled', 'final', 'postponed', 'canceled', 'cancelled'])

export function isQuietTick(games, now = Date.now()) {
  if (new Date(now).getUTCMinutes() < HEARTBEAT_MINUTES) return false
  if (!Array.isArray(games) || !games.length) return false
  for (const game of games) {
    const status = String(game?.status || '').toLowerCase()
    if (!IDLE.has(status)) return false
    const at = new Date(game?.kickoff).getTime()
    if (!Number.isFinite(at)) return false
    if (at - LEAD_MS <= now && now <= at + TAIL_MS) return false
  }
  return true
}
