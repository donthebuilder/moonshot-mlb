// MLB'S STATE, ONE ANSWER (2026-10-21, BATCH-MLB-OFFSEASON B1, claude/BATCH-MLB-OFFSEASON-PLAN-2026-10-20.txt). Donovan, Oct 20: "fall ball, spring
// training and simulators, but until the playoffs are over, normal programming." Master instructions §7: each sport is in one state, PRESEASON ·
// REGULAR · POSTSEASON · OFFSEASON, and pages, pushes, jobs and empty states read it; no page works out its own.
//
// From MLB's own schedule, never a typed date:
//   REGULAR / POSTSEASON  a regular-season or postseason game within LOOK days either side of today (the season guard's window, lib/dash/seasonGuard.js,
//                         so the site turns over with the jobs: about three days after the last World Series game). Which one: the nearest such game's type.
//   PRESEASON             no such game, a spring training game (gameType S) in the window: lane SPRING
//   OFFSEASON             neither: lane FALL while the Arizona Fall League (sportId 17, league 119) has a game within the next week or the last day, else none
// Fails CLOSED to "unknown" (null): a caller that cannot read the schedule keeps today's page. Works in the browser and on the server (statsapi is public,
// the same host lib/mlbSlateState.js and lib/mlbNext.js read). One read per hour per day key.
//
// ?mlbPhase=offseason|regular|postseason|preseason on the page forces the answer for a look (lib/mlb/usePhase.js), nothing else.
export const LOOK = 3
export const FALL = { sportId: 17, leagueId: 119, name: 'Arizona Fall League' }
export const PHASES = ['PRESEASON', 'REGULAR', 'POSTSEASON', 'OFFSEASON']
const POST = new Set(['F', 'D', 'L', 'W'])
const shift = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
const games = (body) => (body?.dates || []).flatMap((d) => (d.games || []).map((g) => ({ ...g, date: d.date })))

const side = (t) => ({ id: t?.team?.id ?? null, name: t?.team?.name || '', abbrev: t?.team?.abbreviation || '' })
/** A schedule game -> { pk, date, start, away, home, state }. Pure. */
export const gameRow = (g) => ({ pk: g.gamePk, date: g.date, start: g.gameDate || null, away: side(g.teams?.away), home: side(g.teams?.home), state: g.status?.abstractGameState || '' })

/**
 * The state from the schedule bodies. `mlb` = sportId 1 (R,F,D,L,W,S) over today±LOOK; `fall` = the fall league over today-1..today+7 (may be null
 * when it was not asked). Null when `mlb` is unreadable. Pure.
 */
export function phaseFrom({ today, mlb, fall = null }) {
  if (!mlb || !Array.isArray(mlb.dates)) return null
  const all = games(mlb)
  const season = all.filter((g) => g.gameType === 'R' || POST.has(g.gameType))
  if (season.length) {
    const near = season.slice().sort((a, b) => Math.abs(Date.parse(a.date) - Date.parse(today)) - Math.abs(Date.parse(b.date) - Date.parse(today)) || String(b.date).localeCompare(a.date))[0]
    return { phase: POST.has(near.gameType) ? 'POSTSEASON' : 'REGULAR', lane: null, today, laneGames: [], next: null }
  }
  const spring = all.filter((g) => g.gameType === 'S')
  if (spring.length) {
    const ahead = spring.filter((g) => g.date >= today).sort((a, b) => String(a.date).localeCompare(b.date))
    return { phase: 'PRESEASON', lane: 'SPRING', today, laneGames: spring.filter((g) => g.date === today).map(gameRow), next: ahead[0] ? gameRow(ahead[0]) : null }
  }
  const fg = fall && Array.isArray(fall.dates) ? games(fall) : []
  const ahead = fg.filter((g) => g.date >= today).sort((a, b) => String(a.date).localeCompare(b.date))
  const live = fg.length > 0
  return { phase: 'OFFSEASON', lane: live ? 'FALL' : null, today, laneGames: fg.filter((g) => g.date === today).map(gameRow), next: ahead.find((g) => g.date > today) ? gameRow(ahead.find((g) => g.date > today)) : null }
}

const FIELDS = 'dates,date,games,gamePk,gameType,gameDate,status,abstractGameState,teams,away,home,team,id,name,abbreviation'
const _cache = new Map()   // today -> { at, promise }
const TTL = 3600e3
const read = async (url, fetcher) => {
  try {
    const r = await fetcher(url, { signal: AbortSignal.timeout(8000) })
    return r.ok ? await r.json() : null
  } catch { return null }
}
const readFall = (key, fetcher) => read(`https://statsapi.mlb.com/api/v1/schedule?sportId=${FALL.sportId}&leagueId=${FALL.leagueId}&startDate=${shift(key, -1)}&endDate=${shift(key, 7)}&fields=${FIELDS}`, fetcher)
/** The fall lane alone for `today` (the forced preview's lane): the OFFSEASON answer with a real fall schedule, or null when unreadable. */
export async function fallLane(today, { fetcher = (u, o) => fetch(u, o) } = {}) {
  const fall = await readFall(today, fetcher)
  return fall ? phaseFrom({ today, mlb: { dates: [] }, fall }) : null
}

/** MLB's state for `today` (an Eastern date): { phase, lane, laneGames, next } or null when the schedule can't be read. */
export function mlbPhase(today, { fetcher = (u, o) => fetch(u, o) } = {}) {
  const key = String(today || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return Promise.resolve(null)
  const hit = _cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.promise
  const S = 'https://statsapi.mlb.com/api/v1/schedule'
  const promise = (async () => {
    const mlb = await read(`${S}?sportId=1&gameType=R,F,D,L,W,S&startDate=${shift(key, -LOOK)}&endDate=${shift(key, LOOK)}&fields=${FIELDS}`, fetcher)
    const first = phaseFrom({ today: key, mlb })
    if (!first || first.phase !== 'OFFSEASON') return first
    return phaseFrom({ today: key, mlb, fall: await readFall(key, fetcher) })
  })()
  if (_cache.size > 10) _cache.clear()
  _cache.set(key, { at: Date.now(), promise })
  promise.then((v) => { if (v == null) _cache.delete(key) })
  return promise
}
export const _resetPhaseForTests = () => _cache.clear()

/** A forced answer from a page's query (?mlbPhase=offseason), or null. Pure. */
export function forcedPhase(search, today) {
  const m = /[?&]mlbPhase=([a-z]+)/i.exec(String(search || ''))
  const p = m ? m[1].toUpperCase() : null
  return p && PHASES.includes(p) ? { phase: p, lane: null, today, laneGames: [], next: null, forced: true } : null
}
