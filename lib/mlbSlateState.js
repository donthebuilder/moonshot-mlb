// THE LEAGUE'S WORD ON A SLATE (2026-09-26). How many of a baseball day's
// games are live, how many are final, and whether the day is over -- read
// from MLB's own schedule feed, which is the truth about a game's state.
//
// Why: the bot's payload carries `live_mode` and per-game states as of its
// LAST BUILD. When the last build ran mid-slate, those froze as "live": at
// 2:30 AM ET the MOONSHOT hero still read "TODAY · LIVE — grading as they
// land" and the front door "10 live", while the score rail (same feed as
// here) called the same games LAST NIGHT (stranger test F5). A game's state
// comes from the league; the payload's flag is the fallback when the feed
// can't be reached.
//
// No 'use client': the front door reads it on the server, MOONSHOT's Home in
// the browser. One small request per date per minute, cached here.
const FIELDS = 'dates,games,gamePk,status,abstractGameState,detailedState'
const TTL = 60_000
const cache = new Map() // date -> { at, promise }

/** { games, live, final, over } from raw schedule games. Postponed,
 *  cancelled and suspended games are done for the day, not live. */
export function slateStateOf(rawGames) {
  const games = Array.isArray(rawGames) ? rawGames : []
  let live = 0
  let final = 0
  let done = 0
  for (const g of games) {
    const abstract = String(g?.status?.abstractGameState || '')
    const off = /postponed|cancel|suspend/i.test(String(g?.status?.detailedState || ''))
    if (abstract === 'Live' && !off) live += 1
    if (abstract === 'Final' && !off) final += 1
    if (abstract === 'Final' || off) done += 1
  }
  return { games: games.length, live, final, over: games.length > 0 && done === games.length }
}

/** The state of one baseball day (YYYY-MM-DD, Eastern), or null if the feed
 *  didn't answer. */
export function mlbSlateState(date) {
  const key = String(date || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return Promise.resolve(null)
  const hit = cache.get(key)
  if (hit && Date.now() - hit.at < TTL) return hit.promise
  const promise = fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${key}&fields=${FIELDS}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => (j ? slateStateOf((j.dates || []).flatMap((d) => d.games || [])) : null))
    .catch(() => null)
  cache.set(key, { at: Date.now(), promise })
  return promise
}
