// BUCKETS PAIR HISTORY, THE READER (2026-10-15). Server only. Reads buckets_log's graded POINTS rows (one per player per
// game, `actual` = the points he scored) for the last NBA_PAIR_SEASONS seasons and hands them to the pure reducer
// (lib/nba/pairHistory.js). Preseason is never read. No row, no pair.
import { readPaged } from '../record/paged'
import { LIVE_VERSIONS } from './model'
import { buildNbaPairHist, NBA_PAIR_SEASONS } from './pairHistory'

const SELECT = 'game_id, game_date, player_id, name, team, actual, played, season_type'

export async function readNbaPairHist(db, today) {
  const y = Number(String(today).slice(0, 4)), m = Number(String(today).slice(5, 7))
  const startYear = (m >= 8 ? y : y - 1) - (NBA_PAIR_SEASONS - 1)
  const { data, error } = await readPaged(() => db.from('buckets_log').select(SELECT)
    .in('model_version', LIVE_VERSIONS).eq('market', 'pts').not('graded_at', 'is', null).neq('season_type', 1).gte('game_date', `${startYear}-08-01`)
    .order('game_date', { ascending: true }).order('game_id', { ascending: true }).order('player_id', { ascending: true }).order('model_version', { ascending: true }))
  if (error) throw new Error(error.message || String(error))
  return buildNbaPairHist(data)
}
