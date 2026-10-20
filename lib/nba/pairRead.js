// BUCKETS PAIR HISTORY, THE READER (2026-10-15). Server only. Reads buckets_log's graded POINTS rows (one per player per
// game, `actual` = the points he scored) for the last NBA_PAIR_SEASONS seasons and hands them to the pure reducer
// (lib/nba/pairHistory.js). Preseason is never read. No row, no pair.
import { unstable_cache } from 'next/cache'
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
  // THE BOX SCORES TOO (2026-10-20, "its Pairs page is thin"): every real game in buckets_box (the league's box scores, 2025-26 backfilled,
  // the tick adds each final) counts the same way -- his points, a day he played. A graded buckets_log row wins over the box row for the same
  // game and player. Read at most once a day per window (Supabase egress): a settled box score does not change.
  const box = await boxRows(db, startYear, String(today).slice(0, 10)).catch(() => [])
  const seen = new Set(data.map((r) => `${r.game_id}|${r.player_id}`))
  const rows = [...data, ...box.filter((r) => !seen.has(`${r.game_id}|${r.player_id}`))]
  return buildNbaPairHist(rows)
}

const BOX_SELECT = 'game_id, game_date, player_id, name, team, pts, season_type'
async function readBox(db, startYear) {
  const { data, error } = await readPaged(() => db.from('buckets_box').select(BOX_SELECT).neq('season_type', 1).gte('game_date', `${startYear}-08-01`)
    .order('game_date', { ascending: true }).order('game_id', { ascending: true }).order('player_id', { ascending: true }))
  if (error) throw new Error(error.message || String(error))
  return data.map((r) => ({ game_id: r.game_id, game_date: r.game_date, player_id: r.player_id, name: r.name, team: r.team, actual: r.pts, played: true, season_type: r.season_type }))
}
function boxRows(db, startYear, day) {
  try {
    return unstable_cache(() => readBox(db, startYear), ['nba-pair-box-v1', String(startYear), day], { revalidate: 86400 })()
  } catch (e) {
    if (!/incrementalCache|static generation store|outside a request/i.test(String(e?.message))) throw e
    return readBox(db, startYear)
  }
}
