// HOT HANDS, ONE COMPUTATION (2026-10-03): the rotation players in a day's
// games, last 5 / last 10 beside the season from each player's ESPN game log.
// Read by /api/buckets/hot and by BUCKETS' story engine (lib/stories/nba.js),
// cached 15 min per day so the two share one set of log reads. Server only.
import { unstable_cache } from 'next/cache'
import { readNbaBoard } from './boardRead'
import { gamelogFor, reduceGamelog } from './api'
import { nbaSeason, seasonLabel } from './season'

const STATS = ['pts', 'reb', 'ast', 'tpm', 'min']
const avg = (gs, k) => { const v = gs.map((g) => g[k]).filter((x) => typeof x === 'number'); return v.length ? Math.round((10 * v.reduce((a, b) => a + b, 0)) / v.length) / 10 : null }
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null) } }))
  return out
}

async function compute(date) {
  const [sn, board] = await Promise.all([nbaSeason(), readNbaBoard(date, 'pts')])
  const pick = (board.rows || []).filter((r) => (r.legs?.minPg || 0) >= 15).sort((a, b) => (b.legs?.minPg || 0) - (a.legs?.minPg || 0))
  const counted = new Map(); const players = []
  for (const r of pick) { const n = counted.get(r.team) || 0; if (n < 12) { counted.set(r.team, n + 1); players.push(r) } }
  let stale = false
  const rows = (await pool(players, 6, async (r) => {
    let log = reduceGamelog(await gamelogFor(r.playerId, sn.cur)).filter((g) => g.seasonType === 2 || g.seasonType === 3)
    let season = sn.cur
    if (!log.length) { log = reduceGamelog(await gamelogFor(r.playerId, sn.prev)).filter((g) => g.seasonType === 2 || g.seasonType === 3); season = sn.prev }
    if (!log.length) return null
    if (season !== sn.cur) stale = true
    const l5 = log.slice(0, 5), l10 = log.slice(0, 10)
    let run25 = 0
    for (const g of log) { if ((g.pts ?? 0) >= 25) run25++; else break }
    return {
      playerId: r.playerId, name: r.name, team: r.team, opp: r.opp, home: r.home, gameId: r.gameId, pos: r.pos, status: r.status,
      gp: log.length, season, run25, ...Object.fromEntries(STATS.map((k) => [k, { l5: avg(l5, k), l10: avg(l10, k), szn: avg(log, k) }])),
      spark: l10.map((g) => g.pts).reverse(),
    }
  })).filter(Boolean)
  return { date, season: stale ? sn.prev : sn.cur, seasonLabel: seasonLabel(stale ? sn.prev : sn.cur), stale, games: board.games || [], rows }
}

/** { date, season, seasonLabel, stale, games, rows } for a day's rotation players. */
export function hotRows(date) {
  return unstable_cache(() => compute(date), ['nba-hot-v1', date], { revalidate: 900 })()
    .catch((e) => (/incrementalCache|static generation store|outside a request/i.test(String(e?.message)) ? compute(date) : Promise.reject(e)))
}
