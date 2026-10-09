// GET /api/buckets/ledger?date=YYYY-MM-DD -- THE NIGHT'S LEDGER (LAMP's Ledger,
// the NBA way): every player who cleared a market's bar that night (PTS 25+,
// REB 10+, AST 8+, 3PM 4+, PRA 35+, a double-double, a triple-double), live while games are on, each tagged with
// the status his row LOCKED with before tip -- CALLED / ON THE BOARD / NOT ON
// THE BOARD (lib/nba/model.js scoreNight's words; nothing re-derived). The box
// is ESPN's (summary, cached; a final one for an hour); the locked statuses
// are buckets_log's called / board rows for those games only. A game that
// never locked says so: its scorers carry no tag. Gated.
import { scoreboardFor, reduceScoreboard, summaryFor, reduceBox } from '../../../../lib/nba/api'
import { NBA_MARKETS } from '../../../../lib/nba/model'
import { tensActual } from '../../../../lib/nba/ddtd'
import { adminClient } from '../../../../lib/supabase/admin'
import { ok, bad, bucketsRoute } from '../../../../lib/nba/respond'
import { ptsBefore, roundCrossed, PTS_MARK } from '../../../../lib/nba/seasonPts'
import { seasonStats } from '../../../../lib/nba/stats'
import { nbaSeason } from '../../../../lib/nba/season'
import { slateNight } from '../../../../lib/slateNight'

export const dynamic = 'force-dynamic'
const MK = ['pts', 'reb', 'ast', '3pm', 'pra', 'dd', 'td']
const VERSIONS = MK.map((k) => NBA_MARKETS[k].version)
const val = (k, b) => (k === 'dd' || k === 'td' ? tensActual(b) : k === 'pra' ? (b.pts == null ? null : (b.pts || 0) + (b.reb || 0) + (b.ast || 0)) : k === '3pm' ? b.tpm : b[k])

export const GET = bucketsRoute('ledger', async (q) => {
  const date = q.get('date') || await slateNight('nba')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad('date must be YYYY-MM-DD')
  const games = reduceScoreboard(await scoreboardFor(date))
  const on = games.filter((g) => g.state !== 'pre')
  const boxes = await Promise.all(on.map((g) => summaryFor(g.id, g.state === 'final').then(reduceBox).catch(() => null)))
  // locked statuses: called / board rows only (everything else locked is NOT ON THE BOARD)
  const tag = new Map(); const locked = new Set(); const callsMade = Object.fromEntries(MK.map((k) => [k, 0]))
  const db = adminClient()
  if (db && on.length) {
    const ids = on.map((g) => g.id)
    const [st, lk] = await Promise.all([
      db.from('buckets_log').select('game_id, player_id, market, status, role').in('game_id', ids).in('model_version', VERSIONS).in('status', ['called', 'board']),
      db.from('buckets_games').select('game_id').in('game_id', ids),
    ])
    for (const r of st.data || []) tag.set(`${r.game_id}|${r.player_id}|${r.market}`, { status: r.status, role: r.role })
    for (const r of lk.data || []) locked.add(String(r.game_id))
    // the calls actually written (not an assumed two a game): CALLED rows of the locked games, per market
    for (const r of st.data || []) if (r.status === 'called' && locked.has(String(r.game_id)) && r.market in callsMade) callsMade[r.market] += 1
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
  // ROUND NUMBER (parity, 10-05): a PTS clearer in a regular-season game whose season points
  // crossed a multiple of PTS_MARK tonight -- entering total from his game log (exact on any night)
  const round = []
  await Promise.all(rows.filter((r) => r.market === 'pts').map(async (r) => {
    const g = on.find((x) => x.id === r.gameId)
    if (g?.seasonType !== 2) return
    const before = await ptsBefore(r.playerId, g.seasonYear, date)
    const mark = roundCrossed(before, r.value)
    if (mark) round.push({ playerId: r.playerId, name: r.name, team: r.team, gameId: r.gameId, before, tonight: r.value, mark })
  }))
  // WHO NEEDS WHAT: on the current night only, the league's season totals (ESPN byathlete)
  // within one PTS-bar night of the next mark -- the page lists the ones whose game hasn't tipped.
  let nearMark = null, nearWhy = null
  try {
    const sn = await nbaSeason()
    if (date !== await slateNight('nba')) nearWhy = 'past'
    else if (sn.stale) nearWhy = 'stale'
    else {
      nearMark = {}
      for (const a of (await seasonStats(sn.cur)).athletes.values()) {
        const t = Number(a.ptsTot)
        if (Number.isFinite(t) && t > 0 && PTS_MARK - (t % PTS_MARK) <= NBA_MARKETS.pts.bar) nearMark[a.id] = t
      }
    }
  } catch { nearWhy = 'failed' }
  const capture = Object.fromEntries(MK.map((k) => { const r = rows.filter((x) => x.market === k && x.status); return [k, { total: r.length, called: r.filter((x) => x.status === 'called').length, board: r.filter((x) => x.status === 'board').length, off: r.filter((x) => x.status === 'off').length }] }))
  return ok({ date, games, live: games.filter((g) => g.state === 'live').length, lockedGames: [...locked], callsMade, rows, round, nearMark, nearWhy, mark: PTS_MARK, capture, fetchedAt: new Date().toISOString() }, games.some((g) => g.state === 'live') ? 30 : 300)
})
