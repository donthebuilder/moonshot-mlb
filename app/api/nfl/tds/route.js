// GET /api/nfl/tds?season=2026&week=4[&pre=1] -- one week's touchdowns, each
// scorer in his three states, for the record page (BATCH-RECORD-PAGE).
// The states come from nfl_td_feed through lib/record/nfl.js -> tdCallStatus
// (lib/callStatus.js), the same as /called -- not re-derived here. The week's
// games come from ESPN's week scoreboard (nfl_td_feed's game_id is ESPN's
// event id); QB touchdowns stay out, as on /called (lib/recordWindow inPool).
import { adminClient } from '../../../../lib/supabase/admin'
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
  // ESPN files the playoffs under seasontype 3 with its own numbering: 19-21 are its weeks 1-3, the Super Bowl (22) is its week 5 (week 4 is the Pro Bowl). Same map as the bot's nfl_espn.POST_WEEKS.
  const espnWeek = type === 3 ? (week === 22 ? 5 : week - 18) : week
  // site.web.api.espn.com, not site.api.espn.com: the latter 403s from Vercel's egress (lib/nfl/liveSlate.js documents it)
  const sb = await fetch(`https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${season}&seasontype=${type}&week=${espnWeek}`, { next: { revalidate: 3600 } }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  // A FAILED FETCH IS NOT "NO GAMES": say so, and do not let the CDN keep it for ten minutes.
  if (!sb) return Response.json({ available: false, season, week, scorers: [], note: 'schedule unavailable -- try again' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
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
    const cur = by.get(k) || { player_id: e.player_id, name: e.name, team: e.team, opp: e.opp, position: e.payload?.position || null, tds: 0, status: e.status, byStatus: { called: 0, board: 0, off: 0 } }
    cur.tds += 1
    // each touchdown keeps the status frozen at ITS moment (/called counts per touchdown: a man
    // CALLED on his first and ON THE BOARD on his second is one of each -- counting the best
    // status for both made the record 21 called to /called's 20 for week 4). `status` is his best, for the chip.
    cur.byStatus[e.status] += 1
    if (RANK[e.status] > RANK[cur.status]) cur.status = e.status
    by.set(k, cur)
  }
  const scorers = [...by.values()].sort((a, b) => RANK[b.status] - RANK[a.status] || b.tds - a.tds)
  const live = (sb.events || []).some((e) => e?.status?.type?.state !== 'post')
  return Response.json({ available: true, season, week, games: games.length, live, scorers }, { headers: { 'Cache-Control': `public, s-maxage=${live ? 300 : 3600}, stale-while-revalidate=1800` } })
}
