'use client'
// ONE GLOBAL SEARCH, THE INDEXES (2026-10-07). What each product's search reads, and nothing new:
// every file here is one the product already loads for its own Players page and its own scoreboard.
//
//   MOONSHOT  players: the 40-man roster file (fetchRosters, data branch rosters_mlb.json, ~400 KB, 10-min share)
//             games:   MLB's schedule for the day (the ticker's own call) + team ids -> codes
//   TUDDY     players: nfl_roster.json (the Players page's useRosterExtras reads it)
//             games:   ESPN's scoreboard (the ticker's own read; fetchNflGames, no box scores)
//   LAMP      players: /api/lamp/players (the Players page's own route, ~750 rows, edge-cached 30 min)
//             games:   /api/lamp/scores (the header's own read)
//   BUCKETS   players: /api/buckets/players (the Players page's own route, gated)
//             games:   /api/buckets/scores
//
// Nothing is stored and nothing polls: a product's index loads ONCE per page load, the first time
// the box needs it (players when two letters are typed, games with them); games are re-read after
// 5 minutes if the box is opened again. A failed read is an empty list, never a made-up one.
import { fetchRosters } from '../dataSource'
import { scheduleFor, slateDay } from '../boxscore'
import { teamAbbrs } from '../gamelogs'
import { fetchNfl, nflRosterPaths } from '../nfl/dataSource'
import { fetchNflGames } from '../nfl/liveSlate'
import { localTime, localDayTime } from '../localTime'
import { sportKey } from '../routes'

const getJson = (url) => fetch(url, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)

// MLB roster file's status codes, in the words a row shows (the roster hit used to say this itself).
const MLB_STATUS = { A: '', RM: 'minors', D7: 'IL-7', D10: 'IL-10', D15: 'IL-15', D60: 'IL-60', PL: 'paternity', BRV: 'bereavement', SU: 'suspended' }

const PLAYERS = {
  mlb: async () => {
    // fetchShared answers { ok, status, data } -- the file is `data`. (QuickSearch used to read `.players` off the
    // envelope, so the roster file never loaded and every off-slate name fell through to the live people-search.)
    const env = await fetchRosters()
    const d = env?.data ?? null
    return (Array.isArray(d?.players) ? d.players : []).filter((p) => p.player_id != null && p.name)
      .sort((a, b) => (a.is_pitcher - b.is_pitcher) || ((b.season?.pa || 0) - (a.season?.pa || 0)))
      .map((p) => ({ id: p.player_id, name: p.name, team: p.team || '', pos: p.pos || '', status: String(p.status || ''), note: MLB_STATUS[String(p.status || '')] ?? String(p.status_word || p.status || ''), raw: p }))
  },
  nfl: async () => {
    const d = await fetchNfl(nflRosterPaths()).catch(() => null)
    return (Array.isArray(d?.players) ? d.players : []).filter((p) => p.gsis_id && p.name)
      .map((p) => ({ id: p.gsis_id, name: p.name, team: p.team || '', pos: p.position || '' }))
  },
  nhl: async () => {
    const d = await getJson('/api/lamp/players')
    return (Array.isArray(d?.players) ? d.players : []).filter((p) => p.id != null && p.name)
      .map((p) => ({ id: p.id, name: p.name, team: p.team || '', pos: p.pos || '' }))
  },
  nba: async () => {
    const d = await getJson('/api/buckets/players')
    return (Array.isArray(d?.players) ? d.players : []).filter((p) => p.id != null && p.name)
      .map((p) => ({ id: p.id, name: p.name, team: p.team || '', pos: p.pos || '' }))
  },
}

const innWord = (g) => `${/^top/i.test(g.inningState || '') ? 'Top' : /^bot/i.test(g.inningState || '') ? 'Bot' : /^mid/i.test(g.inningState || '') ? 'Mid' : /^end/i.test(g.inningState || '') ? 'End' : ''} ${g.inning || ''}`.trim()
const score = (a, h) => (a != null && h != null ? `${a}–${h}` : '')
const GAMES = {
  mlb: async () => {
    const [list, abbrs] = await Promise.all([scheduleFor(slateDay(0)).catch(() => null), teamAbbrs().catch(() => null)])
    const code = (side) => side?.abbr || abbrs?.[side?.id] || ''
    return (Array.isArray(list) ? list : []).map((g) => ({
      id: g.pk, away: code(g.away), home: code(g.home),
      status: g.postponed ? 'Postponed' : g.live ? `${innWord(g)} ${score(g.away.score, g.home.score)}`.trim() : g.final ? `Final ${score(g.away.score, g.home.score)}`.trim() : localTime(g.startTime, { zone: false }),
    })).filter((g) => g.id && g.away && g.home)
  },
  nfl: async () => {
    const list = await fetchNflGames().catch(() => [])
    return (Array.isArray(list) ? list : []).map((g) => ({
      id: g.game_id, away: g.away, home: g.home,
      status: g.state === 'in' ? `${g.detail || 'Live'} ${score(g.away_score, g.home_score)}`.trim() : g.state === 'post' ? `Final ${score(g.away_score, g.home_score)}`.trim() : localDayTime(g.kickoff, { zone: false }),
    })).filter((g) => g.id && g.away && g.home)
  },
  nhl: async () => {
    const d = await getJson('/api/lamp/scores')
    return (Array.isArray(d?.games) ? d.games : []).map((g) => ({
      id: g.id, away: g.away?.abbrev, home: g.home?.abbrev,
      status: g.state === 'live' ? `${g.statusLine || g.periodLabel || 'Live'} ${score(g.away?.score, g.home?.score)}`.trim() : g.state === 'final' ? `Final ${score(g.away?.score, g.home?.score)}`.trim() : localTime(g.startUtc, { zone: false }),
    })).filter((g) => g.id && g.away && g.home)
  },
  nba: async () => {
    const d = await getJson('/api/buckets/scores')
    return (Array.isArray(d?.games) ? d.games : []).map((g) => ({
      id: g.id, away: g.away?.abbrev, home: g.home?.abbrev,
      status: g.state === 'live' ? `${g.detail || 'Live'} ${score(g.away?.score, g.home?.score)}`.trim() : g.state === 'final' ? `Final ${score(g.away?.score, g.home?.score)}`.trim() : localTime(g.start, { zone: false }),
    })).filter((g) => g.id && g.away && g.home)
  },
}

const GAMES_TTL = 5 * 60 * 1000
const cache = new Map()   // `p:mlb` / `g:mlb` -> { p: Promise, at }
function once(key, load, ttl = 0) {
  const hit = cache.get(key)
  if (hit && (!ttl || Date.now() - hit.at < ttl)) return hit.p
  const p = Promise.resolve().then(load).catch(() => [])
  cache.set(key, { p, at: Date.now() })
  // an empty answer is a failed read as often as an empty league: ask again next time, never keep the miss
  p.then((r) => { if (!r?.length && cache.get(key)?.p === p) cache.delete(key) })
  return p
}

/** One product's people, loaded once per page load. */
export const loadPlayers = (sport) => once(`p:${sportKey(sport)}`, PLAYERS[sportKey(sport)])
/** One product's games for the day, re-read after five minutes. */
export const loadGames = (sport) => once(`g:${sportKey(sport)}`, GAMES[sportKey(sport)], GAMES_TTL)
