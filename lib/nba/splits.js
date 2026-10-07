// 🏀 BUCKETS PLAYER SPLITS -- the pure half (no 'use client', no network).
//
// MOONSHOT's splits and LAMP's (lib/nhl/splits.js) keep one raw row per game and group
// them in the browser; this is that for a basketball player. Everything below turns his
// game-log rows into split lines. The same functions run in the browser, the player route
// and scripts/check-nba-splits.mjs.
//
// WHAT THE ESPN GAME LOG CARRIES (read 2026-10-07, athletes/{id}/gamelog): game id, date,
// home or away (atVs), opponent, W/L and score, minutes, points, rebounds, assists, steals,
// blocks, turnovers, fouls, FG / 3PT / FT made-attempted. It does NOT carry who started,
// and a game he did not play is not in it. So there is NO starter/bench split and no
// "with / without a teammate" split: the page says so instead of guessing. Rest days come
// from the CLUB's schedule (every game his club played), so a game he sat out still counts
// as a day the club played: rest = full days off since the club's previous game.
import { restBefore, dowOf, monthOf } from '../nhl/splits'
import { easternDate } from '../data'

/** Under this many games a split row is flagged THIN (a season is 82 games). The Last N rows are small by design and not flagged. */
export const THIN_GP = 15
export const DOW_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const n0 = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const isNum = (v) => v != null && Number.isFinite(Number(v))

/** The ET calendar day of a game from the log's ISO tip time. */
export const dayOf = (iso) => { const t = Date.parse(iso); return Number.isFinite(t) ? easternDate(t) : '' }

/**
 * His raw game rows -> split-ready games.
 * rows: reduceGamelog rows tagged `s`. clubGames: { [season]: [{ id, date }] } his club's FINAL games that season
 * (the ET day). A game whose id is not on his club's list (he was with another club) has no rest value (undefined),
 * and so does every game when no schedule was read: left out of the rest rows, never guessed.
 */
export function buildGames(rows, clubGames = {}) {
  return (rows || [])
    .filter((r) => r && isNum(r.min) && Number(r.min) > 0)   // a game he did not play is not a game of his
    .map((r) => {
      const date = dayOf(r.date)
      const club = clubGames?.[r.s] || []
      const mine = club.some((c) => String(c.id) === String(r.id))
      return {
        id: String(r.id), s: r.s, date, opp: r.opp || null, home: r.atVs === 'vs', win: r.result === 'W' ? true : r.result === 'L' ? false : null,
        type: r.seasonType === 3 ? 3 : 2,
        rest: club.length && mine && date ? restBefore(club.map((c) => c.date), date) : undefined,
        min: n0(r.min), pts: n0(r.pts), reb: n0(r.reb), ast: n0(r.ast), stl: n0(r.stl), blk: n0(r.blk), to: n0(r.to),
        fgm: n0(r.fgm), fga: n0(r.fga), tpm: n0(r.tpm), tpa: n0(r.tpa), ftm: n0(r.ftm), fta: n0(r.fta),
      }
    })
}

/** Sums games into one split line. Every rate is computed from the sums. */
export function aggregate(games, { thinBelow = THIN_GP } = {}) {
  const gp = games.length
  const t = { min: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, to: 0, fgm: 0, fga: 0, tpm: 0, tpa: 0, ftm: 0, fta: 0 }
  let w = 0
  for (const x of games) { for (const k of Object.keys(t)) t[k] += x[k]; if (x.win === true) w += 1 }
  const per = (v) => (gp ? v / gp : null)
  return {
    gp, wins: w,
    min: per(t.min), pts: per(t.pts), reb: per(t.reb), ast: per(t.ast), stl: per(t.stl), blk: per(t.blk), to: per(t.to),
    fga: per(t.fga), tpm: per(t.tpm), tpa: per(t.tpa), fta: per(t.fta),
    fgPct: t.fga ? t.fgm / t.fga : null, tpPct: t.tpa ? t.tpm / t.tpa : null, ftPct: t.fta ? t.ftm / t.fta : null,
    ptsPer36: t.min ? (t.pts * 36) / t.min : null,
    thin: gp < thinBelow,
  }
}

