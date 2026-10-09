// 🥅 THE PREGAME STARTING-GOALIE SOURCE (2026-10-09). Server only, read only, never writes.
//
// MEASURED 2026-10-09 against the live feeds (docs in the commit):
//   · api-web.nhle.com: NO starter anywhere pregame. landing.matchup.goalieComparison lists each club's
//     season goalies (`leaders`, by games played), not tonight's; right-rail, boxscore, schedule and
//     scoreboard carry nothing; the play-by-play rosterSpots appear only when lineups post.
//   · ESPN's public scoreboard (site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates=YYYYMMDD)
//     carries, per competitor, `probables[0]` = { name: 'probableStartingGoalie', athlete, status.type }
//     with status.type 'expected' (the projected starter) or 'confirmed' (the club has named him). ONE call
//     covers the whole night. Confirmations arrive from the morning skate on (hours before puck drop); a
//     night several days out is all 'expected'. After the game ESPN flips every entry to 'confirmed' with
//     the man who actually played, so this module reads a game ONLY while ESPN lists it as scheduled.
//
// CONFIRMED means ESPN says 'confirmed' and nothing else. 'expected' is a projection and is NOT accepted
// unless ACCEPT_PROBABLE is turned on (it is not: no accuracy history exists yet to trust it).
// Never invent a goalie: no entry, a failed fetch, a game ESPN does not list, or an ambiguous match is
// "no data", and no data is never confirmed.
//
// Shape: { gameId, home: Side|null, away: Side|null, asOf }
//   Side = { id: nhlPlayerId|null, name, confirmed: boolean, source: 'espn', status: 'confirmed'|'expected' }

/** Accept an ESPN 'expected' (probable) goalie as confirmed. Default OFF; flip only after a measured accuracy history. */
export const ACCEPT_PROBABLE = false

export const SOURCE = 'espn'
export const TTL_MS = 2 * 60 * 1000          // one scoreboard fetch per date per 2 minutes, per server instance
export const ID_TTL_MS = 6 * 60 * 60 * 1000  // goalie-name -> NHL id lookups barely move
const ESPN = 'https://site.api.espn.com/apis/site/v2/sports/hockey/nhl/scoreboard?dates='
const UA = 'Mozilla/5.0 (compatible; DashNetwork/1.0)'

// ESPN abbreviations that differ from the league's
const TEAM = { NJ: 'NJD', TB: 'TBL', SJ: 'SJS', LA: 'LAK', UTAH: 'UTA', WAS: 'WSH', MON: 'MTL', VEG: 'VGK' }
const abbr = (a) => { const u = String(a || '').toUpperCase(); return TEAM[u] || u }

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z ]/g, '').trim()

const _cache = new Map()      // date -> { at, events }
const _ids = new Map()        // gameId -> { at, goalies }
export function _resetForTests() { _cache.clear(); _ids.clear() }

