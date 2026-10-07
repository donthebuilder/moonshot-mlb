// 🏒 LAMP PLAYER SPLITS -- the pure half (no 'use client', no network).
//
// MOONSHOT's splits (components/PlayerSplits.js) keep one raw row per game and
// let the browser group and AND-combine them (bots/player_splits.py games_raw).
// This is that idea for a skater: /api/lamp/splits returns his raw game rows
// for the season (regular season and playoffs), and everything below turns
// rows into split lines. The same functions run in the browser, the route and
// scripts/check-lamp-splits.mjs.
//
// WHAT THE GAME LOG CARRIES (verified against a real player/{id}/game-log
// response, 2026-10-06): gameId, gameDate, teamAbbrev, opponentAbbrev,
// homeRoadFlag, goals, assists, points, plusMinus, pim, powerPlayGoals,
// powerPlayPoints, shorthandedGoals, shorthandedPoints, gameWinningGoals,
// otGoals, shots, shifts, toi. NO period type (a game that ended in overtime
// is not marked) and NO day/night flag -- so there is no OT-game or day/night
// split here. otGoals is goals scored IN overtime, not "games that went to
// overtime"; using it as one would be inventing the split.
//
// Rest days are not in the log either. They come from the CLUB's schedule
// (every game his club played, final, regular season or playoffs), so a game
// he sat out still counts as a game his club played: rest = full days off
// since the club's previous played game, never since HIS previous game.

/** Under this many games a split row is flagged THIN. A season is ~82 games;
 *  a split under 20 is a quarter of it or less. */
export const THIN_GP = 20

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/

/** Days between two YYYY-MM-DD game days (noon UTC, so no DST edge). */
export const daysBetween = (a, b) => Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 864e5)

/** "18:16" -> 1096 seconds; anything else -> null. */
export function toiSeconds(s) {
  const m = /^(\d+):(\d{2})$/.exec(String(s || ''))
  return m ? Number(m[1]) * 60 + Number(m[2]) : null
}

/** Mon..Sun of the game's own calendar day (the log's gameDate is the ET day). */
export function dowOf(ymd) {
  const m = DAY_RE.exec(String(ymd || ''))
  if (!m) return null
  return DOW[new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], 12)).getUTCDay()]
}
export function monthOf(ymd) {
  const m = DAY_RE.exec(String(ymd || ''))
  return m ? MON[+m[2] - 1] : null
}

/**
 * Full days off before `date`, given every date his club PLAYED (any order).
 * 0 = back-to-back (played yesterday), null = no earlier game on the list.
 * A date equal to `date` is not "before" it.
 */
export function restBefore(playedDates, date) {
  let last = null
  for (const d of playedDates || []) if (d && d < date && (last == null || d > last)) last = d
  return last == null ? null : daysBetween(last, date) - 1
}

/**
 * The raw rows /api/lamp/splits sends: the log's rows (reduceGameLog shape)
 * plus his club's schedule facts. `schedules` is { [team]: [{ id, date, venue }] }
 * of PLAYED games only. Pure, so the check can feed it test schedules.
 */
export function buildGames(rows, gameType, schedules, arenaOf = () => null) {
  return (rows || []).map((r) => {
    const sched = schedules?.[r.team] || []
    const mine = sched.find((s) => s.id === r.gameId)
    const venue = mine?.venue || (r.home ? arenaOf(r.team)?.name : arenaOf(r.opp)?.name) || null
    return {
      gameId: r.gameId, date: r.date, team: r.team, opp: r.opp, home: r.home === true, type: gameType, venue,
      rest: sched.length ? restBefore(sched.map((s) => s.date), r.date) : undefined, // undefined = no schedule to read, left out of the rest rows
      g: r.g ?? 0, a: r.a ?? 0, pts: r.pts ?? 0, pm: r.plusMinus ?? 0, pim: r.pim ?? 0,
      ppg: r.ppg ?? 0, ppp: r.ppp ?? 0, shg: r.shg ?? 0, gwg: r.gwg ?? 0, shots: r.shots ?? 0,
      toi: toiSeconds(r.toi),
    }
  })
}

/** Sums rows into one split line. Every rate is computed from the sums. */
export function aggregate(games) {
  const gp = games.length
  let g = 0, a = 0, pts = 0, shots = 0, pm = 0, ppg = 0, shg = 0, toiSum = 0, toiN = 0
  for (const x of games) {
    g += x.g; a += x.a; pts += x.pts; shots += x.shots; pm += x.pm; ppg += x.ppg; shg += x.shg
    if (x.toi != null) { toiSum += x.toi; toiN += 1 }
  }
  return {
    gp, g, a, pts, shots, pm, ppg, shg,
    evg: g - ppg - shg,                                  // even strength = G - PP - SH
    shPct: shots ? g / shots : null,
    gPg: gp ? g / gp : null,
    ptsPg: gp ? pts / gp : null,
    toi: toiN ? toiSum / toiN : null,
    thin: gp < THIN_GP,
  }
}

