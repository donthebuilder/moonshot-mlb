// 🏒 SHOT SPEED, FROM NHL EDGE (BATCH-3D-V2 1g; Donovan 10-02: "yes, player
// average, show that"). Server only (api-web.nhle.com sends no CORS header).
// GET api-web.nhle.com/v1/edge/skater-shot-speed-detail/{player}/{season}/{type}
//   shotSpeedDetails: avgShotSpeed + topShotSpeed (mph, percentile, leagueAvg)
//                     and attempt buckets 100+ / 90-100 / 80-90 / 70-80
//   hardestShots:     his ten hardest, each with the game id (end of
//                     gameCenterLink), period and timeInPeriod -- enough to find
//                     the exact shot in lamp_shots (date + period + clock).
// A club: team-shot-speed-detail/{teamId}/... (its own average, its ten hardest).
//
// WHAT IT IS NOT: a speed for every shot. The play-by-play LAMP stores has no
// per-shot speed. Only the ten hardest are measured shots; everything else
// plays at a pace scaled by HIS average, and the page says so.
// Read once per player per day (the Data Cache), only when that map opens --
// no cron, no table. "source: NHL EDGE" on the page; the raw feed isn't resold.
import { nhlGet } from './api'
import { nhlTeam } from './teams'

const mph = (o) => (o && Number.isFinite(Number(o.imperial)) ? Math.round(Number(o.imperial) * 10) / 10 : null)
const clockS = (t) => { const m = /^(\d+):(\d{2})$/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : null }

export async function readShotSpeed({ player = null, team = null, season, gameType = 2 }) {
  const id = player ? Number(player) : nhlTeam(team)?.id
  if (!id || !season) return null
  const path = player
    ? `/edge/skater-shot-speed-detail/${id}/${season}/${gameType}`
    : `/edge/team-shot-speed-detail/${id}/${season}/${gameType}`
  const j = await nhlGet(path, 86400).catch(() => null)
  // a club's details are a list by position; its own line is position 'all'
  const raw = j?.shotSpeedDetails
  const d = Array.isArray(raw) ? raw.find((x) => x?.position === 'all') || raw[0] : raw
  if (!d || mph(d.avgShotSpeed) == null) return null   // callups, preseason, "now" before the season: no row
  const hardest = (j.hardestShots || []).map((h) => ({
    gameId: Number(String(h.gameCenterLink || '').split('/').pop()) || null,
    date: h.gameDate || null,
    period: h.periodDescriptor?.number ?? null,
    periodType: h.periodDescriptor?.periodType || null,
    timeS: clockS(h.timeInPeriod),
    mph: mph(h.shotSpeed),
    playerId: h.player?.id ?? (player ? id : null),
  })).filter((h) => h.mph != null && h.date && h.timeS != null)
  return {
    season, scope: player ? 'player' : 'team', id,
    avg: mph(d.avgShotSpeed), leagueAvg: mph(d.avgShotSpeed?.leagueAvg),
    top: mph(d.topShotSpeed), topLeague: mph(d.topShotSpeed?.leagueAvg),
    avgPct: d.avgShotSpeed?.percentile ?? null,
    name: (() => { const pl = d.topShotSpeed?.overlay?.player; return pl ? `${pl.firstName?.default || ''} ${pl.lastName?.default || ''}`.trim() || null : null })(),
    buckets: { over100: d.shotAttemptsOver100?.value ?? null, b90: d.shotAttempts90To100?.value ?? null, b80: d.shotAttempts80To90?.value ?? null, b70: d.shotAttempts70To80?.value ?? null },
    hardest,
  }
}
