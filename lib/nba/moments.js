// 🏀 BUCKETS' MOMENTS (B5, BUCKETS-PLAN-v2, 2026-10-03): the 30 PIECE. Pure.
// A player who reaches 30 points in a live (or just-final) game is one row in
// buckets_feed, written ONCE (the primary key), carrying the status his points
// row LOCKED with before tip -- CALLED / ON THE BOARD / NOT ON THE BOARD, the
// board's own word (lib/nba/model.js scoreNight), never re-derived; null when
// the game never locked. Posting rule (the plan): X only when CALLED
// ("🤖 CALLED IT"); otherwise Discord. Preseason never posts.
import { nba as nbaCopy } from '../copy/notifications'
import { isDoubleDouble, isTripleDouble } from './ddtd'

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

// ── THE DOUBLE-DOUBLE / TRIPLE-DOUBLE MOMENT (2026-10-20, Donovan: yes to "a CALLED double-double or triple-double gets its own
// WE HAD HIM post, like 30-point nights"). CALLED only: a row is written (and posted) only for a man CALLED in that market before tip,
// once he has it on the box score -- the claim row is the only thing stored. A triple-double he was CALLED for comes first; a man
// CALLED for both who gets the triple-double is one post, not two.
export const DD_KIND = 'double_double'
export const TD_KIND = 'triple_double'
const DDTD_MOMENT = { [TD_KIND]: { market: 'td', has: isTripleDouble, word: 'TRIPLE-DOUBLE' }, [DD_KIND]: { market: 'dd', has: isDoubleDouble, word: 'DOUBLE-DOUBLE' } }

/** locks: Map(`${game}|${player}|${market}` -> 'called' | ...). Rows carry the box line in `_line` (never stored). */
export function ddtdRows(games, boxes, locks, lockedGames) {
  const out = []
  games.forEach((g, i) => {
    if (!lockedGames.has(String(g.id))) return
    for (const b of boxes[i] || []) {
      if (b.dnp) continue
      const kind = [TD_KIND, DD_KIND].find((k) => locks.get(`${g.id}|${b.id}|${DDTD_MOMENT[k].market}`) === 'called' && DDTD_MOMENT[k].has(b))
      if (!kind) continue
      out.push({
        game_id: String(g.id), player_id: String(b.id), kind, game_date: g.date, name: b.name, team: b.team,
        opp: b.team === g.home.abbrev ? g.away.abbrev : g.home.abbrev, points: Number(b.pts) || null, status: 'called', season_type: g.seasonType ?? null,
        _line: { pts: b.pts, reb: b.reb, ast: b.ast, stl: b.stl, blk: b.blk },
      })
    }
  })
  return out
}

/** "🤖 CALLED IT / 🏀 <NAME> GETS THE DOUBLE-DOUBLE / <pts> PTS · <reb> REB · <ast> AST / <TEAM> vs <OPP> · called before tip on the BUCKETS double-double board". */
export function ddtdText(r) {
  const m = DDTD_MOMENT[r.kind]
  if (!m || !r._line) return ''
  const L = r._line
  const stats = [['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['stl', 'STL'], ['blk', 'BLK']].filter(([k]) => Number.isFinite(Number(L[k])) && (k === 'pts' || k === 'reb' || k === 'ast' || Number(L[k]) >= 10)).map(([k, w]) => `${L[k]} ${w}`)
  return `\u{1F916} CALLED IT\n\n\u{1F3C0} ${String(r.name).toUpperCase()} GETS THE ${m.word}\n${stats.join(' · ')}\n${r.team} vs ${r.opp} · called before tip on the BUCKETS ${m.word.toLowerCase()} board`
}
