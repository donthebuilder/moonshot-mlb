// LIST POSTS, POSTED (BATCH-LIST-POSTS steps 1-2, 2026-09-27). Server only.
//
// MOONSHOT's season wrap: from the morning after the regular season's last
// game, for WRAP_DAYS days, one list a day (the (day, 'list_mlb') claim is
// the cap), in MLB_WRAP order, skipping any list already posted this wrap or
// too short to post. Each list is re-checked against the source right before
// the claim (recheckMlbList); a list under two verified rows moves on to the
// next. Through postOnce (lib/dash/longshotsPost.js): POST_KINDS_ON, the claim,
// Discord + X, no link.
import { postOnce } from '../dash/longshotsPost'
import { listText } from './shape'
import { tdEveryGameList, hundredStreakList, recheckNflList } from './nfl'
import { nflSlatePaths, fetchNfl } from '../nfl/dataSource'
import { ironManList, goalStreakList, pointEveryGameList, recheckNhlList, nhlSeasonStarted } from './nhl'
import { MLB_WRAP, ROUNDS, playedEveryGameList, hrClubList, powerSpeedList, calledSeasonList, recheckMlbList, postHrLeadersList, firstPostHomersList, recheckPostList } from './mlb'

const WRAP_DAYS = 10
const shift = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
const api = (p) => fetch(`https://statsapi.mlb.com/api/v1${p}`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)

/** Pure: the regular season's last day, and whether every game of it is settled. */
export function regularSeasonEnd(body) {
  const games = (body?.dates || []).flatMap((d) => (d.games || []).map((g) => ({ date: d.date, state: g?.status?.detailedState || '', abstract: g?.status?.abstractGameState || '' })))
  if (!games.length) return null
  const played = games.filter((g) => !/Cancel|Postpon/i.test(g.state))
  const last = played.map((g) => g.date).sort().pop() || null
  const settled = games.every((g) => g.abstract === 'Final' || /Cancel|Postpon/i.test(g.state))
  return { last, settled }
}

/** Pure: the next list to post -- the first in `order` not already posted. */
export function nextInRotation(order, posted) {
  return order.filter((k) => !posted.has(k))
}

// The season-end read is held an hour: this runs from a per-minute tick.
let _end = { season: null, at: 0, end: null }
async function seasonEnd(season) {
  if (_end.season === season && Date.now() - _end.at < 3600e3) return _end.end
  const end = regularSeasonEnd(await api(`/schedule?sportId=1&season=${season}&gameType=R&fields=dates,date,games,status,detailedState,abstractGameState`))
  if (end) _end = { season, at: Date.now(), end }
  return end
}

// THE POSTSEASON'S ROUNDS: { code, name, from, to, settled } for each round
// with games so far (StatsAPI schedule by gameType), held an hour.
let _rounds = { season: null, at: 0, rounds: null }
async function roundsOf(season) {
  if (_rounds.season === season && Date.now() - _rounds.at < 3600e3) return _rounds.rounds
  const j = await api(`/schedule?sportId=1&season=${season}&gameType=F,D,L,W&fields=dates,date,games,gameType,status,detailedState,abstractGameState`)
  if (!j) return null
  const rounds = roundsFrom(j)
  _rounds = { season, at: Date.now(), rounds }
  return rounds
}

/** Pure: a postseason schedule body -> the rounds, each with its date span and whether every game is settled. */
export function roundsFrom(body) {
  const by = new Map()
  for (const d of body?.dates || []) for (const g of d.games || []) {
    const r = by.get(g.gameType) || { code: g.gameType, from: d.date, to: d.date, settled: true }
    if (d.date < r.from) r.from = d.date
    if (d.date > r.to) r.to = d.date
    if (!(g?.status?.abstractGameState === 'Final' || /Cancel|Postpon/i.test(g?.status?.detailedState || ''))) r.settled = false
    by.set(g.gameType, r)
  }
  return ROUNDS.filter(([c]) => by.has(c)).map(([c, name]) => ({ ...by.get(c), name }))
}

/**
 * Pure: the postseason lists due on `day` -- for a settled round, the leaders
 * the morning after its last game, its first career homers the morning after
 * that. Each key names its round so it is posted once.
 */
export function postListsDue(rounds, day) {
  const out = []
  for (const r of rounds || []) {
    if (!r.settled) continue
    if (day === shift(r.to, 1) || day === shift(r.to, 2)) {
      out.push({ key: `post_hr_leaders:${r.code}`, round: r })
      out.push({ key: `first_post_hr:${r.code}`, round: r })
    }
  }
  return out
}

