// 🏒 NHL FEED → SITE SHAPES. Pure functions, no browser globals, no
// 'use client' (rule 22): the route handlers under app/api/lamp run these on
// the server and the tabs read the reduced shape, so every number on a LAMP
// page traces to exactly one field of exactly one api-web.nhle.com payload.
// The source field is named beside every output key. If a key here has no
// source comment, it is derived from the ones above it and says so.
//
// The three facts the feed taught this file (probed 2026-09-25, see
// claude/lamp-architecture-2026-09-24.md):
//   · gameState is the truth about a game (FUT/PRE/LIVE/CRIT/OFF/FINAL) and
//     gameScheduleState (OK/PPD/SUSP/CNCL/TBD) is the truth about whether it
//     is even happening. The clock is never used to infer either.
//   · every payload carries its own season (`season` on a game, `seasonId`
//     on a standings row). Pages label THAT, never today's date — during
//     preseason standings/now is last season's final table.
//   · gameType 1/2/3 is preseason / regular season / playoffs, and it is
//     shown, always.

// ── vocabulary ──────────────────────────────────────────────────────────────

/** gameState → the three states the UI reasons about. Unknown stays unknown. */
const STATE = { FUT: 'pre', PRE: 'pre', LIVE: 'live', CRIT: 'live', OFF: 'final', FINAL: 'final' }
export function gameStateOf(raw) {
  return STATE[String(raw || '').toUpperCase()] || 'unknown'
}

export const GAME_TYPE = { 1: 'PRESEASON', 2: 'REGULAR SEASON', 3: 'PLAYOFFS' }
export const gameTypeLabel = (t) => GAME_TYPE[Number(t)] || 'UNKNOWN GAME TYPE'

/** 20262027 → "2026-27". Anything that is not an 8-digit season id comes back as given. */
export function seasonLabel(seasonId) {
  const s = String(seasonId || '')
  if (!/^\d{8}$/.test(s)) return s
  return `${s.slice(0, 4)}-${s.slice(6, 8)}`
}

const ORD = { 1: '1st', 2: '2nd', 3: '3rd' }
/** periodDescriptor → "1st" / "2nd" / "3rd" / "OT" / "2OT" / "SO". */
export function periodLabel(pd) {
  if (!pd) return ''
  const n = Number(pd.number) || 0
  const type = String(pd.periodType || 'REG').toUpperCase()
  const reg = Number(pd.maxRegulationPeriods) || 3
  if (type === 'SO') return 'SO'
  if (type === 'OT') { const k = n - reg; return k > 1 ? `${k}OT` : 'OT' }
  return ORD[n] || `${n}th`
}

/** "FINAL", "FINAL/OT", "FINAL/SO" — from the last period actually played. */
export function finalLabel(lastPeriodType) {
  const t = String(lastPeriodType || 'REG').toUpperCase()
  return t === 'SO' ? 'FINAL/SO' : t === 'OT' ? 'FINAL/OT' : 'FINAL'
}

/**
 * One line for a score row. Pre-game returns null on purpose: the start time
 * is formatted on the client in the viewer's own time zone, never here.
 *   live         → "2nd · 12:34"  |  "END 1st" (intermission)
 *   final        → "FINAL" / "FINAL/OT" / "FINAL/SO"
 *   postponed…   → "POSTPONED" / "SUSPENDED" / "CANCELLED" / "TIME TBD"
 */
export function statusLine(g) {
  const sched = String(g.gameScheduleState || 'OK').toUpperCase()
  if (sched === 'PPD') return 'POSTPONED'
  if (sched === 'SUSP') return 'SUSPENDED'
  if (sched === 'CNCL') return 'CANCELLED'
  if (sched === 'TBD') return 'TIME TBD'
  const state = gameStateOf(g.gameState)
  const pl = periodLabel(g.periodDescriptor)
  if (state === 'final') return finalLabel(g.gameOutcome?.lastPeriodType || g.periodDescriptor?.periodType)
  if (state === 'live') {
    if (g.clock?.inIntermission) return `END ${pl}`
    return `${pl} · ${g.clock?.timeRemaining || ''}`.trim()
  }
  return null
}

// ── pieces ──────────────────────────────────────────────────────────────────

const str = (v) => (v && typeof v === 'object' ? String(v.default ?? '') : String(v ?? ''))
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null }

