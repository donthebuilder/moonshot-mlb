// 🏀 BUCKETS WITHOUT -- his line in the games a teammate missed (2026-10-24, Donovan: "say Curry's out tonight. I want to
// see how players do ... when certain players are out of the game"). Pure: the route, the page and
// scripts/check-nba-without.mjs run the same functions.
//
// THE DATA. buckets_box holds one row per player per game, players with minutes only (supabase/migrations/
// 202610200100_buckets_box.sql), so "his club played and he has no row" = he did not play. The ESPN game log the
// splits read (lib/nba/splits.js) carries the same ESPN game ids, so a split joins on the id.
//
// OUT, EXACTLY: his club played the game, he has no row, and he was on the club then. On the club = from his first game
// for it that season to the club's last stored game, UNLESS he later played for another club that season (a trade or a
// release): then his window ends at his last game here and the gap is not counted (we hold no transaction dates).
// A man hurt from opening night has no game here at all, so he is no chip: said on the page, never guessed.
import { aggregate } from './splits'

const byDate = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : String(a.id).localeCompare(String(b.id)))

/**
 * rows: buckets_box rows { game_id, game_date, season, team, player_id, name, pts } of every club-season he played in.
 * otherRows: those teammates' rows for OTHER clubs, same seasons ({ player_id, season, team, game_date }).
 * pid: him. Returns [{ id, name, ppg, gp, on: [game ids he played], out: [game ids he missed] }], merged across
 * club-seasons, most points a game first.
 */
export function matesFrom(rows, otherRows, pid) {
  const me = String(pid)
  const clubs = new Map()   // `${season}|${team}` -> { games: Map(id -> date), men: Map(pid -> { name, ids: Set, pts }) }
  for (const r of rows || []) {
    const k = `${r.season}|${r.team}`
    const c = clubs.get(k) || { season: r.season, team: r.team, games: new Map(), men: new Map() }
    c.games.set(String(r.game_id), r.game_date)
    const p = String(r.player_id)
    const m = c.men.get(p) || { name: r.name, ids: new Set(), pts: 0 }
    m.ids.add(String(r.game_id)); m.pts += Number(r.pts) || 0
    c.men.set(p, m)
    clubs.set(k, c)
  }
  const out = new Map()
  for (const c of clubs.values()) {
    if (!c.men.has(me)) continue
    const games = [...c.games].map(([id, date]) => ({ id, date })).sort(byDate)
    const clubLast = games.length ? games[games.length - 1].date : null
    for (const [p, m] of c.men) {
      if (p === me) continue
      const dates = games.filter((g) => m.ids.has(g.id)).map((g) => g.date)
      const lo = dates[0], last = dates[dates.length - 1]
      const left = (otherRows || []).some((o) => String(o.player_id) === p && o.season === c.season && o.team !== c.team && o.game_date > last)
      const hi = left ? last : clubLast
      const win = games.filter((g) => g.date >= lo && g.date <= hi)
      const prev = out.get(p) || { id: p, name: m.name, on: [], out: [], pts: 0 }
      prev.on.push(...win.filter((g) => m.ids.has(g.id)).map((g) => g.id))
      prev.out.push(...win.filter((g) => !m.ids.has(g.id)).map((g) => g.id))
      prev.pts += m.pts
      out.set(p, prev)
    }
  }
  return [...out.values()]
    .map((m) => ({ id: m.id, name: m.name, gp: m.on.length, ppg: m.on.length ? Math.round((m.pts / m.on.length) * 10) / 10 : 0, on: m.on, out: m.out }))
    .sort((a, b) => b.ppg - a.ppg || a.name.localeCompare(b.name))
}

/**
 * His two lines for one teammate or two: `with` = the games every picked man played, `without` = the games every picked
 * man missed. games: lib/nba/splits buildGames rows (id = the ESPN game id). Games outside a man's window are in neither.
 */
export function withoutLines(games, picked) {
  if (!picked?.length) return null
  const on = picked.map((m) => new Set(m.on)), off = picked.map((m) => new Set(m.out))
  const w = games.filter((g) => on.every((s) => s.has(g.id)))
  const wo = games.filter((g) => off.every((s) => s.has(g.id)))
  return { with: aggregate(w), without: aggregate(wo) }
}

/** The scan: his line with and without each teammate, one row per man who missed at least `minOut` of his games. */
export function withoutScan(games, mates, { minOut = 1 } = {}) {
  return (mates || []).map((m) => ({ m, l: withoutLines(games, [m]) }))
    .filter((x) => x.l.without.gp >= minOut && x.l.with.gp > 0)
    .map(({ m, l }) => ({ m, with: l.with, without: l.without }))
}
