// 🏀 BUCKETS' MOMENTS (B5, BUCKETS-PLAN-v2, 2026-10-03): the 30 PIECE. Pure.
// A player who reaches 30 points in a live (or just-final) game is one row in
// buckets_feed, written ONCE (the primary key), carrying the status his points
// row LOCKED with before tip -- CALLED / ON THE BOARD / NOT ON THE BOARD, the
// board's own word (lib/nba/model.js scoreNight), never re-derived; null when
// the game never locked. Posting rule (the plan): X only when CALLED
// ("🤖 CALLED IT"); otherwise Discord. Preseason never posts.
import { nba as nbaCopy } from '../copy/notifications'

export const MOMENT_BAR = 30
export const KIND = '30_piece'

/** games: scoreboard rows; boxes: same order, reduceBox rows; locks: Map(`${game}|${player}` -> { status, nightRank }) */
export function momentRows(games, boxes, locks, lockedGames) {
  const out = []
  games.forEach((g, i) => {
    for (const b of boxes[i] || []) {
      if (b.dnp || !(Number(b.pts) >= MOMENT_BAR)) continue
      const l = locks.get(`${g.id}|${b.id}`)
      out.push({
        game_id: String(g.id), player_id: String(b.id), kind: KIND, game_date: g.date, name: b.name, team: b.team,
        opp: b.team === g.home.abbrev ? g.away.abbrev : g.home.abbrev, points: Number(b.pts),
        status: lockedGames.has(String(g.id)) ? (l?.status || 'off') : null, season_type: g.seasonType ?? null,
        _rank: l?.nightRank ?? null,
      })
    }
  })
  return out
}

/** The post's words (lib/copy/notifications.js nba.moment). CALLED: "🤖 CALLED IT"; else "DROPS A 30 PIECE" with his board rank when he had one. No link (Donovan 2026-10-09: no links anywhere). */
export function momentText(r) {
  return nbaCopy.moment({ name: r.name, team: r.team, opp: r.opp, called: r.status === 'called', rank: r._rank })
}
