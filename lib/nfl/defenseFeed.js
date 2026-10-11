// lib/nfl/defenseFeed.js -- THE SERVER READ OF ESPN'S BOX SCORES (2026-10-10). Used by app/api/nfl/defense/route.js.
//
// Same host the live slate reads (lib/nfl/liveSlate.js): site.web.api.espn.com, because site.api.espn.com 403s from
// Vercel's egress. NO cron, NO stored data: it rides the route that is asked for it, and the cost is bounded three ways.
//   * A FINISHED game never changes, so each box score is fetched with `revalidate: 86400` (Next's data cache, shared by
//     every instance): one fetch per game per day at most, and a game ESPN finished last Sunday costs the same one
//     fetch whether ten thousand people open a page or none.
//   * The scoreboard for a week is `revalidate: 3600` for the current week and a day for finished weeks.
//   * The built season book is kept in memory for 10 minutes per instance, and the route answers with s-maxage=6h.
// Games in progress are not read (a half game would sit under a "games" label). A game whose box score failed to
// load is counted in `missing`, and the payload says `partial: true` rather than quietly summing fewer games.
import { parseSummary, addGame, finishBook, teamGames } from './defStats'

const BASE = 'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl'
export const CONCURRENCY = 6
export const DEADLINE_MS = 40000

const MEMO = new Map()   // season -> { at, value }
const MEMO_MS = 10 * 60 * 1000

async function getJSON(fetchImpl, url, revalidate) {
  for (let i = 0; i < 2; i++) {
    try {
      const r = await fetchImpl(url, { next: { revalidate } })
      if (r.ok) return await r.json()
    } catch { /* retry once */ }
  }
  return null
}

/**
 * The season's finished regular-season games: { season, week, events: [{ id, week, date }] }.
 * "NOW" comes from the scoreboard with no date in it (ESPN answers for today): its season year, season type and week
 * number say how far the regular season has got. A scoreboard asked by calendar year alone (dates=2026) answers with
 * the LAST regular-season week played in that calendar year, which in January is the previous season's week 18, so it
 * is never used to find the week. `season` null = the season ESPN is in now.
 */
export async function finishedGames({ season = null, fetchImpl }) {
  const head = await getJSON(fetchImpl, `${BASE}/scoreboard`, 3600)
  if (!head) return null
  const nowYear = Number(head?.season?.year) || null
  const type = Number(head?.season?.type) || 0
  const nowWeek = Number(head?.week?.number) || 0
  const yr = season || nowYear
  if (!yr) return null
  // how many regular-season weeks exist to read: 0 before it starts, up to the current week during it, all 18 once it is over
  let last
  if (yr > (nowYear || yr)) last = 0
  else if (yr < (nowYear || yr)) last = 18
  else last = type === 2 ? nowWeek : type === 1 ? 0 : 18
  const events = []
  const seen = new Set()
  for (let w = 1; w <= Math.min(last, 18); w++) {
    const sb = await getJSON(fetchImpl, `${BASE}/scoreboard?dates=${yr}&seasontype=2&week=${w}`, w < last ? 86400 : 3600)
    if (!sb) continue
    for (const e of sb.events || []) {
      if (e?.status?.type?.state !== 'post' || seen.has(String(e.id))) continue
      seen.add(String(e.id))
      events.push({ id: String(e.id), week: w, date: e.date || null })
    }
  }
  return { season: yr, week: Math.min(last, 18), events }
}

/**
 * The whole season's book, built from finished box scores.
 * `fetchImpl` is injected so the tests can run on a labelled fixture; the route passes the global fetch.
 * Returns { season, week, book, teamGames, expected, read, missing, partial } or null if the schedule itself failed.
 */
export async function loadSeasonBook({ season = null, fetchImpl = fetch, now = Date.now, deadlineMs = DEADLINE_MS, fresh = false } = {}) {
  const memoKey = season || 'now'
  const hit = MEMO.get(memoKey)
  if (!fresh && hit && now() - hit.at < MEMO_MS) return hit.value
  const t0 = now()
  const sched = await finishedGames({ season, fetchImpl })
  if (!sched) return null
  const games = new Map()
  let next = 0
  let missing = 0
  const work = async () => {
    while (next < sched.events.length) {
      if (now() - t0 > deadlineMs) return
      const ev = sched.events[next++]
      const s = await getJSON(fetchImpl, `${BASE}/summary?event=${ev.id}`, 86400)
      const g = s && parseSummary(s, ev)
      if (g) games.set(ev.id, g); else missing += 1
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, work))
  // anything the deadline cut off is missing too
  const unread = sched.events.filter((e) => !games.has(e.id)).length
  const book = {}
  for (const ev of [...sched.events].sort((a, b) => a.week - b.week)) if (games.has(ev.id)) addGame(book, games.get(ev.id))
  finishBook(book)
  const value = {
    season: sched.season, week: sched.week, book, teamGames: teamGames(book),
    expected: sched.events.length, read: games.size, missing: unread, partial: unread > 0,
  }
  if (!value.partial) MEMO.set(memoKey, { at: now(), value })
  return value
}

export const _clearMemo = () => MEMO.clear()
