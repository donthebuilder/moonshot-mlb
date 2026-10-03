// GET /api/buckets/hot?date=YYYY-MM-DD -- HOT HANDS (LAMP's Hot sticks, the NBA
// way): for the rotation players in that day's games (the points board's rows
// with 15+ minutes a game, up to 12 a club), the last 5 and last 10 games of
// points / rebounds / assists / threes / minutes beside the season's, from
// each player's own ESPN game log (cached 15 min; ESPN, not Supabase, so no
// egress). Regular season and playoffs only -- preseason form is camp
// minutes; until this season has games the logs are last season's, said so. Gated.
import { readNbaBoard } from '../../../../lib/nba/boardRead'
import { gamelogFor, reduceGamelog } from '../../../../lib/nba/api'
import { nbaSeason, seasonLabel } from '../../../../lib/nba/season'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { easternToday } from '../../../../lib/data'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const STATS = ['pts', 'reb', 'ast', 'tpm', 'min']
const avg = (gs, k) => { const v = gs.map((g) => g[k]).filter((x) => typeof x === 'number'); return v.length ? Math.round((10 * v.reduce((a, b) => a + b, 0)) / v.length) / 10 : null }
async function pool(items, n, fn) {
  const out = new Array(items.length); let i = 0
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; out[k] = await fn(items[k]).catch(() => null) } }))
  return out
}

export const GET = bucketsRoute('hot', async (q) => {
  const date = q.get('date') || easternToday()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('date must be YYYY-MM-DD')
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
    const line = (k) => ({ l5: avg(l5, k), l10: avg(l10, k), szn: avg(log, k) })
    return {
      playerId: r.playerId, name: r.name, team: r.team, opp: r.opp, home: r.home, gameId: r.gameId, pos: r.pos, status: r.status,
      gp: log.length, season, ...Object.fromEntries(STATS.map((k) => [k, line(k)])),
      spark: l10.map((g) => g.pts).reverse(),   // oldest -> newest
    }
  })).filter(Boolean)
  return ok({ date, season: stale ? sn.prev : sn.cur, seasonLabel: seasonLabel(stale ? sn.prev : sn.cur), stale, games: board.games || [], rows, fetchedAt: new Date().toISOString() }, 900)
})
