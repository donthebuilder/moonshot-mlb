'use client'

// 📏 LEAGUE BASELINES — the number that turns a count into a read.
//
// 2026-08-09, Donovan: "can we get total base hits on the day, and I want to
// know the league average of base hits per day."
//
// The first half is easy — the live slate already carries every hitter's line,
// so tonight's hits are a sum of numbers we've already fetched. The second
// half is the one that makes the first half mean anything: 214 hits is a
// number, "214 against a typical 230" is a read.
//
// THE UNIT PROBLEM, AND WHY IT ISN'T "PER DAY".
// "Hits per day" is not a stable quantity. A fifteen-game Sunday and a
// nine-game Thursday are different days, and comparing tonight's raw total to
// a season-long daily average would say "quiet night" every Thursday and
// "big night" every Sunday, for no reason but the schedule.
//
// So the baseline is HITS PER GAME, and the comparison scales it by the number
// of games actually on tonight's slate. That is a fair like-for-like: it asks
// whether the bats were loud FOR A SLATE THIS SIZE.
//
// THE SOURCE. One call to the league's own team hitting totals, summed:
//   sum(hits) / (sum(gamesPlayed) / 2)
// The halving matters — gamesPlayed is counted per TEAM, so a 30-team sum
// double-counts every game. Verified against the live endpoint on 2026-08-09:
// 3,552 team-games and 29,092 hits, which is 1,776 games and 16.38 hits per
// game. Forgetting the /2 would have printed 8.19 and made every night on the
// site look like a slugfest.

const SEASON_URL = (yr) =>
  `https://statsapi.mlb.com/api/v1/teams/stats?season=${yr}&group=hitting&stats=season`
  + '&sportIds=1&fields=stats,splits,team,name,stat,hits,gamesPlayed,homeRuns'

let _cache = null
let _at = 0
const TTL = 6 * 60 * 60 * 1000   // season rates move slowly; six hours is plenty

/**
 * League hits and homers per GAME this season.
 * @returns { hitsPerGame, hrPerGame, games, hits, season } or null
 */
export async function leagueRates() {
  if (_cache && Date.now() - _at < TTL) return _cache
  const yr = new Date().getFullYear()
  try {
    const j = await fetch(SEASON_URL(yr)).then((r) => (r.ok ? r.json() : null))
    const splits = j?.stats?.[0]?.splits || []
    let teamGames = 0
    let hits = 0
    let hr = 0
    splits.forEach((s) => {
      const g = Number(s?.stat?.gamesPlayed)
      const h = Number(s?.stat?.hits)
      const b = Number(s?.stat?.homeRuns)
      if (Number.isFinite(g)) teamGames += g
      if (Number.isFinite(h)) hits += h
      if (Number.isFinite(b)) hr += b
    })
    // Fewer than ~20 clubs reporting means a half-loaded response, not a
    // league — better to show nothing than a baseline built on nine teams.
    if (splits.length < 20 || teamGames <= 0) return null
    const games = teamGames / 2
    _cache = {
      season: yr,
      games: Math.round(games),
      hits,
      hitsPerGame: hits / games,
      hrPerGame: hr / games,
    }
    _at = Date.now()
    return _cache
  } catch {
    return null
  }
}

/** Sum tonight's actual hits and homers out of a live slate snapshot. */
export function tonightTotals(snap) {
  const lines = Object.values(snap?.lines || {})
  let hits = 0
  let hr = 0
  lines.forEach((l) => {
    hits += Number(l?.h) || 0
    hr += Number(l?.hr) || 0
  })
  // Only games that have actually started can contribute, and only those
  // should be in the denominator when we scale the baseline.
  const started = (snap?.games || []).filter((g) => g.state === 'Live' || g.settled).length
  const final = (snap?.games || []).filter((g) => g.settled).length
  return { hits, hr, started, final, games: (snap?.games || []).length }
}
