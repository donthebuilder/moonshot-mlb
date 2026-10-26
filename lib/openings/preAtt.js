// THE RE-FILL FOR THE LATE OPENING COLUMNS (2026-10-26). Columns that arrived after the openings were first written -- shots to the
// first score (supabase/migrations/202610261100), what the first attempt and score were, and MLB's counts to the first hit and
// homer (202610261200) -- stay null on games already on file, because the backfills skip a game that is on file. So each sport's
// backfill has a --fill-pre-att mode: list the games that have a first score but are missing one (this file), re-read each game
// once with the sport's own parser, and write ONLY these columns. Nothing else on the row is touched. Shared by NBA, NHL, MLB and
// NFL. A game whose type the feed never states is re-read on each run, and left null.

export const LATE_COLS = ['pre_first_att_home', 'pre_first_att_away', 'first_att_type', 'first_score_type',
  'pre_first_hit_home', 'pre_first_hit_away', 'pre_first_hr_home', 'pre_first_hr_away']

/** The finished games on file with a first score but a late column still empty: [{ game_id, game_date, season, season_type, home, away }]. */
export async function unfilledGames(db, sport, season = null) {
  const out = []
  for (let from = 0; ; from += 1000) {
    let q = db.from('opening_games').select('game_id, game_date, season, season_type, home, away').eq('sport', sport)
      .not('first_score_team', 'is', null).or('pre_first_att_home.is.null,first_score_type.is.null').order('game_id').range(from, from + 999)
    if (season) q = q.eq('season', season)
    const { data, error } = await q
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

/** Write one game's late columns from a parsed opening_games row. Returns an error message, 'no first score' or null. */
export async function writePreAtt(db, sport, gameId, row) {
  if (row?.pre_first_att_home == null || row?.pre_first_att_away == null) return 'no first score'
  const patch = {}
  for (const c of LATE_COLS) if (row[c] !== undefined) patch[c] = row[c]
  const w = await db.from('opening_games').update(patch).eq('sport', sport).eq('game_id', String(gameId))
  return w.error ? w.error.message : null
}
