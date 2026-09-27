// STORYLINES, ONE READ PER SPORT (BATCH-STORYLINES-PAGE step 2). Server only.
// { sport, day, games: [{ game_id, start, away, home, state }], stories } where
// every story also carries `board`: { status: 'called'|'board'|'off', score,
// rank } -- the product's own words from its one source:
//   MLB  lib/callStatus.js callStatus on the board row's primary role
//        (lib/dash/homerFeed.js boardIndexFrom), score = hr_score
//   NFL  lib/callStatus.js tdCallStatus on onBotFor (this week's pick card)
//        and boardRankFor (the week's TD scores) -- lib/nfl/tdFeed.js
//   NHL  lib/nhl/boardRead.js readBoard: the locked lamp_goal_log row, or the
//        live preview before its lock (scoreNight's status either way)
// A team-level or game-level story (player_id 'team:*' / '_game') has no chip.
// Sports come off the STORY_SPORTS table below -- no sport branch elsewhere.
import { loadMlbStories } from './mlb'
import { loadNflStories, gamesByTeam } from './nfl'
import { loadNhlStories } from './nhl'
import { callStatus, tdCallStatus } from '../callStatus'
import { boardIndexFrom } from '../dash/homerFeed'
import { onBotFor, boardRankFor } from '../nfl/tdFeed'
import { nflPicksPaths, fetchNfl } from '../nfl/dataSource'
import { readBoard } from '../nhl/boardRead'
import { easternToday } from '../data'

const withBoard = (stories, boardOf) => stories.map((s) => ({ ...s, board: s.player_id && !/^(_game|team:)/.test(s.player_id) ? boardOf(s.player_id) : null }))

async function mlb() {
  const { day, rows, games, stories } = await loadMlbStories()
  const idx = boardIndexFrom(rows)
  const boardOf = (pid) => {
    const b = idx.get(String(pid))
    return b ? { status: callStatus({ role: b.role, on_board: true }), score: b.hrScore, rank: b.rank } : { status: 'off', score: null, rank: null }
  }
  return { day, games, stories: withBoard(stories, boardOf) }
}

async function nfl() {
  const { data, stories } = await loadNflStories()
  if (!data) return { day: null, games: [], stories: [] }
  const picks = await fetchNfl(nflPicksPaths().filter((p) => /^https?:/.test(p))).catch(() => null)
  const boardOf = (pid) => {
    const onBot = onBotFor(picks?.card, String(pid))   // nfl_picks.json's card, as the NFL tick reads it
    const tdBoard = boardRankFor(data, String(pid))
    return { status: tdCallStatus({ on_bot: onBot, td_board: tdBoard }), score: tdBoard?.score ?? null, rank: tdBoard?.rank ?? null }
  }
  const STATE = { pre: 'pre', in: 'live', post: 'final' }
  const games = [...new Map([...gamesByTeam(data).values()].map((g) => [g.game_id, g])).values()]
    .map((g) => ({ game_id: g.game_id, start: g.kickoff, away: g.away, home: g.home, state: STATE[g.state] || 'pre', day: g.day }))
  return { day: data.week ? `week ${data.week}` : null, week: data.week, season: data.season, games, stories: withBoard(stories, boardOf) }
}

async function nhl(date) {
  const day = date || easternToday()
  const [{ games, stories }, board] = await Promise.all([loadNhlStories(day), readBoard(day).catch(() => null)])
  const byPid = new Map()
  for (const g of board?.games || []) for (const r of g.rows || []) byPid.set(String(r.playerId), { status: r.status || 'off', score: r.score ?? null, rank: r.rank ?? null, preview: r.preview })
  const boardOf = (pid) => byPid.get(String(pid)) || { status: 'off', score: null, rank: null }
  return { day, games: games.map((g) => ({ game_id: String(g.id), start: g.startUtc, away: g.away.abbrev, home: g.home.abbrev, state: g.state })), stories: withBoard(stories, boardOf) }
}

export const STORY_SPORTS = { mlb, nfl, nhl }

/** Stories for one sport, games in start order. */
export async function loadStories(sport, { date = null } = {}) {
  const run = STORY_SPORTS[sport]
  if (!run) throw new Error(`no story engine for ${sport}`)
  const out = await run(date)
  out.games = (out.games || []).slice().sort((a, b) => String(a.start || '').localeCompare(String(b.start || '')))
  return { sport, ...out }
}
