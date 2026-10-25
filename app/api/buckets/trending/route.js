// GET /api/buckets/trending -- BUCKETS' Hit Rater rows for tonight (lib/hitRater.js): every player with a book line on file
// (the odds feed, /api/odds/latest?sport=nba), every lane he has a line in (PTS / REB / AST / 3PM / PRA), and how often he went
// OVER that line in his last 5 / 10 / 20 games and since last season, at tonight's venue side, and against tonight's club.
// Games come from buckets_box (this season and last, regular season) for THOSE players only and only the columns the counts
// need; the CDN holds the answer 15 minutes so a page view is not a Supabase read (egress). A hit rate is a count of games,
// never a chance: no probability and no implied % is sent. Gated like every BUCKETS route.
import { adminClient } from '../../../../lib/supabase/admin'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { nbaSeason } from '../../../../lib/nba/season'
import { propLanesOf } from '../../../../lib/propLanes'
import { NBA_ODDS_KEY } from '../../../../lib/nba/oddsQuote'
import { hitRaterRow } from '../../../../lib/hitRater'

export const dynamic = 'force-dynamic'
export const maxDuration = 60
const LANES = propLanesOf('nba').filter((l) => NBA_ODDS_KEY[l.key])

async function all(q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const r = await q().range(from, from + 999)
    if (r.error) throw new Error(r.error.message)
    out.push(...r.data)
    if (r.data.length < 1000) return out
  }
}

export const GET = bucketsRoute('trending', async (q, request) => {
  const db = adminClient()
  if (!db) return bad('no database')
  const origin = new URL(request.url).origin
  const getJSON = (u) => fetch(`${origin}${u}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  const [odds, board, sn] = await Promise.all([getJSON('/api/odds/latest?sport=nba'), getJSON('/api/buckets/board'), nbaSeason()])
  const lined = odds?.by_player_id || {}
  const ids = Object.keys(lined)
  if (!ids.length) return ok({ date: board?.date || null, rows: [], why: odds?.reason || 'no book lines on file yet' }, 30)   // an empty read (lines not posted, or the odds read cold) is retried soon, never held
  const tonight = new Map((board?.rows || []).map((r) => [String(r.playerId), r]))
  const box = await all(() => db.from('buckets_box').select('player_id, name, game_id, game_date, team, opp, home, min, pts, reb, ast, tpm')
    .in('player_id', ids).in('season', [sn.prev, sn.cur]).eq('season_type', 2).order('game_date', { ascending: false }))
  const logs = new Map()
  for (const r of box) { const k = String(r.player_id); if (!logs.has(k)) logs.set(k, []); logs.get(k).push(r) }
  const rows = []
  for (const id of ids) {
    const games = logs.get(id) || []
    if (!games.length) continue
    const t = tonight.get(id)
    const p = { sport: 'nba', id, name: t?.name || games[0]?.name || id, team: t?.team || games[0].team, pos: t?.pos || null }
    const next = t ? { opp: t.opp, home: t.home } : null
    for (const lane of LANES) {
      const quote = lined[id]?.[NBA_ODDS_KEY[lane.key]]
      const line = Number(quote?.line)
      if (!Number.isFinite(line)) continue
      const best = quote.best_over ?? quote.over
      const row = hitRaterRow({ p, lane: { ...lane, word: lane.label }, line, odds: Number.isFinite(Number(best)) ? Number(best) : null, games, next })
      rows.push({ ...row, gameId: t?.gameId || null, book: quote.best_book || null })
    }
  }
  return ok({ date: board?.date || null, since: sn.prev, rows }, 900)
})