/** A team block as it appears on score / schedule / landing / boxscore. */
export function reduceTeam(t) {
  if (!t) return null
  return {
    id: num(t.id),                                  // team.id
    abbrev: str(t.abbrev),                          // team.abbrev
    name: str(t.commonName) || str(t.name),         // team.commonName.default (schedule/landing) or team.name.default (score)
    place: str(t.placeName),                        // team.placeName.default (absent on score/now)
    score: num(t.score),                            // team.score (absent pre-game → null, never 0)
    sog: num(t.sog),                                // team.sog
    logo: str(t.logo) || null,                      // team.logo (light SVG)
    darkLogo: str(t.darkLogo) || null,              // team.darkLogo
    record: str(t.record) || null,                  // team.record ("2-1-0") where the feed gives it
  }
}

/** One goal off score/now `goals[]` or landing `summary.scoring[].goals[]`. */
export function reduceGoal(goal, pd) {
  const p = goal.periodDescriptor || pd
  return {
    period: num(p?.number),                         // periodDescriptor.number
    periodType: str(p?.periodType) || 'REG',        // periodDescriptor.periodType
    periodLabel: periodLabel(p),                    // derived
    time: str(goal.timeInPeriod),                   // timeInPeriod ("04:02", elapsed)
    team: str(goal.teamAbbrev),                     // teamAbbrev.default
    isHome: goal.isHome === true,                   // isHome (landing only; score/now omits it)
    strength: str(goal.strength) || 'ev',           // strength: ev / pp / sh
    modifier: str(goal.goalModifier) || 'none',     // goalModifier: none / empty-net / penalty-shot / own-goal …
    shotType: str(goal.shotType) || null,           // shotType (landing only)
    situation: str(goal.situationCode) || null,     // situationCode ("1551" = 5v5)
    scorer: {
      id: num(goal.playerId),                       // playerId
      name: str(goal.name),                         // name.default ("M. Michkov")
      first: str(goal.firstName),                   // firstName.default
      last: str(goal.lastName),                     // lastName.default
      headshot: str(goal.headshot || goal.mugshot) || null, // headshot (landing) / mugshot (score)
      goalsToDate: num(goal.goalsToDate),           // goalsToDate (season running total)
    },
    assists: (goal.assists || []).map((a) => ({
      id: num(a.playerId),                          // assists[].playerId
      name: str(a.name),                            // assists[].name.default
      assistsToDate: num(a.assistsToDate),          // assists[].assistsToDate
    })),
    awayScore: num(goal.awayScore),                 // awayScore (running, after this goal)
    homeScore: num(goal.homeScore),                 // homeScore
  }
}

/** A game as it appears on score/{date} and schedule/{date}. */
export function reduceGame(g) {
  const state = gameStateOf(g.gameState)
  return {
    id: num(g.id),                                  // id (10 digits: season(4) type(2) number(4))
    season: num(g.season),                          // season (20262027)
    seasonLabel: seasonLabel(g.season),             // derived
    gameType: num(g.gameType),                      // gameType 1/2/3
    gameTypeLabel: gameTypeLabel(g.gameType),       // derived
    date: str(g.gameDate),                          // gameDate (ET calendar day)
    startUtc: str(g.startTimeUTC),                  // startTimeUTC (ISO)
    venue: str(g.venue),                            // venue.default
    neutralSite: g.neutralSite === true,            // neutralSite
    state,                                          // derived from gameState
    rawState: str(g.gameState),                     // gameState, untouched, for anyone auditing
    scheduleState: str(g.gameScheduleState) || 'OK',// gameScheduleState
    away: reduceTeam(g.awayTeam),                   // awayTeam
    home: reduceTeam(g.homeTeam),                   // homeTeam
    period: num(g.periodDescriptor?.number),        // periodDescriptor.number
    periodType: str(g.periodDescriptor?.periodType) || null, // periodDescriptor.periodType
    periodLabel: g.periodDescriptor ? periodLabel(g.periodDescriptor) : null, // derived
    clock: str(g.clock?.timeRemaining) || null,     // clock.timeRemaining
    clockRunning: g.clock?.running === true,        // clock.running
    intermission: g.clock?.inIntermission === true, // clock.inIntermission
    outcome: str(g.gameOutcome?.lastPeriodType) || null, // gameOutcome.lastPeriodType (REG/OT/SO), finals only
    statusLine: statusLine(g),                      // derived (null pre-game)
    goals: (g.goals || []).map((x) => reduceGoal(x)), // goals[] (score/now carries them; schedule does not)
    gameCenter: str(g.gameCenterLink) || null,      // gameCenterLink (nhl.com path)
  }
}

// ── whole payloads ──────────────────────────────────────────────────────────

