// 🏈 TUDDY LIST POSTS (BATCH-LIST-POSTS step 4, 2026-09-27). Server safe.
// From the bot's published nfl_logs.json (one row per game a player played:
// season s, week w, team tm, g_td, g_recyd, g_ruyd ...) and nfl_week.json
// (names), computed here, never typed.
//
// A TD IN EVERY GAME THIS SEASON: a touchdown in each of his games this
//   season AND no game of his club's missed (his games = his club's games so
//   far, counted off the log's own weeks for that club); 2+ games in.
// 100 YARDS, 3+ STRAIGHT: an active run of games with 100+ rushing or 100+
//   receiving yards, 3 or more, back across seasons while unbroken.
// Not built: CONSECUTIVE QB STARTS -- the published data has no "started"
//   field (a QB's passing yards can be a relief appearance), so a starts
//   streak would be a guess. PLAYED / STARTED EVERY GAME waits for the
//   season's end.

import { nflSlatePaths, nflLogPaths, fetchNfl } from '../nfl/dataSource'
import { verified } from './shape'

const http = (ps) => ps.filter((p) => /^https?:/.test(p))

async function load() {
  const [week, logs] = await Promise.all([fetchNfl(http(nflSlatePaths())).catch(() => null), fetchNfl(http(nflLogPaths())).catch(() => null)])
  if (!week?.players?.length || !logs?.logs) return null
  return { week, logs }
}

/** Pure: a club's games this season = the distinct weeks any of its players logged. */
export function clubWeeks(logs, season) {
  const by = new Map()
  for (const rec of Object.values(logs?.logs || {})) {
    for (const r of rec?.log || []) {
      if (Number(r.s) !== Number(season)) continue
      if (!by.has(r.tm)) by.set(r.tm, new Set())
      by.get(r.tm).add(Number(r.w))
    }
  }
  return by
}

/** Pure: the TD-in-every-game rows. */
export function tdEveryGameRows(week, logs) {
  const season = Number(week.season)
  const weeks = clubWeeks(logs, season)
  const nameOf = new Map(week.players.map((p) => [String(p.player_id), p]))
  const rows = []
  for (const [pid, rec] of Object.entries(logs.logs)) {
    const mine = (rec?.log || []).filter((r) => Number(r.s) === season)
    if (mine.length < 2) continue
    const clubs = [...new Set(mine.map((r) => r.tm))]
    if (clubs.length !== 1) continue
    if (mine.length !== (weeks.get(clubs[0])?.size || 0)) continue   // missed a game of his club's
    if (!mine.every((r) => Number(r.g_td) >= 1)) continue
    const p = nameOf.get(pid)
    if (!p) continue
    const td = mine.reduce((a, r) => a + Number(r.g_td), 0)
    rows.push({ id: pid, name: p.name, team: clubs[0], fact: `${td} TD in ${mine.length} games`, check: { games: mine.length, td } })
  }
  return rows.sort((a, b) => b.check.games - a.check.games || b.check.td - a.check.td || a.name.localeCompare(b.name))
}

/** Pure: active 100-yard (rush or receiving) runs of 3+ games. */
export function hundredStreakRows(week, logs) {
  const nameOf = new Map(week.players.map((p) => [String(p.player_id), p]))
  const rows = []
  for (const [pid, rec] of Object.entries(logs.logs)) {
    const games = (rec?.log || []).slice().sort((a, b) => Number(a.s) - Number(b.s) || Number(a.w) - Number(b.w))
    let n = 0
    for (let i = games.length - 1; i >= 0; i -= 1) {
      const g = games[i]
      if (Number(g.g_ruyd) >= 100 || Number(g.g_recyd) >= 100) n += 1; else break
    }
    const p = nameOf.get(pid)
    if (n >= 3 && p) rows.push({ id: pid, name: p.name, team: p.team, fact: `100+ yards in ${n} straight`, check: { streak: n } })
  }
  return rows.sort((a, b) => b.check.streak - a.check.streak || a.name.localeCompare(b.name))
}

export async function tdEveryGameList() {
  const d = await load()
  if (!d) return null
  // An "everyone who" list, never trimmed: the players with the most games
  // keep their line; the rest ride on one name line ('+N more' if it must).
  const rows = tdEveryGameRows(d.week, d.logs)
  const most = rows[0]?.check.games || 0
  const shown = rows.map((r) => (r.check.games === most ? r : { ...r, fact: null }))
  return { sport: 'nfl', kind: 'td_every_game', title: `A touchdown in every game this season (Week ${d.week.week}):`, rows: shown, footnote: null, source: 'nfl_logs.json (nflverse weekly) + nfl_week.json', asOf: new Date().toISOString() }
}

export async function hundredStreakList() {
  const d = await load()
  if (!d) return null
  return { sport: 'nfl', kind: 'hundred_streak', ranked: true, title: '100+ rushing or receiving yards, 3+ games in a row:', rows: hundredStreakRows(d.week, d.logs), footnote: null, source: 'nfl_logs.json (nflverse weekly)', asOf: new Date().toISOString() }
}

/** Post-time re-check: rebuilt from the source; a row stays if it still says the same. */
export async function recheckNflList(list) {
  if (!list?.rows?.length) return null
  const BUILD = { td_every_game: tdEveryGameList, hundred_streak: hundredStreakList }
  const again = await BUILD[list.kind]?.()
  // The numbers behind each row, not its printed line (a name-only row has none).
  const same = new Map((again?.rows || []).map((r) => [r.id, JSON.stringify(r.check)]))
  return verified(list, new Set(list.rows.filter((r) => same.get(r.id) === JSON.stringify(r.check)).map((r) => r.id)))
}
