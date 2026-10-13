// GET /api/card/stamps?sport=mlb|nhl|nfl&id=<player id>&day=YYYY-MM-DD[&phase=pre|post]
// The SITUATION STAMPS (lib/cards/situations.js) of one player on one game day: [{ key, label, text, explain }], at most 2, fact-only (a postseason round, a milestone count,
// a streak count, a season-high, a birthday, days since his last game ...), each proven by his real game log (lib/cards/situationData.js). A stamp that cannot be proven is
// not in the list; a failure answers []. Read-only (public league feeds), no database, no polling. phase=pre (default) is the pregame card, post a card about a played game.
import { stampsForCard } from '../../../../lib/cards/situationData'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 20

const json = (body, status = 200, cache = 'no-store') => Response.json(body, { status, headers: { 'Cache-Control': cache } })

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const sport = String(q.get('sport') || '').toLowerCase()
  const id = String(q.get('id') || '')
  const day = String(q.get('day') || '')
  const phase = q.get('phase') === 'post' ? 'post' : 'pre'
  if (!['mlb', 'nhl', 'nfl'].includes(sport) || !/^[A-Za-z0-9_.-]{1,24}$/.test(id) || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: 'BAD REQUEST', detail: 'sport, id and day are needed' }, 400)
  const stamps = await stampsForCard({ sport, playerId: id, day, phase })
  return json({ stamps }, 200, 'public, s-maxage=600, stale-while-revalidate=1800')
}
