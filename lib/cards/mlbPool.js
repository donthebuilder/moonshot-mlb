// THE MLB PERCENTILE POOL (server only). A percentile means nothing against tonight's 18-row playoff board, so MLB's bars rank
// against a REAL pool: every distinct hitter in the bot's graded slates over the last POOL_DAYS calendar days
// (current/graded_results_<date>.json, the same files the Results tab reads), each hitter's NEWEST row, with his season-level
// fields (hr_per_pa, season_iso, recent_barrel_rate, recent_hard_hit_rate, season_max_ev). The pool is described on the card
// ("vs 113 hitters on the bot's slates, Sep 27 to Oct 8"): n, first and last day come from the files actually read.
// A pool under MIN_POOL hitters draws no bar at all (lib/cards/model.js pctInPool). Nothing is estimated.
import { dataUrl } from '../dataSource'
import { prettyDay, num, pctInPool } from './model'

export const POOL_DAYS = 21
export const MIN_POOL = 40
export const POOL_KEYS = ['hr_per_pa', 'season_iso', 'recent_barrel_rate', 'recent_hard_hit_rate', 'season_max_ev']

const dayBack = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) - n * 864e5).toISOString().slice(0, 10)

/** Pure: graded-result files (oldest first: [{date, rows}]) -> the pool. Newest row per hitter wins. */
export function buildPool(files) {
  const by = new Map()
  const dates = []
  for (const f of files) {
    const rows = Array.isArray(f?.rows) ? f.rows : []
    if (!rows.length) continue
    dates.push(f.date)
    for (const r of rows) {
      if (r?.player_id == null) continue
      const rec = { id: String(r.player_id) }
      for (const k of POOL_KEYS) rec[k] = num(r[k])
      by.set(rec.id, rec)
    }
  }
  const hitters = [...by.values()]
  return { n: hitters.length, hitters, since: dates[0] || null, until: dates[dates.length - 1] || null, days: dates.length }
}

/** Pure: the percentile (0-100) of `value` for `key` among the pool's OTHER hitters (his own old row is left out); null when the pool is thin. */
export function poolPct(pool, key, value, id) {
  if (!pool || pool.n < MIN_POOL) return null
  return pctInPool(pool.hitters.filter((h) => h.id !== String(id)).map((h) => h[key]), value, { min: MIN_POOL - 1 })
}

/** The pool in words, as the card's stat note prints it. '' for a pool too thin to use. */
export const poolWords = (pool) => (pool && pool.n >= MIN_POOL ? `${pool.n} hitters on the bot's slates, ${prettyDay(pool.since)} to ${prettyDay(pool.until)}` : '')

async function readPool(day, fetcher = fetch) {
  const dates = Array.from({ length: POOL_DAYS }, (_, i) => dayBack(day, POOL_DAYS - i))
  const files = await Promise.all(dates.map(async (date) => {
    try {
      const res = await fetcher(dataUrl(`current/graded_results_${date}.json`), { cache: 'no-store' })
      if (!res.ok) return null
      const j = await res.json()
      return { date, rows: Array.isArray(j?.results) ? j.results : [] }
    } catch { return null }
  }))
  return buildPool(files.filter(Boolean))
}

const _memo = new Map()
/** The pool for a card day, read once per six hours (a small result; the files themselves are not cached). */
export async function loadMlbPool(day, { fetcher } = {}) {
  const hit = _memo.get(day)
  if (hit && Date.now() - hit.at < 6 * 3600e3 && !fetcher) return hit.pool
  const pool = await readPool(day, fetcher)
  if (!fetcher) { if (_memo.size > 6) _memo.clear(); _memo.set(day, { at: Date.now(), pool }) }
  return pool
}
