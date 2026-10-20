// 🛡 DEFENSE VS POSITION + HIS POSITION VS THIS OPPONENT (2026-10-19, Donovan picked mocks D1 / D2 / P1:
// https://claude.ai/artifact/SGv5Rmbyj2ZPD6tpDo73j9). Pure: no fetch, no clock.
//
//   THE ROWS      buckets_box, one row per player per game (supabase/migrations/202610200100_buckets_box.sql), written
//                 at grade time by the tick and backfilled by scripts/backfill-nba-box.mjs. boxRows() is the one shape.
//   ALLOWED       what a defense gave up to guards / forwards / centers in a game = every player at that position who
//                 played against it, added up. Postgres sums it (buckets_defpos: the org is at its egress limit, so no
//                 raw rows leave the database); rankDefPos() here only ranks: 1 = gave up the most.
//   POSITION      ESPN's own G / F / C. ESPN does not split PG / SG / SF / PF, so neither do we.
//   POS VS OPP    starters at his position against one club, each against HIS OWN average in his other games that
//                 season (buckets_posvs). No book line was saved for those games; once lines are on file this can
//                 take the real line. "Beat" = more than his own average.
export const POSITIONS = ['G', 'F', 'C']
export const POS_WORD = { G: 'Guards', F: 'Forwards', C: 'Centers' }
export const WINDOWS = [['L5', 'Last 5'], ['L10', 'Last 10'], ['Season', 'Season']]
export const DEF_STATS = [['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['tpm', '3PM'], ['stl', 'STL'], ['blk', 'BLK'], ['pra', 'PRA']]
export const VS_STATS = [['pts', 'PTS'], ['reb', 'REB'], ['ast', 'AST'], ['tpm', '3PM'], ['pra', 'PRA']]
// a season with fewer games than this for any club reads the season before (opening week never shows a 1-game "L5")
export const MIN_GAMES = 5

/** ESPN's position abbreviation -> G / F / C, or null ("G-F" reads as its first letter). */
export function posOf(espn) {
  const c = String(espn || '').trim().toUpperCase()[0]
  return POSITIONS.includes(c) ? c : null
}

/** One finished game's box (lib/nba/api reduceBox) -> buckets_box rows. Players with minutes only. */
export function boxRows(game, box) {
  const { gameId, gameDate, season, seasonType, home, away, homeScore, awayScore } = game
  const done = Number.isFinite(homeScore) && Number.isFinite(awayScore) && homeScore !== awayScore
  return (box || []).filter((b) => b.id && !b.dnp && b.min > 0 && (b.team === home || b.team === away)).map((b) => {
    const isHome = b.team === home
    return {
      game_id: String(gameId), player_id: String(b.id), game_date: gameDate, season, season_type: seasonType,
      team: b.team, opp: isHome ? away : home, home: isHome, team_won: done ? (isHome ? homeScore > awayScore : awayScore > homeScore) : null,
      name: b.name, pos: posOf(b.pos), starter: b.starter === true, min: b.min,
      pts: b.pts, reb: b.reb, ast: b.ast, tpm: b.tpm, stl: b.stl, blk: b.blk,
    }
  })
}

/** buckets_defpos rows -> { G: { L5: { BOS: { gp, v: {pts..pra}, r: {pts..pra} } } } }, rank 1 = gave up the most. */
export function rankDefPos(rows) {
  const out = {}
  for (const r of rows || []) {
    const v = { pts: +r.pts, reb: +r.reb, ast: +r.ast, tpm: +r.tpm, stl: +r.stl, blk: +r.blk }
    v.pra = Math.round((v.pts + v.reb + v.ast) * 10) / 10
    ;((out[r.pos] ||= {})[r.win] ||= {})[r.def] = { gp: r.gp, v, r: {} }
  }
  for (const p of Object.values(out)) for (const t of Object.values(p)) {
    const clubs = Object.keys(t)
    for (const [k] of DEF_STATS) {
      // ties share the better rank
      const sorted = [...clubs].sort((a, b) => t[b].v[k] - t[a].v[k])
      sorted.forEach((c, i) => { t[c].r[k] = i > 0 && t[c].v[k] === t[sorted[i - 1]].v[k] ? t[sorted[i - 1]].r[k] : i + 1 })
    }
  }
  return out
}

/** The fewest season games any club has in a ranked table (for the MIN_GAMES fallback). */
export const fewestGames = (ranked) => Math.min(...Object.values(ranked?.G?.Season || {}).map((x) => x.gp), Infinity)

/** buckets_posvs rows -> table rows for one stat: his number, his own average elsewhere, and whether he beat it. */
export function vsRows(rows, stat) {
  return (rows || []).map((r) => {
    const v = stat === 'pra' ? (r.pts ?? 0) + (r.reb ?? 0) + (r.ast ?? 0) : r[stat]
    const avg = stat === 'pra' ? (r.avg_pts == null ? null : Math.round((+r.avg_pts + +r.avg_reb + +r.avg_ast) * 10) / 10) : (r[`avg_${stat}`] == null ? null : +r[`avg_${stat}`])
    return { ...r, v, avg, diff: avg == null || v == null ? null : Math.round((v - avg) * 10) / 10, beat: avg != null && v != null && v > avg }
  }).filter((r) => r.avg != null && r.gp >= 5)
}

/** "beat their own average" over the last n GAME DATES (every starter that night counts), or all of them. */
export function beatShare(rows, n = Infinity) {
  const days = [...new Set(rows.map((r) => r.game_date))].slice(0, n)
  const xs = rows.filter((r) => days.includes(r.game_date))
  return { beat: xs.filter((r) => r.beat).length, of: xs.length }
}
