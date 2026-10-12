// The graded-nights count per market, read once (server only). Feeds the routes that print a BUCKETS record-ish number but do
// not read the whole record themselves (the Ledger's per-night capture). Fails CLOSED: a read that errors says every market is
// tracking. Cached 5 minutes in the instance; it is a count of locked, graded, CALLED regular-season rows (lib/record/nbaFloor.js).
import { readPaged } from './paged'
import { LIVE_VERSIONS } from '../nba/model'
import { floorByMarket, isTracking } from './nbaFloor'

const TTL = 5 * 60e3
let memo = { at: 0, floor: null }
export const _resetNbaFloor = () => { memo = { at: 0, floor: null } }

/** { [market]: { n, nights, tracking } } or null when it could not be read. Call `trackingOf(floor, market)` to ask. */
export async function readNbaFloor(db, { now = Date.now() } = {}) {
  if (memo.floor && now - memo.at < TTL) return memo.floor
  if (!db) return null
  const { data, error } = await readPaged(() => db.from('buckets_log').select('game_date, market, game_id, player_id')
    .in('model_version', LIVE_VERSIONS).eq('status', 'called').not('hit', 'is', null).neq('season_type', 1)
    .order('game_date').order('game_id').order('player_id').order('market'))
  if (error) return null
  const floor = floorByMarket(data.map((r) => ({ market: r.market, date: r.game_date })))
  memo = { at: now, floor }
  return floor
}

/** Is this market under the floor? A market with no graded night, or an unreadable count, is tracking. */
export const trackingOf = (floor, market) => !floor || !floor[market] || isTracking(floor[market].nights)
