// 🔥 HOT STICKS (2026-09-27, Donovan: "yes all that"). Server only.
// Every skater's last 5 and last 10 regular-season games -- goals, shots,
// ice time, power-play goals -- beside his season rate, so a man shooting
// more than usual shows up before the goals do. Measured, not modelled:
// nothing here is a LAMP score, nothing is written anywhere.
//
//   source   api.nhle.com/stats skater/summary with isGame=true: one row per
//            skater per game (goals, shots, timeOnIcePerGame, ppGoals), and
//            the same report aggregated for the season rate.
//   window   the season's games in the last WINDOW_DAYS days. A club plays
//            ~10 games in 3 weeks; a player whose 10th-last game is older
//            than the window shows the games he has in it (GP says so).
//   season   the active season's games; last season's final games, labelled
//            stale, until the new season has a game in it (the rule
//            Special teams and the board's legs follow).
//
// The per-game report is ~2 MB for a 5-week window, above Next's 2 MB fetch
// cache, so it is cached here in memory for 30 minutes instead, and the
// route's CDN cache covers the rest.
import { whichSeason } from './whichSeason'
import { previousSeasonId } from './season'
import { seasonLabel } from './reduce'
import { easternToday } from '../data'

const STATS = 'https://api.nhle.com/stats/rest/en'
const WINDOW_DAYS = 35
const TTL_MS = 30 * 60e3
const n = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Number(v) : 0)
const minusDays = (ymd, d) => new Date(Date.parse(`${ymd}T12:00:00Z`) - d * 864e5).toISOString().slice(0, 10)

async function report(cayenne, isGame) {
  const url = `${STATS}/skater/summary?isAggregate=false&isGame=${isGame}&start=0&limit=-1&cayenneExp=${encodeURIComponent(cayenne)}`
  const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`nhl stats ${res.status} skater/summary`)
  return (await res.json())?.data || []
}

/** Pure: per-game rows (+ season rows) -> one row per skater. Exported for tests. */
export function hotSticksFrom(gameRows, seasonRows) {
  const byPlayer = new Map()
  for (const r of gameRows) {
    if (!byPlayer.has(r.playerId)) byPlayer.set(r.playerId, [])
    byPlayer.get(r.playerId).push(r)
  }
  const season = new Map(seasonRows.map((r) => [r.playerId, r]))
  const sum = (games, k) => games.reduce((a, g) => a + n(g[k]), 0)
  const out = []
  for (const [id, games] of byPlayer) {
    if (games.length < 3) continue   // three games in the window, or there is no "lately" to show
    games.sort((a, b) => (a.gameDate < b.gameDate ? 1 : a.gameDate > b.gameDate ? -1 : b.gameId - a.gameId))
    const l5 = games.slice(0, 5)
    const l10 = games.slice(0, 10)
    const s = season.get(id)
    const sGp = n(s?.gamesPlayed)
    const sSogPg = sGp ? n(s.shots) / sGp : null
    const l5SogPg = sum(l5, 'shots') / l5.length
    out.push({
      id: String(id), name: games[0].skaterFullName, team: games[0].teamAbbrev, pos: games[0].positionCode,
      last: games[0].gameDate,
      gp5: l5.length, g5: sum(l5, 'goals'), sog5: sum(l5, 'shots'), sogPg5: l5SogPg,
      gp10: l10.length, g10: sum(l10, 'goals'), sog10: sum(l10, 'shots'), sogPg10: sum(l10, 'shots') / l10.length,
      toiPg10: sum(l10, 'timeOnIcePerGame') / l10.length, ppg10: sum(l10, 'ppGoals'),
      // [goals, shots] per game, newest first -- the page's little trend strip
      spark: l10.map((g) => [n(g.goals), n(g.shots)]),
      seasonGp: sGp || null, seasonG: s ? n(s.goals) : null, seasonSogPg: sSogPg,
      // Shots per game over his last five, minus his season rate. Only with
      // a season of at least 10 games behind it -- earlier, the "season" is
      // mostly the same five games and the difference means nothing.
      sogDelta: sSogPg != null && sGp >= 10 && l5.length >= 3 ? l5SogPg - sSogPg : null,
    })
  }
  return out
}

/** The date of a season's last regular-season game, from the per-game report. */
async function lastGameDate(seasonId) {
  const sort = encodeURIComponent(JSON.stringify([{ property: 'gameDate', direction: 'DESC' }]))
  const url = `${STATS}/skater/summary?isAggregate=false&isGame=true&start=0&limit=1&sort=${sort}&cayenneExp=${encodeURIComponent(`seasonId=${seasonId} and gameTypeId=2`)}`
  const res = await fetch(url, { cache: 'no-store', headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error(`nhl stats ${res.status} skater/summary`)
  return (await res.json())?.data?.[0]?.gameDate || null
}

const caches = new Map()   // needGp -> { at, key, body }

// needGp (2026-10-03, LAMP Power): a page that ranks WHOLE-SEASON samples
// (20+ games) stays on last season, labelled stale, until this season has a
// skater with that many games -- hot sticks itself flips at three games.
export async function readHotSticks({ needGp = 0 } = {}) {
  const today = easternToday()
  const s = await whichSeason()
  const cur = s.current || s.id
  const key = `${cur}:${today}:${needGp}`
  const cache = caches.get(needGp) || {}
  if (cache.body && cache.key === key && Date.now() - cache.at < TTL_MS) return cache.body
  const since = minusDays(today, WINDOW_DAYS)
  let id = cur
  let stale = false
  let rows = []
  const games = await report(`seasonId=${cur} and gameTypeId=2 and gameDate>="${since}"`, true)
  if (games.length) rows = hotSticksFrom(games, await report(`seasonId=${cur} and gameTypeId=2`, false))
  if (needGp && !rows.some((r) => (r.seasonGp || 0) >= needGp)) rows = []
  if (!rows.length) {
    // Before the new season has a skater with three games (opening week
    // included): last season's final five weeks, counted back from its own
    // last regular-season game date, labelled stale.
    id = previousSeasonId(cur)
    stale = true
    const lastDate = await lastGameDate(id)
    const old = lastDate ? await report(`seasonId=${id} and gameTypeId=2 and gameDate>="${minusDays(lastDate, WINDOW_DAYS)}"`, true) : []
    rows = old.length ? hotSticksFrom(old, await report(`seasonId=${id} and gameTypeId=2`, false)) : []
  }
  const body = { season: id, seasonLabel: seasonLabel(id), stale, current: cur, windowDays: WINDOW_DAYS, rows }
  caches.set(needGp, { at: Date.now(), key, body })
  return body
}
