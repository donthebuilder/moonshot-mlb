// WHICH WRITE-UPS GO TO X (BATCH-GAME-WRITEUP). X charges per post, so every
// game gets a write-up on the site and in Discord, but only a slate's FEATURED
// games go to X. Picked by code -- no daily choice for Donovan ("figure it out").
//
//   NFL   TNF, SNF, MNF by kickoff slot + the best Sunday-afternoon game by the
//         sum of its call scores (4 a week).
//   MLB / NHL (rule only -- posting stays off until the backtest says so):
//     1. eligible: both sides have a call, lineups posted, game not started
//     2. rank by the SUM of the two calls' scores (or the TOP call's alone,
//        whichever the backtest keeps -- lib/writeups/featuredBacktest.json)
//     3. within 2 points: the later start, then the one whose post lands
//        60-90 min before first pitch inside the posting window
//     4. no repeats: skip a club featured in the last 2 days' write-ups when
//        another game is within 5 points
// PURE: no clock (pass `now`), no I/O.

const etParts = (iso) => {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  const s = d.toLocaleString('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', hour12: false })
  const [wd, hr] = s.split(' ')
  return { wd: wd.replace(',', ''), hr: Number(hr) % 24 }
}
const sumScores = (g) => (g.calls || []).reduce((a, c) => a + (Number(c.score) || 0), 0)

/** The NFL slot a kickoff falls in: 'TNF' | 'SNF' | 'MNF' | 'SUN_DAY' | null. */
export function nflSlot(kickoff) {
  const p = etParts(kickoff)
  if (!p) return null
  if (p.wd === 'Thu' && p.hr >= 19) return 'TNF'
  if (p.wd === 'Sun' && p.hr >= 19) return 'SNF'
  if (p.wd === 'Mon' && p.hr >= 19) return 'MNF'
  if (p.wd === 'Sun') return 'SUN_DAY'   // 9:30 AM London through the 4:25 window
  return null
}

/** Featured NFL game ids for one week's nfl_game_calls.json games[]. */
export function nflFeatured(games = []) {
  const out = new Map()
  for (const g of games) {
    const s = nflSlot(g.kickoff)
    if (s && s !== 'SUN_DAY') out.set(String(g.game_id), s)
  }
  const day = games.filter((g) => nflSlot(g.kickoff) === 'SUN_DAY' && (g.calls || []).length)
    .sort((a, b) => sumScores(b) - sumScores(a) || String(b.kickoff).localeCompare(String(a.kickoff)))
  if (day[0]) out.set(String(day[0].game_id), 'SUN_DAY')
  return out   // game_id -> slot
}

/**
 * The featured game for a one-a-day sport (MLB / NHL).
 * @param games  [{ game_id, start, teams:[a,b], calls:[{score, role}], lineups, started }]
 * @param opts   { rank: 'sum'|'top', recentTeams: Set of clubs featured in the last 2 days, now, window: [minMs, maxMs] }
 */
export function dailyFeatured(games = [], { rank = 'sum', recentTeams = new Set(), now = null, window = [60 * 60e3, 90 * 60e3] } = {}) {
  const value = (g) => (rank === 'top'
    ? Math.max(0, ...(g.calls || []).filter((c) => c.role === 'TOP').map((c) => Number(c.score) || 0))
    : sumScores(g))
  // 1. eligible
  const elig = games.filter((g) => (g.calls || []).length >= 2 && g.lineups !== false && !g.started)
  if (!elig.length) return null
  // 2. rank
  const ranked = elig.map((g) => ({ g, v: value(g) })).sort((a, b) => b.v - a.v)
  const top = ranked[0].v
  // 3. tiebreak within 2: later start, then the one whose post lands in the window
  const inWindow = (g) => { if (now == null) return false; const lead = new Date(g.start).getTime() - now; return lead >= window[0] && lead <= window[1] }
  let pool = ranked.filter((x) => top - x.v <= 2).sort((a, b) => String(b.g.start).localeCompare(String(a.g.start)) || Number(inWindow(b.g)) - Number(inWindow(a.g)))
  // 4. no repeats: a club featured in the last 2 days steps aside for a game within 5
  const fresh = (g) => !(g.teams || []).some((t) => recentTeams.has(t))
  const pick = pool[0]
  if (!fresh(pick.g)) {
    const alt = ranked.find((x) => fresh(x.g) && pick.v - x.v <= 5)
    if (alt) return alt.g
  }
  return pick.g
}
