// ONE GLOBAL SEARCH, THE MATCHING (2026-10-07). MOONSHOT's QuickSearch (components/QuickSearch.js)
// found a hitter; this is the same box for every product: players, clubs and the day's games, the
// current product's first, the others after. Pure functions, no fetching, so scripts/check-search.mjs
// can hold the routing of every result kind in every sport to fixtures.
//
// Every address comes from lib/routes.js (playerHref / teamHref / gameHref): a result opens exactly
// what the same tap does inside that product, so a shared link and a tapped result are one thing.
// A sport is a key of the registry (SPORT_KEYS / BRAND), never a ternary.
import { MLB_TEAMS } from '../mlbTeams'
import { NFL_TEAMS } from '../nfl/teams'
import { NHL_TEAMS } from '../nhl/teams'
import { NBA_TEAMS } from '../nba/teams'
import { BRAND, gameHref, playerHref, teamHref, sportKey, SPORT_KEYS } from '../routes'

export const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9' ]+/g, ' ').replace(/\s+/g, ' ').trim()

/** The clubs of each product as { code, name }, read off the product's own table. */
export const TEAMS_OF = {
  mlb: () => Object.entries(MLB_TEAMS).map(([code, t]) => ({ code, name: t.name })),
  nfl: () => NFL_TEAMS.map(([code, name]) => ({ code, name })),
  nhl: () => NHL_TEAMS.map(([code, , place, nick]) => ({ code, name: `${place} ${nick}` })),
  nba: () => NBA_TEAMS.map(([code, , place, nick]) => ({ code, name: `${place} ${nick}` })),
}

/** The in-page address of an app link: /app#sport=nfl&... -> #sport=nfl&... (a hash change is the shells' own routing). */
export const hashOf = (href) => String(href || '').replace(/^\/app(?=#)/, '')

// How well `name` answers the typed text. Lower is better, -1 is no match. Every typed word has to
// land in the name ("shohei oh" finds him; "oh sho" does too) -- the ranking is how it lands.
export function rankName(name, q) {
  const n = norm(name)
  const k = norm(q)
  if (!k || !n) return -1
  if (n === k) return 0
  const words = k.split(' ')
  const parts = n.split(' ')
  // a short word has to START a word of the name ("tor" is not inside "Predators"); a longer one may sit inside it
  if (!words.every((w) => (w.length < 3 ? parts.some((x) => x.startsWith(w)) : n.includes(w)))) return -1
  if (parts[parts.length - 1] === k) return 1                                  // his surname, exactly
  if (n.startsWith(k)) return 2
  if (words.every((w) => parts.some((p) => p.startsWith(w)))) return 3         // every word starts a word of the name
  return 4
}

const sortStable = (rows) => rows.map((r, i) => ({ r, i })).sort((a, b) => (a.r.rank - b.r.rank) || (a.i - b.i)).map((x) => x.r)

/** Clubs matching the text: its code exactly, or its name. */
export function searchTeams(sport, q, cap = 3) {
  const s = sportKey(sport)
  const k = norm(q)
  if (!k) return []
  const rows = []
  for (const t of (TEAMS_OF[s]?.() || [])) {
    const code = norm(t.code)
    const rank = code === k ? 0 : rankName(t.name, k)
    if (rank < 0) continue
    const href = teamHref(s, t.code)
    if (!href) continue
    rows.push({ kind: 'team', sport: s, id: t.code, code: t.code, name: t.name, href: hashOf(href), rank })
  }
  return sortStable(rows).slice(0, cap)
}

/** People matching the text, from one product's index ([{ id, name, team, pos }]). A club code alone lists its roster. */
export function searchPlayers(sport, q, index, cap = 6, { skip = null } = {}) {
  const s = sportKey(sport)
  const k = norm(q)
  if (!k || !Array.isArray(index)) return []
  const rows = []
  for (const p of index) {
    if (!p || p.id == null || !p.name) continue
    if (skip && skip(p)) continue
    let rank = rankName(p.name, k)
    if (rank < 0 && norm(p.team) === k) rank = 5
    if (rank < 0) continue
    rows.push({ kind: 'player', sport: s, id: String(p.id), name: p.name, team: p.team || '', pos: p.pos || '', note: p.note || '', status: p.status || '', raw: p.raw || null, href: hashOf(playerHref(s, p.id)), rank })
  }
  return sortStable(rows).slice(0, cap)
}

/** The day's games where either side matches the text (a code exactly, or a club name). */
export function searchGames(sport, q, games, cap = 3) {
  const s = sportKey(sport)
  const k = norm(q)
  if (!k || !Array.isArray(games)) return []
  const names = new Map(TEAMS_OF[s]?.().map((t) => [t.code, t.name]) || [])
  const side = (code) => {
    const c = norm(code)
    if (!c) return -1
    return c === k ? 0 : rankName(names.get(String(code).toUpperCase()) || '', k)
  }
  const rows = []
  for (const g of games) {
    if (!g || g.id == null || !g.away || !g.home) continue
    const rank = Math.min(...[side(g.away), side(g.home)].map((r) => (r < 0 ? 99 : r)))
    if (rank >= 99) continue
    rows.push({ kind: 'game', sport: s, id: String(g.id), away: g.away, home: g.home, status: g.status || '', href: hashOf(gameHref(s, g.id)), rank })
  }
  return sortStable(rows).slice(0, cap)
}

/** The products in the order the box lists them: the current one first, then the rest in registry order. */
export function sportOrder(current, visible = SPORT_KEYS) {
  const here = sportKey(current)
  return [here, ...visible.filter((k) => k !== here)]
}

/**
 * Everything for one typed text: { sport, here, label, teams, games, players } per product, current first.
 * indexes: { [sport]: { players, games } } -- whatever has loaded so far (missing = not loaded yet).
 * `slateSkip` (current product only) hides a roster man who is already a row of tonight's slate list.
 */
export function searchAll({ q, sport, indexes = {}, visible = SPORT_KEYS, slateSkip = null }) {
  const k = norm(q)
  if (k.length < 2) return []
  return sportOrder(sport, visible).map((s, i) => {
    const here = i === 0
    const ix = indexes[s] || {}
    return {
      sport: s, here, label: BRAND[s]?.name || s.toUpperCase(), league: BRAND[s]?.league || '',
      teams: searchTeams(s, k, here ? 4 : 2),
      games: searchGames(s, k, ix.games, here ? 4 : 2),
      players: searchPlayers(s, k, ix.players, here ? 6 : 3, here && slateSkip ? { skip: slateSkip } : {}),
    }
  })
}
