// Reads JSON files and normalizes them into a flat player array.
// The bots' JSON can be shaped many ways (top-level players[], nested in games[], etc).
import { arr, obj, n, clean, nameOf, hrScore, hitScore, prodScore } from './player'

export async function fetchJSON(paths) {
  for (const p of paths) {
    try {
      const url = `${p}${p.includes('?') ? '&' : '?'}t=${Date.now()}`
      const r = await fetch(url, { cache: 'no-store' })
      if (r.ok) return await r.json()
    } catch {
      /* try next */
    }
  }
  return null
}

function looksPlayerLike(v) {
  const o = obj(v)
  if (!o) return false
  return (
    !!(o.name || o.player || o.player_name) &&
    (o.hr_score !== undefined || o.hit_score !== undefined || o.hrr_score !== undefined || o.team || o.player_id)
  )
}

function uniqueBestByPlayer(players, scoreKey = 'hr_score', gameAware = false) {
  const by = {}
  arr(players).forEach((p) => {
    const base = clean(p?.player_id || p?.id || p?.name, '')
    if (!base) return
    const id = gameAware ? `${base}-${clean(p?.game_pk || p?.game_id || p?.game_time || p?.team, '')}` : base
    const score =
      scoreKey === 'hit_score' ? hitScore(p) :
      scoreKey === 'production_shape_score' ? prodScore(p) :
      n(p?.[scoreKey], 0)
    const prev = by[id]
    const prevScore = prev
      ? (scoreKey === 'hit_score' ? hitScore(prev) :
         scoreKey === 'production_shape_score' ? prodScore(prev) :
         n(prev?.[scoreKey], 0))
      : -Infinity
    if (!prev || score > prevScore) by[id] = p
  })
  return Object.values(by)
}

export function normalizeData(data) {
  if (Array.isArray(data)) data = { players: data }
  const d = obj(data)
  const players = []
  const add = (p, extra = {}) => {
    if (p && typeof p === 'object') players.push({ ...extra, ...p })
  }

  ;['players', 'all_players', 'player_pool', 'slate_players', 'rows', 'picks'].forEach((k) =>
    arr(d[k]).forEach((p) => add(p)),
  )

  arr(d.games).forEach((g) => {
    arr(g.players).forEach((p) =>
      add(p, {
        game_pk: g.game_pk,
        game_time: g.game_time,
        away: g.away,
        home: g.home,
        opponent: p?.opponent || (p?.team === g.away ? g.home : g.away),
      }),
    )
    arr(g.away_players).forEach((p) =>
      add(p, { game_pk: g.game_pk, game_time: g.game_time, away: g.away, home: g.home, opponent: g.home }),
    )
    arr(g.home_players).forEach((p) =>
      add(p, { game_pk: g.game_pk, game_time: g.game_time, away: g.away, home: g.home, opponent: g.away }),
    )
  })

  ;['top_picks', 'hr_picks', 'hit_picks', 'hrr_picks', 'contact_picks', 'top_board', 'hr_board', 'alt_looks'].forEach(
    (k) => arr(d[k]).forEach((p) => add(p)),
  )

  // Deep walk as a last resort if no obvious player array was found.
  function walk(x, depth = 0, extra = {}) {
    if (depth > 4 || !x) return
    if (Array.isArray(x)) {
      x.forEach((v) => walk(v, depth + 1, extra))
      return
    }
    if (typeof x !== 'object') return
    const local = { ...extra }
    if (x.game_pk) local.game_pk = x.game_pk
    if (x.game_time) local.game_time = x.game_time
    if (x.away) local.away = x.away
    if (x.home) local.home = x.home
    if (looksPlayerLike(x)) add(x, local)
    Object.entries(x).forEach(([k, v]) => {
      if (['weather', 'venue', 'pitcher', 'metadata'].includes(k)) return
      walk(v, depth + 1, local)
    })
  }
  if (!players.length) walk(d)

  const cleanPlayers = players.filter(looksPlayerLike)
  return { players: uniqueBestByPlayer(cleanPlayers, 'hr_score', true), meta: d }
}

export function groupGames(players) {
  const g = {}
  arr(players).forEach((p) => {
    const key = p?.game_pk || `${p?.team || ''}-${p?.opponent || ''}-${p?.game_time || ''}` || 'unknown-game'
    if (!g[key])
      g[key] = {
        game_pk: key,
        game_time: p?.game_time,
        away: p?.away || p?.team,
        home: p?.home || p?.opponent,
        lineup_confirmed: !!p?.lineup_confirmed,
        players: [],
      }
    if (p?.lineup_confirmed) g[key].lineup_confirmed = true
    g[key].players.push(p)
  })
  return Object.values(g).sort((a, b) => new Date(a.game_time || 0) - new Date(b.game_time || 0))
}

// One entry per unique starting pitcher today, with the full opposing
// lineup attached (sorted by lineup_spot) and the pitcher-level fields
// every hitter row already carries (pitcher_era, pitcher_hr9, pitcher_whip,
// pitcher_weak_side, weak_spot data is per-batter so it's attached to each
// lineup slot, not the pitcher object itself -- a weak spot is relative to
// a specific batter's hand, not a fixed pitcher attribute).
export function groupPitchers(players) {
  const byId = {}
  arr(players).forEach((p) => {
    const pid = p?.pitcher_id ?? p?.pitcher_name
    if (!pid) return
    if (!byId[pid]) {
      byId[pid] = {
        pitcher_id: p?.pitcher_id ?? null,
        pitcher_name: clean(p?.pitcher_name, 'Unknown'),
        pitcher_throws: clean(p?.pitcher_throws, '?'),
        pitcher_era: n(p?.pitcher_era, null),
        pitcher_hr9: n(p?.pitcher_hr9, null),
        pitcher_whip: n(p?.pitcher_whip, null),
        pitcher_weak_side: clean(p?.pitcher_weak_side, ''),
        team: clean(p?.opponent || p?.team, ''), // pitcher's OWN team is the batters' opponent
        opponent_team: clean(p?.team, ''),       // the team he's facing
        game_pk: p?.game_pk,
        game_time: p?.game_time,
        venue_name: clean(p?.venue_name, ''),
        lineup_confirmed: false,
        lineup: [],
      }
    }
    const entry = byId[pid]
    if (p?.lineup_confirmed) entry.lineup_confirmed = true
    entry.lineup.push({
      player_id: p?.player_id ?? p?.id,
      name: nameOf(p),
      bats: clean(p?.bats || p?.handedness, '?'),
      lineup_spot: n(p?.lineup_spot, null),
      lineup_confirmed: !!p?.lineup_confirmed,
      weak_spot_flag: p?.weak_spot_flag === true,
      weak_spot_reason: clean(p?.weak_spot_reason, ''),
      pitch_type_match_score: n(p?.pitch_type_match_score, 0),
      hr_score: hrScore(p),
      raw: p,
    })
  })
  return Object.values(byId)
    .map((entry) => ({
      ...entry,
      lineup: entry.lineup.sort((a, b) => (a.lineup_spot ?? 99) - (b.lineup_spot ?? 99)),
      weak_spot_count: entry.lineup.filter((b) => b.weak_spot_flag).length,
    }))
    .sort((a, b) => new Date(a.game_time || 0) - new Date(b.game_time || 0))
}
