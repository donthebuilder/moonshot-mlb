// GET /api/lamp/trending[?min=15|18|20] -- LAMP's Trending rows (components/TrendingBoard.js, lib/hitRater.js): every skater with a
// book line on file tonight (anytime goal, points, assists, shots on goal), how often he went OVER it in his last 5 / 10 / 20 games
// and since last season, at tonight's venue side and against tonight's club, from lamp_box (supabase/migrations/202610252200_lamp_box.sql)
// -- and how often the skaters at his spot (forwards or defensemen, 15+ minutes) went over it against tonight's defense, from that
// club's last ~30 games (300 rows a club, so the read stays small: egress). ?min= counts only games of that much ice time.
// No lamp_box yet = an empty answer that says so. The CDN holds the answer 15 minutes. No probability, no implied %.
import { adminClient } from '../../../../lib/supabase/admin'
import { hitRaterRow, gameKeep } from '../../../../lib/hitRater'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// the odds feed's market for each lane, the box column it counts, and the word
const LANES = [
  { key: 'g', word: 'GOAL', odds: 'player_anytime_goal', col: 'goals' },
  { key: 'pts', word: 'PTS', odds: 'player_points', col: 'points' },
  { key: 'a', word: 'AST', odds: 'player_assists', col: 'assists' },
  { key: 'sog', word: 'SOG', odds: 'player_shots_on_goal', col: 'sog' },
]
const MIN_STEPS = new Set([15, 18, 20])
const groupOf = (pos) => (pos === 'D' ? 'D' : pos === 'G' ? 'G' : pos ? 'F' : null)
const json = (body, maxAge) => Response.json(body, { headers: { 'Cache-Control': `public, s-maxage=${maxAge}, stale-while-revalidate=${maxAge * 2}` } })

async function all(q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const r = await q().range(from, from + 999)
    if (r.error) throw new Error(r.error.message)
    out.push(...r.data)
    if (r.data.length < 1000) return out
  }
}

export async function GET(request) {
  const url = new URL(request.url)
  const db = adminClient()
  if (!db) return Response.json({ error: 'no database' }, { status: 503 })
  const getJSON = (u) => fetch(`${url.origin}${u}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const minMin = MIN_STEPS.has(Number(url.searchParams.get('min'))) ? Number(url.searchParams.get('min')) : null
  const keep = gameKeep({ minMin })
  const [odds, board] = await Promise.all([getJSON('/api/odds/latest?sport=nhl'), getJSON('/api/lamp/board')])
  const lined = odds?.by_player_id || {}
  const ids = Object.keys(lined)
  if (!ids.length) return json({ date: board?.date || null, rows: [], why: odds?.reason || 'no book lines on file yet' }, 30)
  const tonight = new Map()
  for (const g of board?.games || []) for (const r of g.rows || []) tonight.set(String(r.playerId), { ...r, gameId: g.game?.id, season: g.game?.season })
  const cur = Number([...tonight.values()][0]?.season) || null
  if (!cur) return json({ date: board?.date || null, rows: [], why: 'no games on tonight’s board' }, 60)
  const seasons = [cur - 10001, cur]
  let box
  try {
    box = await all(() => db.from('lamp_box').select('player_id, name, pos, game_date, team, opp, home, toi_s, goals, assists, points, sog')
      .in('player_id', ids).in('season', seasons).eq('game_type', 2).order('game_date', { ascending: false }))
  } catch (e) {
    return json({ date: board?.date || null, rows: [], why: /lamp_box/.test(String(e?.message)) ? 'LAMP’s box scores are not on file yet' : 'the box scores are delayed' }, 60)
  }
  const withMin = (r) => ({ ...r, min: r.toi_s != null ? r.toi_s / 60 : null })
  const logs = new Map()
  for (const r of box) { const k = String(r.player_id); if (!logs.has(k)) logs.set(k, []); logs.get(k).push(withMin(r)) }
  // THE DEFENSE: each of tonight's opponents' last ~30 games of skaters with 15+ minutes (300 rows a club), by spot (F / D)
  const opps = [...new Set([...tonight.values()].map((r) => r.opp).filter(Boolean))]
  const vsD = new Map()
  await Promise.all(opps.map(async (opp) => {
    const r = await db.from('lamp_box').select('opp, pos, game_date, toi_s, goals, assists, points, sog').eq('opp', opp).in('season', seasons)
      .eq('game_type', 2).neq('pos', 'G').gte('toi_s', 900).order('game_date', { ascending: false }).limit(300)
    for (const x of r.data || []) { const row = withMin(x); if (keep && !keep(row)) continue; const k = `${opp}|${groupOf(x.pos)}`; if (!vsD.has(k)) vsD.set(k, []); vsD.get(k).push(row) }
  }))
  const rows = []
  for (const id of ids) {
    const games = logs.get(id) || []
    if (!games.length) continue
    const t = tonight.get(id)
    const pos = groupOf(t?.pos || games[0]?.pos)
    if (pos === 'G') continue
    const p = { sport: 'nhl', id, name: t?.name || games[0]?.name || id, team: t?.team || games[0].team, pos }
    const next = t ? { opp: t.opp, home: t.home } : null
    const dRows = t?.opp && pos ? vsD.get(`${t.opp}|${pos}`) || null : null
    for (const lane of LANES) {
      const quote = lined[id]?.[lane.odds]
      const line = Number(quote?.line ?? (lane.key === 'g' ? 0.5 : NaN))
      if (!Number.isFinite(line) || !quote) continue
      const best = Number(quote.best_over ?? quote.over)
      const stat = (g) => g[lane.col]
      const row = hitRaterRow({ p, lane: { key: lane.key, word: lane.word, stat }, line, odds: Number.isFinite(best) ? best : null, games, next, keep, dvp: dRows ? dRows.map(stat) : null })
      rows.push({ ...row, gameId: t?.gameId || null })
    }
  }
  return json({ date: board?.date || null, since: seasons[0], minMin, rows }, rows.length ? 900 : 60)
}
