// 🏒 THE NHL FEED, READ FROM THE SERVER. No 'use client' — this runs inside
// app/api/lamp/*/route.js only.
//
// WHY A SERVER LAYER, when TUDDY reads ESPN from the browser: probed
// 2026-09-25, api-web.nhle.com sends NO access-control-allow-origin header,
// so a browser on dashnetwork.vercel.app cannot read it at all. Node/Vercel
// fetch gets 200 (only Python-urllib's UA is refused). Upstream answers with
// cache-control: max-age=0, so every bit of caching is ours:
//   · `next: { revalidate }` on the fetch — Vercel's Data Cache, one upstream
//     call per TTL per endpoint however many people are watching. Payloads
//     are 30–100 KB, well under the 2 MB entry limit rule 42 is about.
//   · s-maxage on the route response (see the routes) so the CDN answers
//     the browser's poll without running the function at all.
//
// moonshot-mlb stays what it is: this never writes, never runs a bot. It is a
// read proxy with a cache, the same job unstable_cache does for /start.
//
// DATED URLS ONLY. `/score/now` and `/standings/now` are 307s to a dated URL
// decided in Eastern time on the league's side; this file passes the ET date
// itself (lib/data.js easternToday — the same rule MOONSHOT lives by) so the
// cache key is stable and "today" means the same thing on both sports.

const BASE = 'https://api-web.nhle.com/v1'
const UA = 'DASHNetwork/1.0 (+https://dashnetwork.vercel.app)'

export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
export const GAME_ID_RE = /^\d{10}$/

/** The last upstream failure, for the route's server log. */
let _lastError = null
export const lastNhlError = () => _lastError

export async function nhlGet(path, revalidate) {
  const url = `${BASE}${path}`
  const res = await fetch(url, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
    next: { revalidate },
    redirect: 'follow',
  })
  if (!res.ok) {
    _lastError = { at: new Date().toISOString(), status: res.status, url }
    throw new Error(`nhl ${res.status} ${path}`)
  }
  return res.json()
}

// TTLs, in seconds. Scores and a live game turn over every few seconds on a
// goal, but the page polls at 30 s and the CDN holds 15 — a goal is never
// more than ~45 s from the screen. Schedule and standings barely move.
export const TTL = { score: 15, game: 15, schedule: 300, standings: 600, seasons: 3600 }

export const scoreFor = (date) => nhlGet(`/score/${date}`, TTL.score)
export const scheduleFor = (date) => nhlGet(`/schedule/${date}`, TTL.schedule)
// STANDINGS ARE THE EXCEPTION TO "DATED URLS ONLY" (probed 2026-09-25): a
// dated /standings/{date} answers ZERO rows for any day without a table
// (preseason, offseason, the day after the regular season ends), while
// /standings/now 307s to the last date that HAS one. So the route asks for
// `now` and reads the season off the rows it gets back, and
// /standings-season says which season SHOULD be current and when its table
// starts (20262027 → standingsStart 2026-09-29). The two together are how a
// page says "this is last season's final table; the new one opens Sep 29"
// instead of printing 2025-26 numbers under a 2026-27 header.
export const standingsNow = () => nhlGet('/standings/now', TTL.standings)
export const standingsSeasons = () => nhlGet('/standings-season', TTL.seasons)
export const landingFor = (id) => nhlGet(`/gamecenter/${id}/landing`, TTL.game)
export const rightRailFor = (id) => nhlGet(`/gamecenter/${id}/right-rail`, TTL.game)
