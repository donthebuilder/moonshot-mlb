// BUCKETS PAIR HISTORY (2026-10-15). MOONSHOT's / LAMP's / TUDDY's Pair history table for basketball, built from OUR OWN
// STORED ROWS and nothing else: buckets_log's points market, one graded row per player per game with the points he
// scored (`actual`). The bot publishes pairhist_v2_<sport>.json for the other three; there is no such file for the NBA, so
// this reducer writes the SAME shape (model_version 'pairhist_v2', read by lib/pairHistV2.js) and the one table draws it.
//
//   event          a 25-POINT GAME (NBA_EVENT_BAR, the points market's bar: the same event the Called Ledger lists)
//   joint day      a day both players have a graded row with played = true
//   joint event    a joint day on which BOTH scored 25+
//   same game      a joint event where the two were in the SAME game (they were teammates or opponents)
//   rate           joint events over joint days
//   expected       joint days x (his rate on those days) x (the other's rate on those days): what the two would give
//                  if they were unrelated; lift = joint events over expected
//   active         a row inside ACTIVE_DAYS of the newest graded day on file
//   listed         at least MIN_JOINT_DAYS joint days and MIN_JOINT_EVENT_DAYS joint events (the file says so)
// Regular season and playoffs only (preseason is never the season). PURE: rows in, file out. A season with no graded
// rows yields an empty `pairs` list and `seasons_covered: []`, so the page says it builds as the season plays; nothing
// is filled in. Server or client safe (no I/O).
export const NBA_PAIR_EVENT_BAR = 25
export const MIN_JOINT_DAYS = 5
export const MIN_JOINT_EVENT_DAYS = 2
export const ACTIVE_DAYS = 21
export const NBA_PAIR_SEASONS = 4

const DAY = 86400000
const ymd = (s) => String(s || '').slice(0, 10)
const dayNum = (s) => { const t = Date.parse(`${ymd(s)}T12:00:00Z`); return Number.isFinite(t) ? Math.round(t / DAY) : null }
/** The season a date belongs to, named by the year it STARTS (Oct 2026 -> 2026): the NBA season crosses new year. */
export const seasonStartYear = (s) => { const y = Number(ymd(s).slice(0, 4)), m = Number(ymd(s).slice(5, 7)); return m >= 8 ? y : y - 1 }

/**
 * @param rows [{ game_id, game_date, player_id, name, team, actual, played?, season_type? }] graded points rows
 * @param opts { bar }
 * @returns the pairhist_v2 file
 */
export function buildNbaPairHist(rows, { bar = NBA_PAIR_EVENT_BAR, generatedAt = null } = {}) {
  const base = {
    model_version: 'pairhist_v2', sport: 'nba',
    definition: `A pair is two players who each scored ${bar}+ points on the same day. Counted from our own graded games (regular season and playoffs): a joint game is a day both played, and the event is a ${bar}-point game.`,
    thresholds: { min_joint_days: MIN_JOINT_DAYS, min_joint_event_days: MIN_JOINT_EVENT_DAYS },
    event_bar: bar,
  }
  const used = (rows || []).filter((r) => r && r.player_id != null && r.game_id != null && dayNum(r.game_date) != null && r.played !== false
    && r.season_type !== 1 && r.actual !== null && r.actual !== undefined && r.actual !== '' && Number.isFinite(Number(r.actual)))
  if (!used.length) return { ...base, generated_at: generatedAt || null, seasons_covered: [], active_players: 0, pairs: [] }

  const newestSeason = Math.max(...used.map((r) => seasonStartYear(r.game_date)))
  const seasons = [...new Set(used.map((r) => seasonStartYear(r.game_date)))].filter((y) => y > newestSeason - NBA_PAIR_SEASONS).sort((a, b) => a - b)
  const inWindow = used.filter((r) => seasons.includes(seasonStartYear(r.game_date)))
  const newest = inWindow.reduce((m, r) => (ymd(r.game_date) > m ? ymd(r.game_date) : m), '')
  const newestN = dayNum(newest)

  // per player: his days (day -> { event, game, season }), his name and club as of his newest row
  const players = new Map()
  for (const r of inWindow) {
    const id = String(r.player_id), d = ymd(r.game_date)
    const p = players.get(id) || { id, name: r.name, team: r.team, last: '', days: new Map() }
    if (!p.days.has(d)) p.days.set(d, { event: false, game: String(r.game_id), season: seasonStartYear(d) })
    if (Number(r.actual) >= bar) p.days.get(d).event = true
    if (d >= p.last) { p.last = d; p.name = r.name || p.name; p.team = r.team || p.team }
    players.set(id, p)
  }
  const active = new Set([...players.values()].filter((p) => newestN - dayNum(p.last) <= ACTIVE_DAYS).map((p) => p.id))

  // candidate pairs: only players who were both 25+ on a day can ever be listed
  const byDay = new Map()
  for (const p of players.values()) {
    if (!active.has(p.id)) continue
    for (const [d, v] of p.days) if (v.event) { const l = byDay.get(d) || []; l.push(p.id); byDay.set(d, l) }
  }
  const seen = new Set(), pairs = []
  for (const ids of byDay.values()) {
    ids.sort()
    for (let i = 0; i < ids.length; i += 1) for (let j = i + 1; j < ids.length; j += 1) {
      const key = `${ids[i]}|${ids[j]}`
      if (seen.has(key)) continue
      seen.add(key)
      const A = players.get(ids[i]), B = players.get(ids[j])
      let jd = 0, je = 0, sg = 0, ea = 0, eb = 0, last = ''
      const jointDays = []
      const bySeason = Object.fromEntries(seasons.map((y) => [String(y), [0, 0]]))
      for (const [d, a] of A.days) {
        const b = B.days.get(d)
        if (!b) continue
        jd += 1; jointDays.push(d); bySeason[String(a.season)][0] += 1
        if (a.event) ea += 1
        if (b.event) eb += 1
        if (a.event && b.event) {
          je += 1; bySeason[String(a.season)][1] += 1
          if (a.game === b.game) sg += 1
          if (d > last) last = d
        }
      }
      if (jd < MIN_JOINT_DAYS || je < MIN_JOINT_EVENT_DAYS) continue
      const exp = (ea / jd) * (eb / jd) * jd
      // joint games since the last joint event (2026-10-27, pair gap): days both played after `last`; 0 when it was the newest joint day
      const since = jointDays.filter((d) => d > last).length
      pairs.push({
        pair_key: key,
        players: [{ player_id: A.id, name: A.name, team: A.team }, { player_id: B.id, name: B.name, team: B.team }],
        joint_days: jd, joint_event_days: je, same_game_event_days: sg,
        rate: je / jd, expected_joint: Math.round(exp * 100) / 100, lift: exp > 0 ? Math.round((je / exp) * 100) / 100 : null,
        seasons: bySeason, last_joint_date: last, joint_days_since_last: since,
      })
    }
  }
  pairs.sort((x, y) => y.joint_event_days - x.joint_event_days || y.same_game_event_days - x.same_game_event_days || y.rate - x.rate)
  return { ...base, generated_at: generatedAt || newest, seasons_covered: seasons, active_players: active.size, pairs }
}
