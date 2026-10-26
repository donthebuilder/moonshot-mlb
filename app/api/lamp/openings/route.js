// GET /api/lamp/openings?season=both|this|last&where=all|home|away&last=10 -- LAMP's OPENINGS research (2026-10-26): every club's
// faceoff and first-goal record, shots to the first goal, goals in the first 5 and 10 minutes and the period, what the first goals were
// and what each defense allowed, and who scores first most -- counted from opening_games (sport 'nhl', written once a game at grade
// time, lib/nhl/openings.js). Counts only (lib/openings/teamAgg.js), never a chance. Also tonight's games for the matchup.
import { easternToday } from '../../../../lib/data'
import { scoreFor } from '../../../../lib/nhl/api'
import { reduceScoreDay } from '../../../../lib/nhl/reduce'
import { adminClient } from '../../../../lib/supabase/admin'
import { readTeamOpenings } from '../../../../lib/openings/readTeamOpenings'
import { ok, bad, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const sp = new URL(request.url).searchParams
  const season = sp.get('season') || 'both', where = sp.get('where') || 'all', last = sp.get('last') ? Number(sp.get('last')) : null
  if (!['both', 'this', 'last'].includes(season) || !['all', 'home', 'away'].includes(where) || (last != null && !(last > 0 && last <= 82))) return bad('season both|this|last, where all|home|away, last 1-82')
  try {
    const db = adminClient()
    if (!db) return ok({ teams: [], scorers: [], games: 0, seasons: [], tonight: [] }, 60)
    const [agg, day] = await Promise.all([readTeamOpenings(db, 'nhl', { season, where, last }), scoreFor(easternToday()).then(reduceScoreDay).catch(() => null)])
    const tonight = (day?.games || []).filter((g) => g.scheduleState === 'OK' && g.away?.abbrev && g.home?.abbrev)
      .map((g) => ({ key: String(g.id), away: g.away.abbrev, home: g.home.abbrev, label: `${g.away.abbrev} @ ${g.home.abbrev}`, gameId: g.id }))
    return ok({ ...agg, tonight }, 600)
  } catch (e) {
    return delayed('openings', e)
  }
}
