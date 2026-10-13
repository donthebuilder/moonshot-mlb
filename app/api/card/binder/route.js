// GET /api/card/binder?follows=nhl:8478402,mlb:660271,nfl:00-0033873     (MY CARDS: the binder of the players on a person's watchlist)
// The special cards (lib/cards/moments.js) EARNED by those players, from REAL STORED HISTORY only (lib/cards/specialData.js earnedFor: the same read the player-page shelf uses,
// one call per player), merged, RAREST FIRST then newest. At most 40 players per call; an id that is not one of ours is dropped; a sport with no moments gives none.
// Read-only selects (no db writes, no new tables, no polling): the page asks once per visit, the CDN keeps the answer for five minutes. The pictures are /api/card/special.
import { adminClient } from '../../../../lib/supabase/admin'
import { earnedFor } from '../../../../lib/cards/specialData'
import { mergeCards, rarestFirst } from '../../../../lib/cards/binder'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const json = (body, status = 200, cache = 'no-store') => Response.json(body, { status, headers: { 'Cache-Control': cache } })
const MAX_PLAYERS = 40
const SPORTS = new Set(['mlb', 'nfl', 'nhl'])

export async function GET(request) {
  const raw = String(new URL(request.url).searchParams.get('follows') || '')
  const want = []
  const seen = new Set()
  for (const part of raw.split(',')) {
    const [sport, id] = part.split(':')
    if (!SPORTS.has(sport) || !/^[A-Za-z0-9_.-]{1,24}$/.test(id || '') || seen.has(`${sport}:${id}`)) continue
    seen.add(`${sport}:${id}`); want.push({ sport, id })
    if (want.length >= MAX_PLAYERS) break
  }
  if (!want.length) return json({ total: 0, cards: [] })
  let db = null
  try { db = adminClient({ anon: true }) } catch { db = null }
  if (!db) return json({ total: 0, cards: [] })
  const lists = []
  let next = 0
  const worker = async () => {
    while (next < want.length) {
      const w = want[next++]
      try { lists.push((await earnedFor({ sport: w.sport, id: w.id, db, limit: 60 })).cards) } catch (e) { console.error(`[cards] binder ${w.sport}/${w.id}: ${e?.message || e}`) }
    }
  }
  await Promise.all(Array.from({ length: 4 }, worker))
  const cards = mergeCards(...lists).sort(rarestFirst)
  return json({ total: cards.length, cards }, 200, 'public, s-maxage=300, stale-while-revalidate=600')
}