const REST_LABEL = (r) => (r == null ? 'No earlier game' : r === 0 ? 'Back-to-back' : r === 1 ? '1 day rest' : '2+ days rest')
const minBucket = (m) => (m < 20 ? 'Under 20 min' : m < 30 ? '20-29 min' : m < 36 ? '30-35 min' : '36+ min')

/** The pills. keyOf(game) -> the row label (null = the game is in no row). */
export const SPLIT_GROUPS = [
  { key: 'home_away', label: 'Home / Away', keyOf: (x) => (x.home ? 'Home' : 'Away'), order: ['Home', 'Away'] },
  { key: 'result', label: 'Win / Loss', keyOf: (x) => (x.win === true ? 'Win' : x.win === false ? 'Loss' : null), order: ['Win', 'Loss'],
    caption: 'Whether his club won the game. A big night in a blowout loss and a quiet one in a blowout win both sit in these rows.' },
  { key: 'rest', label: 'Rest days', keyOf: (x) => (x.rest === undefined ? null : REST_LABEL(x.rest)), order: ['Back-to-back', '1 day rest', '2+ days rest', 'No earlier game'],
    caption: 'Full days off since his CLUB’s previous game, from the club’s schedule. Back-to-back means the club played the night before. A game from a season he was with another club has no rest value and is left out.' },
  { key: 'minutes', label: 'Minutes played', keyOf: (x) => minBucket(x.min), order: ['Under 20 min', '20-29 min', '30-35 min', '36+ min'],
    caption: 'Games grouped by the minutes he played in them. Minutes are an outcome (a blowout trims them), so read this as how he scores on a given load, not as a prediction.' },
  { key: 'opp', label: 'vs opponent', keyOf: (x) => x.opp || null, order: null, sortBy: 'gp',
    caption: 'One row per club he has faced in this window: usually one to four games each.' },
  { key: 'day_of_week', label: 'Day of week', keyOf: (x) => dowOf(x.date), order: DOW_ORDER,
    caption: 'The game’s own calendar day (Eastern). Seven ways to cut one season is a few games each: treat the gaps as noise unless they are very large.' },
  { key: 'month', label: 'Month', keyOf: (x) => monthOf(x.date), order: null },
  { key: 'game_type', label: 'Game type', keyOf: (x) => (x.type === 3 ? 'Playoffs' : 'Regular season'), order: ['Regular season', 'Playoffs'], needsBoth: true },
]

/** The "Last N" rows: his newest N games in the window (not THIN-flagged; small by design). */
export function recentRows(games, ns = [5, 10]) {
  const newest = games.slice().sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0))
  return ns.filter((k) => newest.length >= k).map((k) => ({ _key: `last:${k}`, split: `Last ${k}`, ...aggregate(newest.slice(0, k), { thinBelow: 0 }) }))
}

/** Row order for a group: its fixed order, else first appearance (oldest game first), else by GP. */
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
  return keys.map((k) => ({ _key: `${group.key}:${k}`, split: k, ...aggregate(by.get(k)) }))
}

/** The AND-combo: every filter that is set must hold. ha 'home'|'away', result 'W'|'L', rest '0'|'1'|'2+', opp, mins 'u20'|'20'|'30'|'36'. */
export function filterGames(games, f = {}) {
  return games.filter((x) => (
    (!f.ha || (f.ha === 'home' ? x.home : !x.home)) &&
    (!f.result || (f.result === 'W' ? x.win === true : x.win === false)) &&
    (!f.rest || (f.rest === '2+' ? x.rest != null && x.rest >= 2 : x.rest === Number(f.rest))) &&
    (!f.opp || x.opp === f.opp) &&
    (!f.mins || minBucket(x.min) === ({ u20: 'Under 20 min', 20: '20-29 min', 30: '30-35 min', 36: '36+ min' })[f.mins])
  ))
}
