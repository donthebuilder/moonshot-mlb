// THE BOARD FEEDS, GATED ON THE SERVER (2026-10-26 security check, Donovan: "members get the full feed through their own private request, everyone
// else gets the cached version with tonight's hidden picks drawn as ON THE BOARD").
//
// /api/lamp/board and /api/buckets/board used to send every CALLED row to anyone (the pages hid them only on screen). Now:
//   the plain address      -> the GATED board for everyone, cached at the edge exactly as before (one copy, safe to share)
//   the same address + m=1 -> the FULL board when the request's own login is a member (private, never cached); a non-member asking gets the gated
//                             board, also private
// GATED = the same rule as the front door and lib/members/hide.js: a CALLED pick whose game has not started and has no result is drawn as a plain ON THE
// BOARD player (no CALLED, no score, no why, no role), except the sport's free four (lib/members/freeFour.js). A started or graded pick is public proof.
// Pure and browser-safe; the server's half (who is asking) is lib/members/boardViewer.js.
import { isOpenCall } from './hide'

export const MEMBER_FEED_PARAM = 'm'
const FEED = /^(?:https?:\/\/[^/]+)?\/api\/(?:lamp|buckets)\/board(?:\?|$)/

/** The address a member's browser asks for: the board feeds get m=1, any other address is left alone. Pure. */
export function withMemberFeed(url, member) {
  if (!member || !url || !FEED.test(String(url)) || /[?&]m=1(?:&|$)/.test(url)) return url
  return `${url}${String(url).includes('?') ? '&' : '?'}${MEMBER_FEED_PARAM}=1`
}

/** One open CALLED row drawn as a plain ON THE BOARD player. Pure. */
export function quietRow(r) {
  return {
    ...r, status: 'board', score: null, why: null, whyShort: '', reason: null, pct: null, role: null,
    ...(r.context ? { context: { ...r.context, role: null, goalGameProbability: null } } : {}),
  }
}

/**
 * A board ({ games: [...], rows?: [...] } in LAMP's or BUCKETS' shape) -> the same board with every open CALLED row quieted, except `freeIds`.
 * LAMP keeps rows inside each game (games[].rows, the start at games[].game.startUtc); BUCKETS keeps one rows list (rows[].gameId, games[].start).
 * Returns { board, hidden }. Pure.
 */
export function gateBoard(board, { freeIds = new Set(), now = Date.now() } = {}) {
  if (!board || typeof board !== 'object') return { board, hidden: 0 }
  let hidden = 0
  const free = (r) => freeIds.has(String(r.playerId ?? r.player_id ?? ''))
  const gate = (r, startMs) => {
    const graded = r.hit != null || r.actual != null || r.graded === true
    if (!isOpenCall({ status: r.status, startMs, graded, now }) || free(r)) return r
    hidden += 1
    return quietRow(r)
  }
  const startOfGame = (g) => Date.parse(g?.game?.startUtc ?? g?.startUtc ?? g?.start ?? '')
  const games = Array.isArray(board.games) ? board.games.map((g) => (Array.isArray(g?.rows) ? { ...g, rows: g.rows.map((r) => gate(r, startOfGame(g))) } : g)) : board.games
  const startById = new Map((Array.isArray(board.games) ? board.games : []).map((g) => [String(g?.id ?? g?.game?.id ?? ''), startOfGame(g)]))
  const rows = Array.isArray(board.rows) ? board.rows.map((r) => gate(r, startById.get(String(r.gameId ?? r.game_id ?? '')) ?? NaN)) : board.rows
  return { board: { ...board, games, ...(Array.isArray(board.rows) ? { rows } : {}) }, hidden }
}
