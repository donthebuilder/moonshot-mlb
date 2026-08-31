// PUSHING THE FEED IN PIECES.
//
// sync_nfl_player_catalog and sync_nfl_week_feed both guard their payload with
// a hard `raise exception` -- catalog > 2000, games > 400, players > 3000.
// The guard is right to exist; failing the WHOLE call is what is wrong with
// it. One oversized payload does not drop the surplus, it drops everything:
// no games, no stats, no lock, no scores, and the only symptom anybody sees is
// that numbers quietly stop moving.
//
// Today's feed is 515 players, 15 games and about 547 catalog rows -- roughly
// four to six times under every cap, so this has never fired. It is one busy
// slate or one bot change away from firing, and the failure is silent, which
// is the combination worth removing before it happens rather than after.
//
// Chunking removes it. Both functions are pure upserts keyed on
// (source, source_player_id, season) and (player_id, season, week), so calling
// them five times with a fifth of the rows lands exactly what calling them
// once with all of them would. The cap then goes back to being what a cap is
// for: rejecting a payload that is malformed, not one that is merely big.
//
// GAMES GO FIRST, ALL OF THEM, BEFORE ANY PLAYER CHUNK. nfl_player_week_stats
// carries a foreign key to nfl_week_games(game_id). A player chunk that landed
// before its game row existed would fail on that key, so the two are not
// interleaved -- games are pushed to completion, then players.

// Comfortably inside every cap, and small enough that a chunk is a cheap retry.
const GAME_CHUNK = 150
const PLAYER_CHUNK = 500
const CATALOG_CHUNK = 700

const chunk = (rows, size) => {
  const out = []
  for (let i = 0; i < (rows?.length || 0); i += size) out.push(rows.slice(i, i + size))
  return out
}

/** Push the player catalog in pieces. Returns the total rows accepted. */
export async function syncCatalogChunked(supabase, catalog) {
  let total = 0
  for (const part of chunk(catalog || [], CATALOG_CHUNK)) {
    const { data, error } = await supabase.rpc('sync_nfl_player_catalog', { p_catalog: part })
    if (error) throw error
    total += Number(data || 0)
  }
  return total
}

/**
 * Push the week feed in pieces: every game first, then the players.
 *
 * Returns the same { games, players } shape a single call returns, summed, so
 * callers do not have to know this happened.
 */
export async function syncWeekFeedChunked(supabase, games, players) {
  const totals = { games: 0, players: 0 }

  const gameParts = chunk(games || [], GAME_CHUNK)
  for (const part of gameParts) {
    const { data, error } = await supabase.rpc('sync_nfl_week_feed', { p_games: part, p_players: [] })
    if (error) throw error
    totals.games += Number(data?.games || 0)
    totals.players += Number(data?.players || 0)
  }

  const playerParts = chunk(players || [], PLAYER_CHUNK)
  for (const part of playerParts) {
    const { data, error } = await supabase.rpc('sync_nfl_week_feed', { p_games: [], p_players: part })
    if (error) throw error
    totals.games += Number(data?.games || 0)
    totals.players += Number(data?.players || 0)
  }

  // An empty feed still has to reach the function once: it is what applies the
  // lineup lock for games that have kicked off since the last run, and that is
  // true on a slate with nothing new to report.
  if (!gameParts.length && !playerParts.length) {
    const { error } = await supabase.rpc('sync_nfl_week_feed', { p_games: [], p_players: [] })
    if (error) throw error
  }
  return totals
}
