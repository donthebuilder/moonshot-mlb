// 🏈 TUDDY FIRST TD, first_td_site_v1 (2026-10-27, Donovan: "I want these players ranked for first touchdowns and first anything").
// Who scores the game's FIRST touchdown, ranked inside each game. A RANK, never a chance. A NEW MODEL beside the anytime-TD score
// (it never changes that score, its rank or its word): model_id 'tuddy-first', model_version 'first_td_site_v1'. New version = new rows.
//
//   share  = his expected TDs this season (stats.xTD) over the sum for the RB / WR / TE on his club's page (his slice of the club's TDs)
//   club   = how often his club scored first this season, games before the day, pulled toward 50% (6 games of weight). NOTE: "scored
//            first" is the game's first SCORE (opening_games.first_score_team: a field goal counts), the only first-score count on file.
//   value  = share x club. Ranked inside the game, both clubs. ON THE BOARD = #1-#3 in the game; nothing is CALLED (no first-TD price is stored).
//   target = he scores the game's first touchdown (rushing or receiving; the earliest TD in nfl_td_feed). Bye weeks are not ranked.
//
// UNPROVEN, SAID PLAINLY: there is no backtest (no NFL first-TD scorer on file before 2026-09-13: ~85 games, one season). The record
// starts the night this locks; the page says so. Pure functions only.
import { tdOnBoard } from '../callStatus'

export const FIRST_MODEL = Object.freeze({ model_id: 'tuddy-first', model_version: 'first_td_site_v1' })
export const FIRST_NOTE = 'First-TD ranking: a new model, not part of the TD score. No record yet.'
export const CLUB_PRIOR_GAMES = 6
export const BOARD_RANK = 3

const fin = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null)
/** A club's lean at scoring first: firsts of games, pulled toward 50%. */
export const clubFirstRate = (firsts, games) => ((fin(firsts) ?? 0) + CLUB_PRIOR_GAMES / 2) / ((fin(games) ?? 0) + CLUB_PRIOR_GAMES)

/** opening_games rows (home, away, first_score_team) before the day -> Map(club -> { firsts, games }). */
export function clubFirstCounts(rows) {
  const m = new Map()
  const bump = (t, first) => { if (!t) return; const c = m.get(t) || { firsts: 0, games: 0 }; c.games += 1; if (first) c.firsts += 1; m.set(t, c) }
  for (const r of rows || []) { bump(r.home, r.first_score_team === r.home); bump(r.away, r.first_score_team === r.away) }
  return m
}

const gameKey = (p) => [p.team, p.opp].sort().join('@')

/**
 * The week's first-TD board. `slate` = the week file (players with team, opp, position, on_bye, scores.TD, stats.xTD).
 * `counts` = clubFirstCounts(...). Returns { rows, of } where each row is the slate player plus `first`:
 * { value, share, club, rank, of, score } (score = 0-100 spot of his value among the week's ranked players: a rank, not a chance).
 */
export function firstTdBoard(slate, counts = new Map()) {
  const elig = new Set(((slate?.markets || []).find((m) => m.key === 'TD')?.positions) || ['RB', 'WR', 'TE'])
  const base = (slate?.players || []).filter((p) => !p.on_bye && elig.has(p.position) && Number.isFinite(Number(p.scores?.TD)) && fin(p.stats?.xTD) != null && p.team && p.opp)
  const teamXtd = new Map()
  for (const p of base) teamXtd.set(p.team, (teamXtd.get(p.team) || 0) + Math.max(0, fin(p.stats.xTD)))
  const rows = base.map((p) => {
    const tot = teamXtd.get(p.team) || 0
    const share = tot > 0 ? Math.max(0, fin(p.stats.xTD)) / tot : 0
    const cc = counts.get(p.team) || { firsts: 0, games: 0 }
    const club = clubFirstRate(cc.firsts, cc.games)
    return { p, share, club, value: share * club }
  })
  const asc = [...rows].sort((a, b) => a.value - b.value)
  const spot = new Map(asc.map((r, i) => [r, asc.length > 1 ? Math.round((100 * i) / (asc.length - 1)) : 100]))
  const byGame = new Map()
  for (const r of rows) { const k = gameKey(r.p); if (!byGame.has(k)) byGame.set(k, []); byGame.get(k).push(r) }
  const out = []
  for (const list of byGame.values()) {
    list.sort((a, b) => b.value - a.value || Number(b.p.scores.TD) - Number(a.p.scores.TD) || String(a.p.player_id).localeCompare(String(b.p.player_id)))
    list.forEach((r, i) => out.push({ ...r.p, first: { value: r.value, share: r.share, club: r.club, rank: i + 1, of: list.length, score: spot.get(r) }, first_on_board: i + 1 <= BOARD_RANK }))
  }
  return { rows: out, of: out.length }
}

/** board_lock rows for ONE game's players (`ids` = the game's player_ids already being frozen; `mine` = a base row to copy sport/game/date/week from). */
export function firstTdRows({ week, counts, rowsBase }) {
  const ids = new Set(rowsBase.map((r) => r.player_id))
  const mine = rowsBase[0]
  return firstTdBoard(week, counts).rows.filter((p) => ids.has(String(p.player_id))).map((p) => ({
    ...mine, ...FIRST_MODEL, player_id: String(p.player_id), name: p.name || null, team: p.team, opp: p.opp || null, pos: p.position || null,
    score: p.first.score, board_rank: p.first.rank, board_of: p.first.of, status: p.first_on_board ? 'board' : 'off', called_by: null,
  }))
}

const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z]/g, '')
/** The earliest touchdown of the game: quarter first, then the most clock left, then the feed's own order. feedRows = nfl_td_feed rows of the day. */
export function firstTdOf(feedRows, team, opp) {
  const mine = (feedRows || []).filter((r) => (r.team === team && r.opponent === opp) || (r.team === opp && r.opponent === team))
  if (!mine.length) return null
  const secs = (c) => { const [m, s] = String(c || '0:0').split(':'); return (Number(m) || 0) * 60 + (Number(s) || 0) }
  return [...mine].sort((a, b) => (a.quarter - b.quarter) || (secs(b.clock) - secs(a.clock)) || (a.td_n - b.td_n))[0]
}

/** One frozen row's grade: hit = he scored the game's first TD; miss otherwise; null when the game has no TD on file yet. */
export function firstTdResult(row, feedRows) {
  const f = firstTdOf(feedRows, row.team, row.opp)
  if (!f) return null
  const hit = norm(f.scorer_name) === norm(row.name)
  return { result: hit ? 'hit' : 'miss', actual: hit ? 1 : 0 }
}

export { tdOnBoard }
