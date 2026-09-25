// LAMP · BOARD — GET /api/lamp/board?date=YYYY-MM-DD
//
// Tonight's goal board as the record has it: the LOCKED rows from
// lamp_goal_log for every game that has locked, and for a game still
// outside its lock window a PREVIEW scored live by the same code path
// (lib/nhl/goalBoard.js), flagged `preview: true` and never written. The
// page prints the difference in capitals; a preview is not a call.
import { easternToday } from '../../../../lib/data'
import { validDate } from '../../../../lib/nhl/api'
import { buildNight } from '../../../../lib/nhl/goalBoard'
import { MODEL_VERSION, whyLine } from '../../../../lib/nhl/goalModel'
import { adminClient } from '../../../../lib/nhl/db'
import { ok, bad, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const shape = (r, preview) => ({
  playerId: r.player_id ?? r.playerId, name: r.name, pos: r.pos, team: r.team, opp: r.opp, home: r.home,
  score: r.score, rank: r.rank_in_game ?? r.rank, status: r.status, reason: r.reason || null,
  legs: r.legs?.ok === false ? null : r.legs, pct: r.pct, context: r.context,
  why: whyLine({ pct: r.pct, reason: r.reason }),
  dressed: r.dressed ?? null, goals: r.goals ?? null, hit: r.hit ?? null, preview,
})

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const date = searchParams.get('date') || easternToday()
  if (!validDate(date)) return bad('date must be a real YYYY-MM-DD day')
  try {
    const db = adminClient()
    let locked = [], games = []
    if (db) {
      const [l, g] = await Promise.all([
        db.from('lamp_goal_log').select('*').eq('game_date', date).eq('model_version', MODEL_VERSION),
        db.from('lamp_goal_games').select('*').eq('game_date', date).eq('model_version', MODEL_VERSION),
      ])
      if (l.error) console.error(`[lamp board] log: ${l.error.message}`); else locked = l.data || []
      if (g.error) console.error(`[lamp board] games: ${g.error.message}`); else games = g.data || []
    }
    const lockedIds = new Set(games.filter((x) => x.locked_at).map((x) => Number(x.game_id)))
    const night = await buildNight(date)
    const out = night.day.games.map((g) => {
      const meta = games.find((x) => Number(x.game_id) === g.id) || null
      const isLocked = lockedIds.has(g.id)
      const rows = isLocked
        ? locked.filter((r) => Number(r.game_id) === g.id).map((r) => shape(r, false))
        : (night.byGame.get(g.id) || []).map((r) => shape(r, true))
      rows.sort((a, b) => (a.rank ?? 999) - (b.rank ?? 999) || String(a.name).localeCompare(String(b.name)))
      const start = Date.parse(g.startUtc)
      return {
        game: g, locked: isLocked, lockedAt: meta?.locked_at || null, lineupKnown: Boolean(meta?.lineup_known ?? night.lineups[g.id]),
        graded: Boolean(meta?.graded_at), snapshots: meta?.snapshots || 0,
        locksAtUtc: new Date(start - 100 * 60 * 1000).toISOString(),
        rows,
      }
    })
    return ok({ date, modelVersion: MODEL_VERSION, season: night.season, dbReady: Boolean(db), games: out, fetchedAt: new Date().toISOString() }, 60)
  } catch (e) {
    return delayed(`board ${date}`, e)
  }
}
