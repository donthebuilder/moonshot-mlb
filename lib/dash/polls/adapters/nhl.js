// LAMP's poll adapter (X overhaul stage 3 piece 2). The board is the locked/previewed goal board
// (lib/nhl/boardRead.readBoard); a skater is nameable only with the opposing STARTING GOALIE
// confirmed (lib/dash/namingChecks.nhlNamingProblem). There is no pregame goalie source today
// (lib/nhl/goalies.startersFor returns nothing), so no skater is nameable until one exists: the LAMP poll
// has no players, never posted with a guessed goalie. The goalie is read from the game's `starters`
// by lib/nhl/oppGoalie.js -- the same source and helper as the Slate's NHL adapter (lib/posts/nhl.js).
import { readBoard } from '../../../nhl/boardRead'
import { readHotSticks } from '../../../nhl/hotSticks'
import { nhlGoalieProblem } from '../../../nhl/oppGoalie'
import { easternToday } from '../../../data'
import { byBoard, num, onePerPlayer, rankFromCounts, runLength, txt } from './shared'

const SOG_BAR = 3
const GOAL_STREAK_MIN = 2
const CHECKED = 40

/** Pure: a readBoard() result -> { players, pending } (regular season / playoffs, not started). */
export function nhlPlayersFrom({ board, now = Date.now() }) {
  const players = [], pending = []
  for (const g of board?.games || []) {
    if (Number(g?.game?.gameType) === 1 || g?.game?.state !== 'pre') continue      // preseason never posts; started is gone
    const startMs = Date.parse(g.game.startUtc)
    if (!Number.isFinite(startMs) || startMs <= now) continue
    for (const r of g.rows || []) {
      const id = txt(r.playerId)
      if (!id || !txt(r.name)) continue
      const problem = nhlGoalieProblem(g, r, id)
      if (problem && !problem.pending) continue
      if (problem) { pending.push({ id, reason: problem.reason, startMs }); continue }
      players.push({ id, name: txt(r.name), team: txt(r.team), opp: txt(r.opp) || null, startMs, rank: num(r.rank), score: num(r.score), pos: txt(r.pos), status: r.status })
    }
  }
  return { players: onePerPlayer(players).sort((a, b) => (num(b.score) ?? 0) - (num(a.score) ?? 0) || byBoard(a, b)), pending }
}

/** Pure: hot-sticks rows (spark = [goals, shots] per game, newest first) -> shots and goal-streak facts. */
export function nhlBarsFrom(hot, players) {
  const byId = new Map((hot?.rows || []).map((r) => [String(r.id), r]))
  const out = []
  for (const p of players) {
    const r = byId.get(p.id)
    if (!r || !Array.isArray(r.spark) || r.spark.length < 5) continue
    out.push({ id: p.id, label: `${SOG_BAR}+ shots`, threshold: SOG_BAR, cleared: r.spark.filter((g) => Number(g[1]) >= SOG_BAR).length, of: r.spark.length })
  }
  return out
}
export function nhlStreaksFrom(hot, players) {
  const byId = new Map((hot?.rows || []).map((r) => [String(r.id), r]))
  const out = []
  for (const p of players) {
    const r = byId.get(p.id)
    if (!r || !Array.isArray(r.spark)) continue
    const n = runLength(r.spark, (g) => Number(g[0]) >= 1)
    if (n >= GOAL_STREAK_MIN) out.push({ id: p.id, what: 'a goal', whatKey: 'goal', n, min: GOAL_STREAK_MIN })
  }
  return out
}

export function createNhlPollAdapter({ day, now = Date.now(), db = null } = {}) {
  let _slate = null, _hot
  const slate = async () => {
    if (_slate) return _slate
    const board = await readBoard(day, { market: 'GOAL', net: false }).catch((e) => { console.error(`[polls] nhl board: ${e?.message}`); return null })
    if (!board) return (_slate = { active: false, why: 'no board', players: [], pending: [] })
    const s = nhlPlayersFrom({ board, now })
    // active = a real (non-preseason) game is still to come, even when no skater is nameable yet
    const active = (board.games || []).some((g) => Number(g?.game?.gameType) !== 1 && g?.game?.state === 'pre')
    return (_slate = { active, why: active ? undefined : 'no NHL game left tonight', ...s })
  }
  const hot = async () => (_hot !== undefined ? _hot : (_hot = await readHotSticks({ date: day || easternToday() }).catch(() => null)))
  return {
    sport: 'nhl',
    slate,
    bars: async () => nhlBarsFrom(await hot(), (await slate()).players.slice(0, CHECKED)),
    streaks: async () => nhlStreaksFrom(await hot(), (await slate()).players.slice(0, CHECKED)),
    // LAMP has no public pregame post; its CALLED names are the locked board's called rows
    called: async () => (await slate()).players.filter((p) => p.status === 'called').map((p) => ({ id: p.id, name: p.name, team: p.team })),
    // STORED results only: confirmed, not overturned goals in lamp_goal_feed for the poll's day
    async results(guess) {
      if (!db || !guess?.players?.length) return { known: false, ranking: [] }
      const { data, error } = await db.from('lamp_goal_feed').select('player_id').eq('day', guess.day).in('player_id', guess.players.map((p) => Number(p.id))).not('confirmed_at', 'is', null).is('overturned_at', null)
      if (error) { console.error(`[polls] nhl results: ${error.message}`); return { known: false, ranking: [] } }
      const counts = new Map()
      for (const r of data || []) counts.set(String(r.player_id), (counts.get(String(r.player_id)) || 0) + 1)
      const ranking = rankFromCounts(guess.players, counts)
      return { known: ranking.length > 0, ranking }
    },
  }
}
