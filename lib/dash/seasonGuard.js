// OFFSEASON GUARD, SITE SIDE (2026-09-27, run order item 5).
//
// The bot repo's bots/mlb_season_guard.py, in JS, with the same answer: is
// there an MLB game -- regular season OR any postseason round -- from BACK
// days ago to AHEAD days ahead? The look-back keeps yesterday's grading,
// the recap and the weekly/monthly posts alive for the nights after the last
// game; the look-ahead wakes the tick up before Opening Day.
//
// Fails OPEN: if the schedule can't be read, active = true. A missed guard
// costs one normal tick; a wrong "off" would cost a real night.
//
// One statsapi call answers it, held for an hour in the warm lambda, so a
// cron that fires every minute makes about one schedule call an hour.

const TTL_MS = 60 * 60 * 1000
let _cache = { key: '', at: 0, out: null }

const shift = (iso, n) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

/** Pure: the window the question is asked over. */
export function seasonWindow(today, { back = 3, ahead = 3 } = {}) {
  return { start: shift(today, -back), end: shift(today, ahead) }
}

/** Pure: statsapi schedule body (or null when unreadable) -> { active, games, why }. */
export function seasonVerdict(body, { start, end }) {
  const total = body == null ? null : Number(body.totalGames ?? (body.dates || []).reduce((n, d) => n + (d?.games?.length || 0), 0))
  if (total == null || !Number.isFinite(total)) return { active: true, games: null, why: 'schedule unreadable -- failing open' }
  return { active: total > 0, games: total, why: `${total} MLB game(s) ${start}..${end}` }
}

// ── THE POSTSEASON'S FIRST DAY (2026-09-27, BATCH-LIST-POSTS step 6) ───────
// So an October homer is counted in October ("his 2nd homer this
// postseason"), never added to the regular-season total. One schedule read
// per season (every F/D/L/W date), held six hours.
let _post = { season: null, at: 0, start: undefined }

/** Pure: the earliest date in a statsapi schedule body, or null. */
export function firstDate(body) {
  const ds = (body?.dates || []).map((d) => d?.date).filter(Boolean).sort()
  return ds[0] || null
}

/**
 * For a day (ET): { postseason: true, start } on or after the season's first
 * postseason date, { postseason: false } before it (or with none scheduled),
 * { postseason: null } when the schedule cannot be read -- a caller then says
 * nothing about counts rather than guess which season a homer belongs to.
 */
export async function postseasonOn(day) {
  const season = Number(String(day).slice(0, 4))
  if (_post.season !== season || Date.now() - _post.at > 6 * 3600e3 || _post.start === undefined) {
    try {
      const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&season=${season}&gameType=F,D,L,W&fields=dates,date`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
      if (!res.ok) return { postseason: null }
      _post = { season, at: Date.now(), start: firstDate(await res.json()) }
    } catch { return { postseason: null } }
  }
  if (!_post.start) return { postseason: false }
  return day >= _post.start ? { postseason: true, start: _post.start } : { postseason: false, start: _post.start }
}

/**
 * A hitter's postseason home runs in seasons BEFORE `season` (StatsAPI
 * yearByYear, gameType P). Null when it can't be read -- never guessed.
 */
export async function priorPostseasonHr(personId, season) {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/people/${personId}?hydrate=stats(group=[hitting],type=[yearByYear],gameType=[P])`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    if (!res.ok) return null
    const j = await res.json()
    const splits = (j?.people?.[0]?.stats || []).flatMap((s) => s.splits || [])
    return splits.filter((x) => Number(x.season) < season).reduce((a, x) => a + (Number(x.stat?.homeRuns) || 0), 0)
  } catch { return null }
}

/** Is baseball on? today = an ISO date (ET). */
export async function mlbSeasonActive(today, opts = {}) {
  const win = seasonWindow(today, opts)
  const key = `${win.start}|${win.end}`
  if (_cache.key === key && Date.now() - _cache.at < TTL_MS) return _cache.out
  let body = null
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${win.start}&endDate=${win.end}&gameType=R,F,D,L,W&fields=totalGames`, { cache: 'no-store', signal: AbortSignal.timeout(8000) })
    if (res.ok) body = await res.json()
  } catch { body = null }
  const out = seasonVerdict(body, win)
  // Only a real answer is cached; an unreadable schedule asks again next tick.
  if (out.games != null) _cache = { key, at: Date.now(), out }
  return out
}