/** score/{date} → the day. */
export function reduceScoreDay(p) {
  const games = (p?.games || []).map(reduceGame)
  const count = (s) => games.filter((g) => g.state === s).length
  return {
    date: str(p?.currentDate),                      // currentDate
    prev: str(p?.prevDate) || null,                 // prevDate (the previous day WITH games)
    next: str(p?.nextDate) || null,                 // nextDate
    week: (p?.gameWeek || []).map((d) => ({ date: str(d.date), n: num(d.numberOfGames) })), // gameWeek[]
    games,
    live: count('live'), final: count('final'), pre: count('pre'), // derived
    // the season and game type this day belongs to, from the games themselves
    season: games[0]?.season ?? null,
    gameTypes: [...new Set(games.map((g) => g.gameType).filter((x) => x != null))],
  }
}

/** schedule/{date} → the week plus the season's boundary dates. */
export function reduceScheduleWeek(p) {
  return {
    prevStart: str(p?.previousStartDate) || null,   // previousStartDate
    nextStart: str(p?.nextStartDate) || null,       // nextStartDate
    preSeasonStart: str(p?.preSeasonStartDate) || null,       // preSeasonStartDate
    regularSeasonStart: str(p?.regularSeasonStartDate) || null, // regularSeasonStartDate
    regularSeasonEnd: str(p?.regularSeasonEndDate) || null,   // regularSeasonEndDate
    playoffEnd: str(p?.playoffEndDate) || null,     // playoffEndDate
    games: num(p?.numberOfGames),                   // numberOfGames (the week)
    days: (p?.gameWeek || []).map((d) => ({
      date: str(d.date),                            // gameWeek[].date
      dayAbbrev: str(d.dayAbbrev),                  // gameWeek[].dayAbbrev
      n: num(d.numberOfGames),                      // gameWeek[].numberOfGames
      games: (d.games || []).map(reduceGame),
    })),
  }
}

const rec = (w, l, otl) => ({ w: num(w), l: num(l), otl: num(otl) })

/** standings/{date} → rows, plus the season the rows belong to (the trap). */
export function reduceStandings(p) {
  const rows = (p?.standings || []).map((r) => ({
    abbrev: str(r.teamAbbrev),                      // teamAbbrev.default
    name: str(r.teamName),                          // teamName.default
    nickname: str(r.teamCommonName),                // teamCommonName.default
    place: str(r.placeName),                        // placeName.default
    logo: str(r.teamLogo) || null,                  // teamLogo
    conf: str(r.conferenceAbbrev),                  // conferenceAbbrev E/W
    confName: str(r.conferenceName),                // conferenceName
    div: str(r.divisionAbbrev),                     // divisionAbbrev A/M/C/P
    divName: str(r.divisionName),                   // divisionName
    gp: num(r.gamesPlayed),                         // gamesPlayed
    w: num(r.wins), l: num(r.losses), otl: num(r.otLosses), // wins / losses / otLosses
    pts: num(r.points),                             // points
    pPct: num(r.pointPctg),                         // pointPctg (0-1)
    rw: num(r.regulationWins),                      // regulationWins (first tiebreak)
    row: num(r.regulationPlusOtWins),               // regulationPlusOtWins
    gf: num(r.goalFor), ga: num(r.goalAgainst),     // goalFor / goalAgainst
    diff: num(r.goalDifferential),                  // goalDifferential
    l10: rec(r.l10Wins, r.l10Losses, r.l10OtLosses),// l10Wins / l10Losses / l10OtLosses
    streak: r.streakCode ? `${str(r.streakCode)}${num(r.streakCount) ?? ''}` : null, // streakCode + streakCount
    home: rec(r.homeWins, r.homeLosses, r.homeOtLosses),
    road: rec(r.roadWins, r.roadLosses, r.roadOtLosses),
    so: rec(r.shootoutWins, r.shootoutLosses, null),// shootoutWins / shootoutLosses
    divRank: num(r.divisionSequence),               // divisionSequence
    confRank: num(r.conferenceSequence),            // conferenceSequence
    wcRank: num(r.wildcardSequence),                // wildcardSequence (0 = a division top-3)
    leagueRank: num(r.leagueSequence),              // leagueSequence
    clinch: str(r.clinchIndicator) || null,         // clinchIndicator (x, y, z, p …) or absent
    seasonId: num(r.seasonId),                      // seasonId — THE row's season
    date: str(r.date),                              // date the row is as-of
  }))
  const seasonId = rows[0]?.seasonId ?? null
  return {
    asOf: str(p?.standingsDateTimeUtc) || null,     // standingsDateTimeUtc
    wildCard: p?.wildCardIndicator === true,        // wildCardIndicator
    seasonId,
    seasonLabel: seasonId ? seasonLabel(seasonId) : null,
    date: rows[0]?.date || null,
    rows,
  }
}

