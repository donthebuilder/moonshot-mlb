// 🏀 WHO WE HAD IN ONE GAME (2026-10-23, the tin court v2). Pure, client-safe. From /api/buckets/board rows (one list
// per market, the model's own status per man -- never re-derived) to one game's answer:
//   byPlayer[id] = { status, markets }   status: the 0c rule (lib/record/nba.js markAnyMarketCalls): CALLED when ANY
//                                        BUCKETS market called him in this game; otherwise his headline (points) board
//                                        status -- 'board' or 'off'; a man on no board is 'off'.
//   calls = every called row in this game: { market, label, playerId, name, team, hit, actual, bar }
//   first = the first-basket board in this game: { called: [ids], statusOf(id) }
import { NBA_MARKETS } from '../nba/model'

export const GAME_MARKETS = ['pts', 'reb', 'ast', '3pm', 'pra', 'dd', 'td', 'first']

export function gameCalls(boards, gameId) {
  const gid = String(gameId)
  const rowsOf = (m) => (boards?.[m]?.rows || []).filter((r) => String(r.gameId) === gid)
  const byPlayer = {}
  for (const r of rowsOf('pts')) byPlayer[String(r.playerId)] = { status: r.status === 'called' || r.status === 'board' ? r.status : 'off', markets: [] }
  const calls = []
  for (const m of GAME_MARKETS) for (const r of rowsOf(m)) {
    if (r.status !== 'called') continue
    const id = String(r.playerId)
    byPlayer[id] = { status: 'called', markets: [...(byPlayer[id]?.markets || []), m] }
    calls.push({ market: m, label: NBA_MARKETS[m]?.label || m, playerId: id, name: r.name, team: r.team, hit: r.hit ?? null, actual: r.actual ?? null, bar: NBA_MARKETS[m]?.bar ?? null })
  }
  const firstRows = rowsOf('first')
  const first = {
    called: firstRows.filter((r) => r.status === 'called').map((r) => String(r.playerId)),
    statusOf: (id) => { const r = firstRows.find((x) => String(x.playerId) === String(id)); return r?.status === 'called' || r?.status === 'board' ? r.status : 'off' },
  }
  return { byPlayer, calls, first, statusOf: (id) => byPlayer[String(id)]?.status || 'off' }
}
