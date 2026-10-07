// GET /api/nfl/longest?season=2026 -- the season's longest touchdowns, from
// nfl_td_feed.yards (one row per TD, written by the NFL tick when the scoring
// play is first seen; yards is parsed from ESPN's play text, so a TD whose text
// has no yardage -- a fumble recovery in the end zone -- has none and is left
// out rather than counted as 0). Read-only, season-bounded, cached: the board
// behind TUDDY's Explosive > Longest TDs lens. No new table, no new writer.
import { adminClient } from '../../../../lib/supabase/admin'
import { readNflEvents } from '../../../../lib/record/nfl'

export const dynamic = 'force-dynamic'
const KEEP = 120

export async function GET(request) {
  const season = Number(new URL(request.url).searchParams.get('season'))
  if (!Number.isInteger(season) || season < 2020 || season > 2100) return Response.json({ error: 'season' }, { status: 400 })
  const db = adminClient()
  if (!db) return Response.json({ available: false }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  // the regular season and playoffs run August to February
  const { events, error } = await readNflEvents(db, { since: `${season}-08-01`, until: `${season + 1}-03-01` })
  if (error) return Response.json({ available: false, why: error.message }, { status: 502, headers: { 'Cache-Control': 'no-store' } })
  const rows = events
    .map((e) => e.payload)
    .filter((r) => Number.isFinite(Number(r.yards)) && Number(r.yards) > 0 && r.scorer_name)
    .map((r) => ({
      day: r.day, game_id: r.game_id, td_n: r.td_n, team: r.team, opp: r.opponent, quarter: r.quarter,
      name: r.scorer_name, player_id: r.gsis_id || null, position: r.position || null,
      kind: r.kind || null, kind_word: r.kind_word || null, yards: Number(r.yards), passer: r.passer_name || null,
    }))
    .sort((a, b) => b.yards - a.yards || (a.day < b.day ? -1 : 1))
  return Response.json(
    { available: true, season, total: rows.length, rows: rows.slice(0, KEEP) },
    { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=1800' } },
  )
}
