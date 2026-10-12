// GET /api/postseason/player?id=<MLB player id>[&season=YYYY][&group=hitting|pitching]
// JSON summary of one player's postseason (MLB StatsAPI gameType=P, lib/cards/postseasonData.js): does he have postseason games, in which rounds, and
// his line. The flip sheet asks this once when it opens, to decide whether to offer the Postseason edition. Public stats only, read-only, no pictures
// drawn, nothing written. 404 JSON when he has no postseason game (never an empty line); 400 for a bad id; 502 when MLB does not answer.
import { loadPostseasonPlayer } from '../../../../lib/cards/postseasonData'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

const json = (body, status, cache = 'no-store') => Response.json(body, { status, headers: { 'Cache-Control': cache } })

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const season = q.get('season')
  const group = q.get('group')
  if (season && !/^\d{4}$/.test(season)) return json({ error: 'BAD REQUEST', detail: 'season is YYYY' }, 400)
  if (group && !/^(hitting|pitching)$/.test(group)) return json({ error: 'BAD REQUEST', detail: 'group is hitting or pitching' }, 400)
  const r = await loadPostseasonPlayer({ id: q.get('id'), season: season || null, group: group || null, withPictures: false })
  if (!r.ok) return json({ error: r.status === 404 ? 'NOT FOUND' : r.status === 400 ? 'BAD REQUEST' : 'DELAYED', detail: r.why }, r.status || 502, r.status === 404 ? 'public, max-age=60' : 'no-store')
  const m = r.model
  return json({ ok: true, id: m.id, name: m.name, team: m.team, group: m.group, season: m.season, games: m.games, round: m.roundTag, rounds: m.roundsPlayed, total: m.total, last: m.last && { date: m.last.date, opp: m.last.opp, summary: m.last.summary } }, 200, 'public, s-maxage=120, stale-while-revalidate=300')
}
