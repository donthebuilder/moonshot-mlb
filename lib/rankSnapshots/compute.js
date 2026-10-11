// THE DEFAULT ORDERINGS, PURE (2026-10-10). One function per sport turns the payload a board is drawn from into
// { board: Map(id -> rank) }, using the SAME ordering code the board's own # column uses (hrRank, scoreFor, tdPool).
// The server route and the tests read these; the client keeps computing its own and the two are compared by
// fingerprint (lib/rankMove.js signature), so a difference can never invent an arrow, it only withholds one.
import { normalizeData, slateDateFromRows } from '../data'
import { hrRank, scoreFor } from '../scoring'
import { mlbId } from '../player'
import { tdPool } from '../nfl/tdPool'
import { MARKETS } from '../nfl/theme'

export const MLB_BOARDS = ['hr', 'hit', 'hrr', 'contact']

/** MOONSHOT: the four market boards over the whole slate (RankedBoard's moveRanks). */
export function mlbBoards(payload) {
  const players = normalizeData(payload || {}).players
  const out = {}
  out.hr = hrRank(players)
  for (const type of MLB_BOARDS.slice(1)) {
    const m = new Map()
    ;[...players].sort((a, b) => scoreFor(b, type) - scoreFor(a, type)).forEach((p, i) => { const id = mlbId(p); if (id != null && !m.has(id)) m.set(id, i + 1) })
    out[type] = m
  }
  return { date: slateDateFromRows(payload) || '', boards: out }
}

/** The week's date: its first kickoff's own calendar date (the game's, not the ET wall clock). */
export function nflGameDate(games) {
  const k = (games || []).map((g) => g?.kickoff).filter(Boolean).sort()[0]
  return k ? String(k).slice(0, 10) : ''
}

/** TUDDY: the TD board (tdPool order) and every other market (scored, not thin, by score). */
export function nflBoards(data) {
  const out = {}
  out.TD = new Map(tdPool(data).rows.map((p, i) => [String(p.player_id), i + 1]))
  for (const [market] of MARKETS) {
    if (market === 'TD') continue
    const eligible = (data?.players || []).filter((p) => Number.isFinite(p.scores?.[market]))
    out[market] = new Map(eligible.filter((p) => !p.low_sample).sort((a, b) => b.scores[market] - a.scores[market]).map((p, i) => [String(p.player_id), i + 1]))
  }
  return { date: nflGameDate(data?.games), boards: out }
}

/** LAMP: one market's night, as { 'GOAL:all': Map, 'GOAL:game': Map }, keyed gameId|playerId like the board. */
export function nhlBoards(market, board) {
  const flat = []
  for (const g of board?.games || []) {
    if (g.noMarketLock) continue
    for (const r of g.rows || []) if (r.status !== 'off') flat.push({ r, id: `${g.game.id}|${r.playerId}` })
  }
  const all = new Map()
  ;[...flat].sort((a, b) => (b.r.score ?? 0) - (a.r.score ?? 0)).forEach(({ id }, i) => all.set(id, i + 1))
  const game = new Map()
  flat.forEach(({ r, id }) => { if (r.rank != null) game.set(id, r.rank) })
  return { [`${market}:all`]: all, [`${market}:game`]: game }
}

/** BUCKETS: one market's night order (nightRank), keyed gameId-playerId like the board's _id. */
export function nbaBoard(board) {
  return new Map((board?.rows || []).filter((r) => r.nightRank != null && r.score != null).map((r) => [`${r.gameId}-${r.playerId}`, r.nightRank]))
}