const REST_LABEL = (r) => (r == null ? 'No earlier game' : r === 0 ? 'Back-to-back' : r === 1 ? '1 day rest' : '2+ days rest')
const typeLabel = (t) => (t === 3 ? 'Playoffs' : 'Regular season')

/** The pills. keyOf(game) -> the row label (null = the game is in no row). */
export const SPLIT_GROUPS = [
  { key: 'home_away', label: 'Home / Away', keyOf: (x) => (x.home ? 'Home' : 'Away'), order: ['Home', 'Away'] },
  { key: 'rest', label: 'Rest days', keyOf: (x) => (x.rest === undefined ? null : REST_LABEL(x.rest)), order: ['Back-to-back', '1 day rest', '2+ days rest', 'No earlier game'],
    caption: 'Full days off since his CLUB’s previous game, from the club’s schedule, so a game he sat out still counts as a day the club played. Back-to-back means the club played the night before.' },
  { key: 'day_of_week', label: 'Day of week', keyOf: (x) => dowOf(x.date), order: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
    caption: 'The game’s own calendar day (Eastern). Seven ways to cut one season is a few games each: treat the gaps as noise unless they are very large.' },
  { key: 'month', label: 'Month', keyOf: (x) => monthOf(x.date), order: null },
  { key: 'game_type', label: 'Game type', keyOf: (x) => typeLabel(x.type), order: ['Regular season', 'Playoffs'], needsBoth: true },
  { key: 'opp', label: 'vs opponent', keyOf: (x) => x.opp || null, order: null, sortBy: 'label',
    caption: 'One row per club he has faced this season: usually one to four games each.' },
  { key: 'venue', label: 'By rink', keyOf: (x) => x.venue || null, order: null, sortBy: 'gp',
    caption: 'The building the game was played in, from the league’s schedule (neutral-site games name their own rink). His home rink is every home game.' },
]

/** Row order for a group: its fixed order, else first appearance (oldest game first), else by GP or label. */
export function splitRows(games, group) {
  const by = new Map()
  const chrono = games.slice().sort((p, q) => (p.date < q.date ? -1 : p.date > q.date ? 1 : 0))
  for (const x of chrono) {
    const k = group.keyOf(x)
    if (k == null) continue
    if (!by.has(k)) by.set(k, [])
    by.get(k).push(x)
  }
  let keys = [...by.keys()]
  if (group.order) keys = group.order.filter((k) => by.has(k)).concat(keys.filter((k) => !group.order.includes(k)))
  else if (group.sortBy === 'gp') keys.sort((p, q) => by.get(q).length - by.get(p).length || p.localeCompare(q))
  else if (group.sortBy === 'label') keys.sort()
  return keys.map((k) => ({ _key: `${group.key}:${k}`, split: k, ...aggregate(by.get(k)) }))
}

/** Goals by strength: EV = G - PP - SH (the log has no EV column; this is the subtraction). */
export function strengthRows(games) {
  const t = aggregate(games)
  const share = (n) => (t.g ? n / t.g : null)
  return [
    { split: 'Even strength', g: t.evg },
    { split: 'Power play', g: t.ppg },
    { split: 'Short-handed', g: t.shg },
  ].map((r) => ({ _key: `strength:${r.split}`, ...r, gp: t.gp, share: share(r.g), gPg: t.gp ? r.g / t.gp : null, thin: t.gp < THIN_GP }))
}

/** The AND-combo: every filter that is set must hold. Values: home 'home'|'away', dow, month, type 2|3, rest '0'|'1'|'2+', opp, venue. */
export function filterGames(games, f = {}) {
  return games.filter((x) => (
    (!f.ha || (f.ha === 'home' ? x.home : !x.home)) &&
    (!f.dow || dowOf(x.date) === f.dow) &&
    (!f.month || monthOf(x.date) === f.month) &&
    (!f.type || String(x.type) === String(f.type)) &&
    (!f.rest || (f.rest === '2+' ? x.rest != null && x.rest >= 2 : x.rest === Number(f.rest))) &&
    (!f.opp || x.opp === f.opp)
  ))
}

export { DOW as DOW_ORDER }
