// THE PLAYER CATALOG, FETCHED ONCE INSTEAD OF ONCE PER REFRESH (2026-09-07)
//
// The draft room is a server component and DraftRoomLive calls router.refresh()
// every five seconds while the draft is live. Every one of those refreshes
// re-ran the whole page, and the whole page included this:
//
//   .from('nfl_players').select('...,source_payload,...').eq('active', true)
//
// 562 rows carrying source_payload, the per-player stats blob. 0.23 MB, and it
// measured 4.5 seconds against production. With nine browsers in the room that
// is roughly 108 full catalog reads a minute -- about 25 MB/min out of Postgres
// -- for a table the bot writes once a day at 02:00. Each render took longer
// than the gap between refreshes, so they queued and the board never caught up.
// That was draft night: "it's taking all day to refresh."
//
// Nothing about WHO IS TAKEN lives here. Picks, roster entries and the queue
// are still read fresh on every single render -- those are the rows that change
// during a draft, and a stale one would show a drafted player as available.
// This caches only the catalog itself: names, positions, teams, season stats.
//
// TTL is deliberately short rather than daily. injury_status can move during
// the day, and one minute is the difference between 108 reads a minute and
// about one, which is the whole win. A longer TTL buys almost nothing more.
const TTL_MS = 60_000

const CATALOG_COLUMNS = 'id,name,position,team,injury_status,source_payload,source_player_id'

// Module scope: per server instance, shared across every request that instance
// handles. On Vercel that means a warm lambda serves the room's refreshes from
// memory. A cold instance pays for one fetch, once.
let cached = null   // { at: number, rows: array }
let inFlight = null // dedupes the stampede when several refreshes land at once

export function playerCatalogColumns() {
  return CATALOG_COLUMNS
}

/**
 * Active NFL players for the fantasy side, cached for TTL_MS.
 *
 * Takes the caller's supabase client rather than making its own, so this stays
 * subject to the same RLS as the query it replaced -- the catalog is readable
 * to any signed-in member and this changes nothing about that.
 *
 * On a failed fetch it serves the last good rows if there are any. A draft room
 * showing a slightly old catalog beats a draft room showing an empty board.
 */
export async function loadPlayerCatalog(supabase, { ttlMs = TTL_MS } = {}) {
  const now = Date.now()
  if (cached && now - cached.at < ttlMs) return cached.rows
  if (inFlight) return inFlight

  inFlight = (async () => {
    try {
      const { data, error } = await supabase
        .from('nfl_players')
        .select(CATALOG_COLUMNS)
        .eq('active', true)
      if (error || !Array.isArray(data)) return cached?.rows || []
      cached = { at: Date.now(), rows: data }
      return data
    } catch {
      return cached?.rows || []
    } finally {
      inFlight = null
    }
  })()

  return inFlight
}

/** Test/ops hook: drop the cache so the next read goes to the database. */
export function clearPlayerCatalogCache() {
  cached = null
  inFlight = null
}