/** The compact scoreboard for a date: one fetch, cached. Throws on a failed fetch (callers treat that as no data). */
export async function scoreboardFor(date, { fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  const key = String(date).replace(/-/g, '')
  if (!/^\d{8}$/.test(key)) throw new Error('goalieSource: bad date')
  const hit = _cache.get(key)
  if (hit && now - hit.at < TTL_MS) return hit.events
  const res = await fetchImpl(`${ESPN}${key}`, {
    headers: { Accept: 'application/json', 'User-Agent': UA },
    next: { revalidate: 120 },
    signal: typeof AbortSignal?.timeout === 'function' ? AbortSignal.timeout(8000) : undefined,
  })
  if (!res?.ok) throw new Error(`goalieSource: espn ${res?.status}`)
  const json = await res.json()
  const events = (json?.events || []).map(reduceEvent).filter(Boolean)
  _cache.set(key, { at: now, events })
  return events
}

/** One ESPN event -> { start, scheduled, away, home } (abbrevs in league form; sides null without a goalie). */
export function reduceEvent(e) {
  const comp = e?.competitions?.[0]
  const cs = comp?.competitors
  if (!Array.isArray(cs)) return null
  const side = (c) => {
    const p = (c?.probables || []).find((x) => x?.name === 'probableStartingGoalie') || null
    const name = p?.athlete?.fullName || p?.athlete?.displayName || null
    const type = p?.status?.type
    if (!name || (type !== 'confirmed' && type !== 'expected')) return null
    return { name, status: type, espnId: String(p.athlete?.id || p.playerId || '') || null }
  }
  const a = cs.find((c) => c.homeAway === 'away'); const h = cs.find((c) => c.homeAway === 'home')
  if (!a || !h) return null
  return {
    start: Date.parse(comp?.date || e?.date) || null,
    scheduled: e?.status?.type?.name === 'STATUS_SCHEDULED' || e?.status?.type?.state === 'pre',
    awayAbbrev: abbr(a.team?.abbreviation), homeAbbrev: abbr(h.team?.abbreviation),
    away: side(a), home: side(h),
  }
}

// the league's id for an ESPN goalie: the landing's goalie comparison names both clubs' goalies (full names)
async function defaultGoalies(gameId) {
  const { nhlGet } = await import('./api')
  const l = await nhlGet(`/gamecenter/${gameId}/landing`, 3600)
  const gc = l?.matchup?.goalieComparison
  const pick = (t) => (gc?.[t]?.leaders || []).map((g) => ({ id: Number(g.playerId) || null, first: g.firstName?.default || '', last: g.lastName?.default || '' }))
  return { away: pick('awayTeam'), home: pick('homeTeam') }
}

/** Match an ESPN full name to one of a club's goalies: same last name and same first initial, exactly one. Else null. */
export function matchGoalieId(fullName, goalies) {
  const parts = norm(fullName).split(' ').filter(Boolean)
  if (parts.length < 2) return null
  const last = parts.slice(1).join(' '); const first = parts[0]
  const hits = (goalies || []).filter((g) => g.id && norm(g.last) === last && norm(g.first)[0] === first[0])
  return hits.length === 1 ? hits[0].id : null
}

/**
 * The starters for a night's games.
 * @param date   'YYYY-MM-DD' (the games' own date)
 * @param games  [{ id, away: {abbrev}, home: {abbrev}, startUtc, state? }]
 * @returns {{ [gameId]: { gameId, home, away, asOf } }}  only games with at least one named goalie
 */
export async function goalieSourceFor(date, games, opts = {}) {
  const { fetchImpl, now = Date.now(), acceptProbable = ACCEPT_PROBABLE, goaliesFor = defaultGoalies } = opts
  const events = await scoreboardFor(date, { fetchImpl, now })
  const out = {}
  for (const g of games || []) {
    if (g?.state && g.state !== 'pre') continue                       // nothing pregame about a game that has started
    const start = Date.parse(g?.startUtc)
    if (Number.isFinite(start) && now >= start) continue
    const same = events.filter((e) => e.scheduled && e.awayAbbrev === g.away?.abbrev && e.homeAbbrev === g.home?.abbrev)
    const near = Number.isFinite(start) ? same.filter((e) => e.start && Math.abs(e.start - start) <= 30 * 60 * 1000) : same
    if (near.length !== 1) continue                                    // not listed, or ambiguous (split squad): no data
    const ev = near[0]
    if (!ev.away && !ev.home) continue
    const confirmedOf = (s) => s.status === 'confirmed' || (acceptProbable === true && s.status === 'expected')
    let poolP = null
    const getPool = () => {
      if (poolP) return poolP
      const hit = _ids.get(g.id)
      poolP = hit && now - hit.at < ID_TTL_MS ? Promise.resolve(hit.goalies)
        : Promise.resolve(goaliesFor(g.id)).then((goalies) => { _ids.set(g.id, { at: now, goalies }); return goalies })
      return poolP
    }
    const build = async (key) => {
      const s = ev[key]; if (!s) return null
      let id = null
      if (confirmedOf(s)) {                                            // the id lookup is paid only for a goalie that will be named
        try { id = matchGoalieId(s.name, (await getPool())?.[key]) } catch { id = null }
      }
      return { id, name: s.name, confirmed: confirmedOf(s), source: SOURCE, status: s.status }
    }
    const [away, home] = await Promise.all([build('away'), build('home')])
    out[g.id] = { gameId: g.id, home, away, asOf: new Date(now).toISOString() }
  }
  return out
}