export async function postMlbListOnce(db, day) {
  const season = Number(String(day).slice(0, 4))
  if (Number(String(day).slice(5, 7)) < 9) return 'not-the-wrap'   // the wrap and the postseason are Sept-Nov; no schedule read before
  const end = await seasonEnd(season)
  if (!end?.last || !end.settled) return 'season-not-over'
  if (day <= end.last) return 'not-the-wrap'
  const { data: done } = await db.from('homer_feed_posts').select('payload').eq('kind', 'list_mlb').gt('day', end.last)
  const posted = new Set((done || []).map((r) => r?.payload?.list).filter(Boolean))
  // The postseason list due today first (it is about last night), then the wrap.
  const post = postListsDue(await roundsOf(season), day).filter((p) => !posted.has(p.key))
  const wrap = day <= shift(end.last, WRAP_DAYS) ? nextInRotation(MLB_WRAP, posted) : []
  if (!post.length && !wrap.length) return 'nothing-due'
  const BUILD = {
    played_every_game: () => playedEveryGameList(season),
    hr_club: () => hrClubList(season),
    power_speed: () => powerSpeedList(season),
    called_season: () => calledSeasonList(db, season, end.last),
  }
  const candidates = [
    ...post.map((p) => ({
      key: p.key,
      build: () => (p.key.startsWith('post_hr_leaders') ? postHrLeadersList(season, p.round.name) : firstPostHomersList(db, season, p.round.name, p.round.from, p.round.to)),
      check: (l) => recheckPostList(l),
    })),
    ...wrap.map((k) => ({ key: k, build: BUILD[k], check: (l) => recheckMlbList(l, { db, lastRegularDay: end.last }) })),
  ]
  return postOnce(db, {
    day, kind: 'list_mlb', sport: 'mlb',
    build: async () => {
      for (const c of candidates) {
        const list = await c.build().catch(() => null)
        const checked = list ? await c.check(list).catch(() => null) : null
        const text = listText(checked)
        if (text) return { text, payload: { list: c.key, season, rows: checked.rows, footnote: checked.footnote || null, source: checked.source } }
      }
      return null
    },
  })
}

// ── TUDDY (BATCH-LIST-POSTS step 4) ────────────────────────────────────────
// Weekly, after Monday night: Tuesday and Wednesday from 10am ET, one list a
// day (the (day, 'list_nfl') claim), each list once per NFL week (its key
// carries the week) -- a TD in every game, then 100+ yards 3+ straight.
export const NFL_WEEKLY = ['td_every_game', 'hundred_streak']

export async function postNflListOnce(db, day) {
  const dow = new Date(`${day}T12:00:00Z`).getUTCDay()
  if (dow !== 2 && dow !== 3) return 'not-a-list-day'
  const wk = await fetchNfl(nflSlatePaths().filter((p) => /^https?:/.test(p))).catch(() => null)
  const week = wk?.week
  if (!week) return 'no-week'
  const { data: done } = await db.from('homer_feed_posts').select('payload').eq('kind', 'list_nfl').gte('day', shift(day, -6))
  const posted = new Set((done || []).map((r) => r?.payload?.list).filter(Boolean))
  const todo = NFL_WEEKLY.filter((k) => !posted.has(`${k}:w${week}`))
  if (!todo.length) return 'week-done'
  const BUILD = { td_every_game: tdEveryGameList, hundred_streak: hundredStreakList }
  return postOnce(db, {
    day, kind: 'list_nfl', sport: 'nfl',
    build: async () => {
      for (const k of todo) {
        const list = await BUILD[k]().catch(() => null)
        const checked = list ? await recheckNflList(list).catch(() => null) : null
        const text = listText(checked)
        if (text) return { text, payload: { list: `${k}:w${week}`, rows: checked.rows, source: checked.source } }
      }
      return null
    },
  })
}

// ── LAMP (BATCH-LIST-POSTS step 3) ─────────────────────────────────────────
// One list a day once the regular season has games (the (day, 'list_nhl')
// claim): Mondays IRON MAN (active games-played streaks, weekly); other days
// the active goal streaks (4+), else a point in every game so far -- each
// only when it has 2+ verified names, so the early-season lists end on their
// own. Called from the LAMP tick from noon ET.
export function nhlListOrder(day) {
  const monday = new Date(`${day}T12:00:00Z`).getUTCDay() === 1
  return monday ? ['iron_man'] : ['goal_streak', 'point_every_game']
}

export async function postNhlListOnce(db, day) {
  const order = nhlListOrder(day)
  const BUILD = { iron_man: ironManList, goal_streak: goalStreakList, point_every_game: pointEveryGameList }
  return postOnce(db, {
    day, kind: 'list_nhl', sport: 'nhl',
    build: async () => {
      // Nothing before the season's first game: an iron-man list without this
      // season's games is last April's.
      if (!(await nhlSeasonStarted(day))) return null
      for (const k of order) {
        const list = await BUILD[k](day).catch(() => null)
        const checked = list ? await recheckNhlList(list, day).catch(() => null) : null
        const text = listText(checked)
        if (text) return { text, payload: { list: k, rows: checked.rows, source: checked.source } }
      }
      return null
    },
  })
}
