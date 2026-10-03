// GET /api/buckets/game?id=9-digit -- one game: header, box score, shots, first basket, gated.
import { summaryFor, reduceBox, reduceShots, firstBaskets, GAME_ID_RE } from '../../../../lib/nba/api'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'

export const dynamic = 'force-dynamic'
const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null }
export const GET = bucketsRoute('game', async (q) => {
  const id = q.get('id') || ''
  if (!GAME_ID_RE.test(id)) return bad('id must be the 9-digit ESPN game id')
  const s = await summaryFor(id)
  const comp = s?.header?.competitions?.[0] || {}
  const side = (h) => { const c = (comp.competitors || []).find((x) => x.homeAway === h) || {}; return { id: String(c.team?.id || ''), abbrev: c.team?.abbreviation || '', name: c.team?.shortDisplayName || c.team?.displayName || '', score: num(c.score), linescores: (c.linescores || []).map((l) => num(l.displayValue ?? l.value)), winner: c.winner === true } }
  const st = comp.status?.type || {}
  const final = st.completed === true
  return ok({
    id, date: comp.date || null, state: final ? 'final' : st.state === 'in' ? 'live' : 'pre', detail: st.shortDetail || st.detail || '',
    away: side('away'), home: side('home'), venue: s?.gameInfo?.venue?.fullName || null,
    box: reduceBox(s), shots: reduceShots(s, id), firsts: firstBaskets(s),
    fetchedAt: new Date().toISOString(),
  }, final ? 600 : 15)
})
