// THE RE-FILL FOR "SHOTS TO THE FIRST SCORE" (2026-10-26). opening_games.pre_first_att_home / _away arrived after the openings were
// first written (supabase/migrations/202610261100_opening_pre_first_att.sql), and the backfills skip a game already on file, so
// each sport's backfill has a --fill-pre-att mode: list the games that have a first score but no count (this file), re-read each
// game once with the sport's own parser, and write ONLY these two columns. Nothing else on the row is touched. Shared by NBA,
// NHL and MLB; a game whose feed still names no first score is left null.

/** The finished games on file with a first score but no count yet: [{ game_id, game_date, season, season_type, home, away }]. */
export async function unfilledGames(db, sport, season = null) {
  const out = []
  for (let from = 0; ; from += 1000) {
    let q = db.from('opening_games').select('game_id, game_date, season, season_type, home, away').eq('sport', sport)
      .is('pre_first_att_home', null).not('first_score_team', 'is', null).order('game_id').range(from, from + 999)
    if (season) q = q.eq('season', season)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

/** Write one game's two counts from a parsed opening_games row. Returns an error message, 'no first score' or null. */
export async function writePreAtt(db, sport, gameId, row) {
  if (row?.pre_first_att_home == null || row?.pre_first_att_away == null) return 'no first score'
  const w = await db.from('opening_games').update({ pre_first_att_home: row.pre_first_att_home, pre_first_att_away: row.pre_first_att_away })
    .eq('sport', sport).eq('game_id', String(gameId))
  return w.error ? w.error.message : null
}
