// GET /api/buckets/ledger?date=YYYY-MM-DD -- THE NIGHT'S LEDGER (LAMP's Ledger,
// the NBA way): every player who cleared a market's bar that night (PTS 25+,
// REB 10+, AST 8+, 3PM 4+, PRA 35+), live while games are on, each tagged with
// the status his row LOCKED with before tip -- CALLED / ON THE BOARD / NOT ON
// THE BOARD (lib/nba/model.js scoreNight's words; nothing re-derived). The box
// is ESPN's (summary, cached; a final one for an hour); the locked statuses
// are buckets_log's called / board rows for those games only. A game that
// never locked says so: its scorers carry no tag. Gated.
import { scoreboardFor, reduceScoreboard, summaryFor, reduceBox } from '../../../../lib/nba/api'
import { NBA_MARKETS } from '../../../../lib/nba/model'
import { adminClient } from '../../../../lib/supabase/admin'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { easternToday } from '../../../../lib/data'

export const dynamic = 'force-dynamic'
const MK = ['pts', 'reb', 'ast', '3pm', 'pra']
const VERSIONS = MK.map((k) => NBA_MARKETS[k].version)
const val = (k, b) => (k === 'pra' ? (b.pts == null ? null : (b.pts || 0) + (b.reb || 0) + (b.ast || 0)) : k === '3pm' ? b.tpm : b[k])

export const GET = bucketsRoute('ledger', async (q) => {
  const date = q.get('date') || easternToday()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('date must be YYYY-MM-DD')
  const games = reduceScoreboard(await scoreboardFor(date))
  const on = games.filter((g) => g.state !== 'pre')
  const boxes = await Promise.all(on.map((g) => summaryFor(g.id, g.state === 'final').then(reduceBox).catch(() => null)))
  // locked statuses: called / board rows only (everything else locked is NOT ON THE BOARD)
  const tag = new Map(); const locked = new Set()
  const db = adminClient()
  if (db && on.length) {
    const ids = on.map((g) => g.id)
    const [st, lk] = await Promise.all([
      db.from('buckets_log').select('game_id, player_id, market, status, role').in('game_id', ids).in('model_version', VERSIONS).in('status', ['called', 'board']),
      db.from('buckets_games').select('game_id').in('game_id', ids),
    ])
    for (const r of st.data || []) tag.set(`${r.game_id}|${r.player_id}|${r.market}`, { status: r.status, role: r.role })
    for (const r of lk.data || []) locked.add(String(r.game_id))
  }
  const rows = []
  on.forEach((g, i) => {
    for (const b of boxes[i] || []) {
      if (b.dnp) continue
      for (const k of MK) {
        const v = val(k, b)
        if (v == null || v < NBA_MARKETS[k].bar) continue
        const t = tag.get(`${g.id}|${b.id}|${k}`)
        rows.push({ gameId: g.id, state: g.state, detail: g.detail, playerId: b.id, name: b.name, team: b.team, pos: b.pos || null, opp: b.team === g.home.abbrev ? g.away.abbrev : g.home.abbrev,
          market: k, value: v, status: locked.has(g.id) ? (t?.status || 'off') : null, role: t?.role || null })
      }
    }
  })
  const capture = Object.fromEntries(MK.map((k) => { const r = rows.filter((x) => x.market === k && x.status); return [k, { total: r.length, called: r.filter((x) => x.status === 'called').length, board: r.filter((x) => x.status === 'board').length, off: r.filter((x) => x.status === 'off').length }] }))
  return ok({ date, games, live: games.filter((g) => g.state === 'live').length, lockedGames: [...locked], rows, capture, fetchedAt: new Date().toISOString() }, games.some((g) => g.state === 'live') ? 30 : 300)
})
