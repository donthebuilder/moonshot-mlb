// 🏈 THE LIVE FEED, ON THE TABS (2026-09-05).
//
// Until today the Games and Home tabs read `g.away_score` off the BOT payload
// and re-fetched that file every 45 seconds while a game was in progress. The
// file only changes when the bot runs, so the poll was theatre: the score on
// the card was whatever the last pipeline run saw, and the real ESPN feed --
// which lib/nfl/liveSlate.js already fetched for the Wire's toasts -- was
// thrown away for the tabs. Games.js even printed "possession and
// down/distance are not published in the current feed" while the possession
// sat in the snapshot the Wire had just parsed.
//
// This is the overlay. The bot's slate still decides WHICH games are the
// week (and carries the intel the feed never will: rest, weather, venue); the
// live snapshot overwrites the parts that move. Join is on the team pair,
// not the id: the bot's game ids are its own ("seed-den-atl", nflverse keys)
// and ESPN's are ESPN's, and there is no crosswalk in either payload. A team
// plays once a week, so the pair is unambiguous.
//
// Both spellings of the situation fields are written, because Games.js was
// built against the bot's `down_distance` / `red_zone` and liveSlate.js
// parses into `downDistance` / `redZone`. One source, two readers, no edit
// to either reader.
//
// A game the feed has no row for is returned untouched -- never zeroed.
// "no data" and "0-0" must not look the same, which is rule 2 in liveSlate.js.

const key = (g) => [String(g?.home || '').toUpperCase(), String(g?.away || '').toUpperCase()].join('@')

const hasKick = (g) => Number.isFinite(Date.parse(g?.kickoff || ''))

/** Slate games with the live snapshot laid over them. Pure. */
export function mergeLiveGames(games, snap) {
  const slate = Array.isArray(games) ? games : []
  if (!snap?.games?.length) return slate
  const byPair = new Map(snap.games.map((g) => [key(g), g]))
  return slate.map((g) => {
    const live = byPair.get(key(g))
    if (!live) return g
    return {
      ...g,
      home_score: live.home_score,
      away_score: live.away_score,
      state: live.state || g.state,
      detail: live.detail || g.detail,
      completed: Boolean(live.completed),
      clock: live.clock,
      period: live.period,
      possession: live.possession || '',
      downDistance: live.downDistance || '',
      down_distance: live.downDistance || '',
      redZone: Boolean(live.redZone),
      red_zone: Boolean(live.redZone),
      // ESPN's kickoff beats a seed's placeholder; a real kickoff on the slate
      // is kept, since the bot and ESPN agree on it anyway.
      kickoff: hasKick(g) ? g.kickoff : (live.kickoff || g.kickoff),
      live_game_id: live.game_id,
      live_at: snap.at,
    }
  })
}

/** The whole slate payload with its games overlaid. Everything else passes through. */
export function withLive(data, snap) {
  if (!data || !snap) return data
  return { ...data, games: mergeLiveGames(data.games, snap) }
}

// Longer than any football game, including a delay. Past this a game the
// payload still calls neither live nor complete is stale data, not a game.
const STALE_AFTER_MS = 6 * 60 * 60 * 1000
// Start watching a little before kickoff so "his game just started" is early
// rather than a minute late.
const PREGAME_WINDOW_MS = 20 * 60 * 1000

/**
 * Is there anything on this slate worth asking ESPN about right now?
 * Lifted out of NflWire.js so the Wire, the tabs and the Live page all use
 * the one test and cannot drift.
 */
export function worthPolling(games, now = Date.now()) {
  const list = Array.isArray(games) ? games : []
  if (!list.length) return false
  return list.some((g) => {
    if (g.state === 'in') return true
    if (g.completed || g.state === 'post') return false
    const t = g.kickoff ? new Date(g.kickoff).getTime() : NaN
    if (!Number.isFinite(t)) return false
    return t - now < PREGAME_WINDOW_MS && now - t < STALE_AFTER_MS
  })
}

/** The next kickoff on the slate that hasn't happened, or null. */
export function nextKickoff(games, now = Date.now()) {
  let best = null
  for (const g of Array.isArray(games) ? games : []) {
    if (g.state === 'in' || g.completed || g.state === 'post') continue
    const t = g.kickoff ? new Date(g.kickoff).getTime() : NaN
    if (!Number.isFinite(t) || t < now) continue
    if (!best || t < best.t) best = { t, game: g }
  }
  return best
}