/** gamecenter/{id}/landing (+ right-rail) → the game page. */
export function reduceGameDetail(L, R) {
  const head = reduceGame({ ...L, goals: [] })
  const goals = (L?.summary?.scoring || []).flatMap((per) =>
    (per.goals || []).map((g) => reduceGoal(g, per.periodDescriptor)))
  const penalties = (L?.summary?.penalties || []).flatMap((per) =>
    (per.penalties || []).map((x) => ({
      period: num(per.periodDescriptor?.number),    // penalties[].periodDescriptor.number
      periodLabel: periodLabel(per.periodDescriptor),
      time: str(x.timeInPeriod),                    // timeInPeriod
      team: str(x.teamAbbrev),                      // teamAbbrev.default
      type: str(x.type),                            // type: MIN / MAJ / BEN / MIS / GM / MAT / PS
      minutes: num(x.duration),                     // duration
      desc: str(x.descKey).replace(/-/g, ' '),      // descKey ("holding", "too-many-men-on-the-ice")
      by: x.committedByPlayer
        ? `${str(x.committedByPlayer.firstName)} ${str(x.committedByPlayer.lastName)}`.trim() // committedByPlayer
        : null,
      byNumber: num(x.committedByPlayer?.sweaterNumber),
      drawnBy: x.drawnBy ? `${str(x.drawnBy.firstName)} ${str(x.drawnBy.lastName)}`.trim() : null, // drawnBy
    })))
  const threeStars = (L?.summary?.threeStars || []).map((s) => ({
    star: num(s.star), id: num(s.playerId), team: str(s.teamAbbrev), name: str(s.name), // threeStars[]
    number: num(s.sweaterNo), pos: str(s.position), headshot: str(s.headshot) || null,
    goals: num(s.goals), assists: num(s.assists), points: num(s.points),
    // goalies carry these instead of the skater line; either set may be absent
    savePctg: num(s.savePctg), goalsAgainstAverage: num(s.goalsAgainstAverage),
  }))
  const byPeriod = (arr) => (arr || []).map((x) => ({
    label: periodLabel(x.periodDescriptor), away: num(x.away), home: num(x.home),
  }))
  const stats = {}
  for (const s of R?.teamGameStats || []) stats[str(s.category)] = { away: s.awayValue, home: s.homeValue } // teamGameStats[]
  return {
    ...head,
    venueLocation: str(L?.venueLocation) || null,   // venueLocation.default
    shootoutInUse: L?.shootoutInUse === true,       // shootoutInUse
    goals, penalties, threeStars,
    linescore: byPeriod(R?.linescore?.byPeriod),    // right-rail linescore.byPeriod
    linescoreTotals: R?.linescore?.totals ? { away: num(R.linescore.totals.away), home: num(R.linescore.totals.home) } : null,
    shotsByPeriod: byPeriod(R?.shotsByPeriod),      // right-rail shotsByPeriod
    teamStats: stats,                               // sog, faceoffWinningPctg, faceoffWins, powerPlay ("2/4"), powerPlayPctg, pim, hits, blockedShots, giveaways, takeaways
    seasonSeries: (R?.seasonSeries || []).map((g) => ({ // right-rail seasonSeries[] — this season's meetings
      id: num(g.id), state: gameStateOf(g.gameState), date: str(g.gameDate),
      away: { abbrev: str(g.awayTeam?.abbrev), score: num(g.awayTeam?.score) },
      home: { abbrev: str(g.homeTeam?.abbrev), score: num(g.homeTeam?.score) },
    })),
  }
}

/** standings-season → the season whose table should be current, i.e. the newest id. */
export function reduceStandingsSeasons(p) {
  const seasons = (p?.seasons || []).map((x) => ({
    id: num(x.id),                                  // seasons[].id (20262027)
    standingsStart: str(x.standingsStart) || null,  // seasons[].standingsStart — first day a table exists
    standingsEnd: str(x.standingsEnd) || null,      // seasons[].standingsEnd
    wildcard: x.wildcardInUse === true,             // seasons[].wildcardInUse
  })).filter((x) => x.id)
  seasons.sort((a, b) => b.id - a.id)
  return { current: seasons[0] || null, seasons }
}
