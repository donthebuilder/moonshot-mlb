// BUCKETS' model record, read in the shared shape (lib/record/shape.js) -- the
// shape of lib/record/nhl.js. The one reader of buckets_log for the PUBLIC
// record: /called and /start come through here (the in-app record route
// counts its own nights). The event /called lists is a 25-POINT GAME -- the
// points market's bar, the market every night grades -- tagged with the
// status locked before tip. A scorer is CALLED when he was a called pick for
// ANY BUCKETS market in that game (the 0c rule, LAMP's markAnyMarketCalls).
import { NBA_MARKETS } from '../nba/model'
import { readPaged } from './paged'

const SELECT = 'game_id, game_date, season_type, player_id, model_version, market, team, opp, name, pos, score, rank_in_game, status, role, played, actual, hit, void_reason, locked_at, graded_at'
const VERSIONS = Object.values(NBA_MARKETS).map((d) => d.version)
export const NBA_EVENT_BAR = NBA_MARKETS.pts.bar   // 25

/** played + hit into one word, as the tick grades them. Not playing is void, not a miss. */
export function resultOf(r) {
  if (!r.graded_at) return null
  if (r.played === false || r.void_reason || r.hit == null) return 'void'
  return r.hit ? 'hit' : 'miss'
}
export function toRecord(r) {
  return {
    sport: 'nba', model_id: 'buckets', model_version: r.model_version, target: r.market,
    game_id: r.game_id, game_date: r.game_date, game_type: r.season_type ?? null,
    player_id: r.player_id, name: r.name, team: r.team, opp: r.opp, pos: r.pos ?? null,
    score: r.score ?? null, rank: r.rank_in_game ?? null, status: r.status, role: r.role ?? null,
    locked_at: r.locked_at, result: resultOf(r), graded_at: r.graded_at ?? null,
    played: r.played ?? null, actual: r.actual == null ? null : Number(r.actual), hit: r.hit ?? null,
  }
}

/**
 * The points market's rows (or `market`), newest night first.
 * hitOnly: only 25-point games (all /called's capture needs); status: only that status.
 * @returns {{ rows, error }}
 */
export async function readNbaRecords(db, { since = null, until = null, includePre = false, graded = true, hitOnly = false, status = null, market = 'pts' } = {}) {
  const { data, error } = await readPaged(() => {
    let q = db.from('buckets_log').select(SELECT).in('model_version', VERSIONS).eq('market', market)
    if (since) q = q.gte('game_date', since)
    if (until) q = q.lte('game_date', until)
    if (graded) q = q.not('graded_at', 'is', null)
    if (!includePre) q = q.neq('season_type', 1)
    if (hitOnly) q = q.eq('hit', true)
    if (status) q = q.eq('status', status)
    return q.order('game_date', { ascending: false }).order('game_id', { ascending: true }).order('player_id', { ascending: true })
  })
  if (error) return { rows: [], error }
  const rows = data.map(toRecord)
  if (hitOnly && rows.length) await markAnyMarketCalls(db, rows)
  return { rows, error: null }
}

/** One player's 25-point games this season (regular season and playoffs), newest first, tagged as /called tags them. */
export async function readNbaPlayerRows(db, playerId, since) {
  const { data, error } = await db.from('buckets_log').select(SELECT).in('model_version', VERSIONS).eq('market', 'pts').eq('player_id', String(playerId))
    .eq('hit', true).not('graded_at', 'is', null).neq('season_type', 1).gte('game_date', since).order('game_date', { ascending: false }).limit(80)
  if (error) throw new Error(error.message)
  const rows = data.map(toRecord)
  await markAnyMarketCalls(db, rows)
  return rows
}

// a scorer called in another BUCKETS market in that game is CALLED (0c)
async function markAnyMarketCalls(db, rows) {
  const ids = [...new Set(rows.filter((r) => r.status !== 'called').map((r) => r.game_id))]
  if (!ids.length) return
  const called = new Map()
  for (let i = 0; i < ids.length; i += 200) {
    const { data, error } = await db.from('buckets_log').select('game_id, player_id, market')
      .in('game_id', ids.slice(i, i + 200)).in('model_version', VERSIONS).eq('status', 'called')
    if (error) return
    for (const d of data || []) called.set(`${d.game_id}|${d.player_id}`, d.market)
  }
  for (const r of rows) {
    const m = r.status !== 'called' ? called.get(`${r.game_id}|${r.player_id}`) : null
    if (m) { r.status = 'called'; r.called_by = m }
  }
}

/** /called's capture shape (the keys nhlCaptureFrom returns) from 25-point games. */
export function nbaCaptureFrom(records) {
  const scorers = records.filter((r) => r.hit === true)
  const called = scorers.filter((r) => r.status === 'called').length
  const rated = scorers.filter((r) => r.status === 'board').length
  const total = scorers.length
  const onBoard = called + rated
  return {
    total, called, rated, off: total - onBoard, byRole: {},
    pct: total ? Math.round((100 * called) / total) : null,
    onBoard, boardPct: total ? Math.round((100 * onBoard) / total) : null,
  }
}
