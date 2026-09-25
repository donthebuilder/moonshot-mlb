// 🏒 READING A NIGHT'S BOARD — one function for every surface that shows
// it (the board route, the front door, /start). The LOCKED rows from
// lamp_goal_log for every game that has locked; for a game still outside
// its window a PREVIEW scored live by the same code path (goalBoard.js),
// flagged `preview: true` and never written. A preview is not a call and
// every caller prints the difference in capitals.
import { buildNight } from './goalBoard'
import { MODEL_VERSION, whyLine } from './goalModel'
import { adminClient } from './db'
import { netLine } from './goalies'

export const LOCK_WINDOW_MS = 100 * 60 * 1000

export const shapeRow = (r, preview) => ({
  playerId: r.player_id ?? r.playerId, name: r.name, pos: r.pos, team: r.team, opp: r.opp, home: r.home,
  score: r.score, rank: r.rank_in_game ?? r.rank, status: r.status, reason: r.reason || null,
  legs: r.legs?.ok === false ? null : r.legs, pct: r.pct, context: r.context,
  why: whyLine({ pct: r.pct, reason: r.reason }),
  dressed: r.dressed ?? null, goals: r.goals ?? null, hit: r.hit ?? null, preview,
})

/** The record's rows for a day, or empty lists when the table is not there yet. */
export async function readLocked(date) {
  const db = adminClient()
  if (!db) return { db: false, locked: [], games: [] }
  const [l, g] = await Promise.all([
    db.from('lamp_goal_log').select('*').eq('game_date', date).eq('model_version', MODEL_VERSION),
    db.from('lamp_goal_games').select('*').eq('game_date', date).eq('model_version', MODEL_VERSION),
  ])
  if (l.error) console.error(`[lamp board] log: ${l.error.message}`)
  if (g.error) console.error(`[lamp board] games: ${g.error.message}`)
  return { db: true, locked: l.error ? [] : l.data || [], games: g.error ? [] : g.data || [] }
}

/**
 * @returns {{ date, modelVersion, season, dbReady, games: Array<{game, locked, lockedAt, lineupKnown, graded, snapshots, locksAtUtc, net, startersActual, rows}> }}
 */
export async function readBoard(date) {
  const [{ db, locked, games }, night] = await Promise.all([readLocked(date), buildNight(date)])
  const lockedIds = new Set(games.filter((x) => x.locked_at).map((x) => Number(x.game_id)))
  const out = night.day.games.map((g) => {
    const meta = games.find((x) => Number(x.game_id) === g.id) || null
    const isLocked = lockedIds.has(g.id)
    const rows = isLocked
      ? locked.filter((r) => Number(r.game_id) === g.id).map((r) => shapeRow(r, false))
      : (night.byGame.get(g.id) || []).map((r) => shapeRow(r, true))
    rows.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || String(a.name).localeCompare(String(b.name)))
    const start = Date.parse(g.startUtc)
    return {
      game: g, locked: isLocked, lockedAt: meta?.locked_at || null, lineupKnown: Boolean(meta?.lineup_known ?? night.lineups[g.id]),
      graded: Boolean(meta?.graded_at), snapshots: meta?.snapshots || 0,
      locksAtUtc: new Date(start - LOCK_WINDOW_MS).toISOString(),
      // The net: pregame null in v1 (no source in the feed); after grading,
      // who actually started and his line — real, from the boxscore.
      starters: meta?.starters || null, startersActual: meta?.starters_actual || null,
      net: meta?.graded_at ? netLine(meta?.goalies, meta?.starters_actual) : null,
      rows,
    }
  })
  return { date, modelVersion: MODEL_VERSION, season: night.season, dbReady: db, games: out }
}
