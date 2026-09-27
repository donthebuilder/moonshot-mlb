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
import { MLB_WRAP, playedEveryGameList, hrClubList, powerSpeedList, calledSeasonList, recheckMlbList } from './mlb'

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

export async function postMlbListOnce(db, day) {
  const season = Number(String(day).slice(0, 4))
  if (Number(String(day).slice(5, 7)) < 9) return 'not-the-wrap'   // the wrap is Sept/Oct; no schedule read before
  const end = await seasonEnd(season)
  if (!end?.last || !end.settled) return 'season-not-over'
  if (day <= end.last || day > shift(end.last, WRAP_DAYS)) return 'not-the-wrap'
  const { data: done } = await db.from('homer_feed_posts').select('payload').eq('kind', 'list_mlb').gt('day', end.last)
  const posted = new Set((done || []).map((r) => r?.payload?.list).filter(Boolean))
  const todo = nextInRotation(MLB_WRAP, posted)
  if (!todo.length) return 'wrap-done'
  const BUILD = {
    played_every_game: () => playedEveryGameList(season),
    hr_club: () => hrClubList(season),
    power_speed: () => powerSpeedList(season),
    called_season: () => calledSeasonList(db, season, end.last),
  }
  return postOnce(db, {
    day, kind: 'list_mlb',
    build: async () => {
      for (const k of todo) {
        const list = await BUILD[k]().catch(() => null)
        const checked = list ? await recheckMlbList(list, { db, lastRegularDay: end.last }).catch(() => null) : null
        const text = listText(checked)
        if (text) return { text, payload: { list: k, season, rows: checked.rows, footnote: checked.footnote || null, source: checked.source } }
      }
      return null
    },
  })
}
