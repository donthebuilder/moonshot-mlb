// THE NHL FEATURED-GAME PICK (2026-10-08). One game a night goes to X. It is ranked by the SAME number the
// Slate's dial prints: the game's projected goals (game.proj.total, lib/nhl/teamProj*.js, on the board
// response) -- read here, never re-derived. Tie-break unchanged: the most of the night's top-20 players
// (dailyFeatured rank 'xg': value + ranked / 1000), then rules 3 and 4 of featured.js.
//
// The OLD rule (the board's goal chances as Poisson rates, summed: nhlExpectedGoals) is computed beside it and
// both picks are returned, so the dry rows can log them for the owner to compare. Pure: no fetch, no clock.
// PICK-TIME INPUTS ONLY: the caller passes the pregame board of the due window; nothing here reads a result.
import { dailyFeatured } from './featured'
import { nhlExpectedGoals } from './nhl'

const fin = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

/**
 * @param boardGames readBoard(date, { market: 'GOAL', proj: true }).games
 * @param recentTeams clubs featured in the last 2 days
 * @returns { pick, oldPick, basis, candidates }  pick/oldPick: a candidate or null; basis: 'xg' | 'rate' | 'mixed' | 'none'
 *   (what the new number came from across the night's games: the team model, the plain-rate fallback, both, or no number at all)
 */
export function nhlFeaturedPicks(boardGames = [], { recentTeams = new Set() } = {}) {
  const nightTop = new Set(boardGames.flatMap((bg) => bg.rows || []).filter((r) => (r.context?.nightRank ?? 999) <= 20).map((r) => String(r.playerId)))
  const candidates = boardGames.map((bg) => {
    const rows = bg.rows || []
    const calls = [bg.game.away.abbrev, bg.game.home.abbrev].map((t) => rows.filter((r) => r.team === t && r.status === 'called').sort((a, b) => (b.score ?? 0) - (a.score ?? 0))[0]).filter(Boolean)
    const total = fin(bg.proj?.total)
    return {
      game_id: String(bg.game.id), start: bg.game.startUtc, teams: [bg.game.away.abbrev, bg.game.home.abbrev], calls: calls.map((c) => ({ score: c.score, role: c.context?.role })),
      lineups: true, started: false,
      xg: total ?? 0,                                             // the dial's number (0 when the game has none: the tie-break decides)
      proj_total: total, proj_source: total != null ? (bg.proj?.source || null) : null,
      old_xg: nhlExpectedGoals(rows),
      ranked: rows.filter((r) => nightTop.has(String(r.playerId))).length,
    }
  })
  const pick = dailyFeatured(candidates, { rank: 'xg', recentTeams })
  const oldPick = dailyFeatured(candidates.map((c) => ({ ...c, xg: c.old_xg })), { rank: 'xg', recentTeams })
  const src = new Set(candidates.map((c) => c.proj_source).filter(Boolean))
  const basis = src.size === 0 ? 'none' : src.size > 1 || candidates.some((c) => c.proj_total == null) ? 'mixed' : [...src][0]
  return { pick, oldPick, basis, candidates }
}
