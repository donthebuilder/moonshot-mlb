// GET /api/nfl/tds?season=2026&week=4[&pre=1] -- one week's touchdowns, each
// scorer in his three states, for the record page (BATCH-RECORD-PAGE).
// The states come from nfl_td_feed through lib/record/nfl.js -> tdCallStatus
// (lib/callStatus.js), the same as /called -- not re-derived here. The week's
// games come from ESPN's week scoreboard (nfl_td_feed's game_id is ESPN's
// event id); QB touchdowns stay out, as on /called (lib/recordWindow inPool).
import { adminClient } from '../../../../lib/nhl/db'
import { readNflEvents } from '../../../../lib/record/nfl'
import { inPool } from '../../../../lib/recordWindow'

export const dynamic = 'force-dynamic'
const RANK = { called: 3, board: 2, off: 1 }

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const season = Number(q.get('season')), week = Number(q.get('week'))
  if (!Number.isInteger(season) || !Number.isInteger(week) || week < 1 || week > 23) return Response.json({ error: 'season and week' }, { status: 400 })
  const db = adminClient()
  if (!db) return Response.json({ available: false }, { status: 503 })
  const type = q.get('pre') === '1' ? 1 : week > 18 ? 3 : 2
  const sb = await fetch(`https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=${type}&week=${type === 3 ? week - 18 : week}`, { next: { revalidate: 3600 } }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const games = (sb?.events || []).map((e) => ({ id: String(e.id), day: String(e.date || '').slice(0, 10) }))
  if (!games.length) return Response.json({ available: true, season, week, scorers: [], note: 'no games found for that week' }, { headers: { 'Cache-Control': 'public, s-maxage=600' } })
  const ids = new Set(games.map((g) => g.id))
  const days = games.map((g) => g.day).sort()
  // UTC kickoff dates can run a day past the ET game day -- one day either side
  const pad = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
  const { events, error } = await readNflEvents(db, { since: pad(days[0], -1), until: pad(days[days.length - 1], 1) })
  if (error) return Response.json({ available: false, why: error.message }, { status: 502 })
  const by = new Map()
  for (const e of events.filter((x) => ids.has(String(x.game_id))).filter(inPool('nfl'))) {
    const k = e.player_id || `${e.team}:${e.name}`
    const cur = by.get(k) || { player_id: e.player_id, name: e.name, team: e.team, opp: e.opp, position: e.payload?.position || null, tds: 0, status: e.status }
    cur.tds += 1
    if (RANK[e.status] > RANK[cur.status]) cur.status = e.status
    by.set(k, cur)
  }
  const scorers = [...by.values()].sort((a, b) => RANK[b.status] - RANK[a.status] || b.tds - a.tds)
  const live = (sb.events || []).some((e) => e?.status?.type?.state !== 'post')
  return Response.json({ available: true, season, week, games: games.length, live, scorers }, { headers: { 'Cache-Control': `public, s-maxage=${live ? 300 : 3600}, stale-while-revalidate=1800` } })
}
