// LAMP · PENALTIES -- GET /api/lamp/penalties[?season=last]
//
// Who takes penalties and who draws them: the league's own skater penalties
// report (api.nhle.com/stats skater/penalties), every skater, plus tonight's
// opponent for each club playing. Measured, not modelled. The current season
// once it has a game in it (lib/nhl/whichSeason), or last season on request.
import { easternToday } from '../../../../lib/data'
import { scoreFor, nhlStatsGet } from '../../../../lib/nhl/api'
import { reduceScoreDay } from '../../../../lib/nhl/reduce'
import { whichSeason } from '../../../../lib/nhl/whichSeason'
import { previousSeasonId } from '../../../../lib/nhl/season'
import { seasonLabel } from '../../../../lib/nhl/reduce'
import { ok, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'
const n = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

export async function GET(request) {
  try {
    const last = new URL(request.url).searchParams.get('season') === 'last'
    const sn = await whichSeason()
    const season = last ? previousSeasonId(sn.current || sn.id) : sn.id
    const date = easternToday()
    const [rep, day] = await Promise.all([
      nhlStatsGet(`/skater/penalties?limit=-1&cayenneExp=${encodeURIComponent(`seasonId=${season} and gameTypeId=2`)}`, 3600),
      scoreFor(date).then(reduceScoreDay).catch(() => null),
    ])
    const tonight = {}
    for (const g of day?.games || []) {
      if (g.scheduleState !== 'OK') continue
      tonight[g.away.abbrev] = { opp: g.home.abbrev, home: false, gameId: g.id }
      tonight[g.home.abbrev] = { opp: g.away.abbrev, home: true, gameId: g.id }
    }
    const players = (rep?.data || []).map((r) => {
      const team = String(r.teamAbbrevs || '').split(',').pop().trim()
      return {
        id: r.playerId, name: r.skaterFullName, team, pos: r.positionCode, gp: n(r.gamesPlayed),
        taken: n(r.penalties), drawn: n(r.penaltiesDrawn), net: n(r.netPenalties), pim: n(r.penaltyMinutes),
        minors: n(r.minorPenalties), majors: n(r.majorPenalties),
        takenPer60: Math.round(n(r.penaltiesTakenPer60) * 100) / 100, drawnPer60: Math.round(n(r.penaltiesDrawnPer60) * 100) / 100,
        tonight: tonight[team] || null,
      }
    }).filter((p) => p.gp > 0)
    return ok({ season, label: seasonLabel(season), last, date, players, source: 'api.nhle.com/stats skater/penalties (regular season)', fetchedAt: new Date().toISOString() }, 1800)
  } catch (e) {
    return delayed('penalties', e)
  }
}
