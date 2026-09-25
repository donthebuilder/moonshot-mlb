// 🏒 WHICH SEASON IS "THIS SEASON" — decided once, from the league's own
// boundary, for every LAMP page that asks the feed for a dated payload.
//
// The feed has three ideas of "now" and they disagree during preseason
// (probed 2026-09-25): roster/{team}/current is the NEW season; standings/now,
// club-stats/{team}/now, a player's featuredStats and the *-stats-leaders/
// current endpoints are all LAST season; and a dated ask for the new season
// answers 404 (leaders) or an empty list (club-stats) until a game has been
// played. So:
//   · the ACTIVE season is the newest one whose standings table has started
//     (standings-season → standingsStart), else the one before it;
//   · a page that shows the previous season says so (`stale`), the same
//     amber line Standings already prints;
//   · a route that asks for the active season and gets nothing falls back
//     to the previous one AND says so — never a blank page on opening day.
//
// No 'use client'. Pure; the routes and the tests both import it.
import { seasonLabel } from './reduce'

/** 20262027 → 20252026. The league's ids are yyyyYYYY; the year pair moves by one. */
export const previousSeasonId = (id) => Number(id) - 10001

/**
 * @param {{current:{id,standingsStart}|null, seasons:Array}} seasons  reduceStandingsSeasons()
 * @param {string} today  YYYY-MM-DD (Eastern)
 * @returns {{ id:number, label:string, stale:boolean, current:number|null, opens:string|null }}
 */
export function activeSeason(seasons, today) {
  const cur = seasons?.current || null
  if (!cur?.id) return { id: null, label: null, stale: false, current: null, opens: null }
  const started = cur.standingsStart && String(today) >= cur.standingsStart
  if (started) return { id: cur.id, label: seasonLabel(cur.id), stale: false, current: cur.id, opens: cur.standingsStart }
  const prev = (seasons.seasons || []).find((s) => s.id < cur.id) || { id: previousSeasonId(cur.id) }
  return { id: prev.id, label: seasonLabel(prev.id), stale: true, current: cur.id, opens: cur.standingsStart || null }
}
