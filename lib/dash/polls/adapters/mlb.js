// MOONSHOT's poll adapter (X overhaul stage 3 piece 2). The board is the published slate; a hitter
// is nameable once his lineup is posted with him in it and the starter is confirmed
// (lib/dash/namingChecks.js mlbNamingProblem), and his game has not started.
import { fetchBoardFull, fetchRunMeta } from '../../board'
import { fetchLiveSlate } from '../../../liveSlate'
import { liveIndexFrom } from '../../tweetFeed'
import { slateDateFromRows } from '../../../data'
import { thresholdRates } from '../../../gamelogs'
import { mlbNamingProblem } from '../../namingChecks'
import { byBoard, namesFromPostPayload, num, onePerPlayer, rankFromCounts, storedPayload, txt } from './shared'

const ON_BOARD_MAX = 40          // a poll names men the board actually has high
const STREAK_LADDER = [
  { key: 'hr', what: 'a home run', whatKey: 'hr', min: 2 },
  { key: 'hit', what: 'a hit', whatKey: 'hit', min: 6 },
]
const CHECKED = 12               // game logs are read for the top dozen only (cost)

/** Pure: board rows + the live-slate index -> { players, pending }. */
export function mlbPlayersFrom({ rows, live = null, now = Date.now() }) {
  const players = [], pending = []
  for (const r of Array.isArray(rows) ? rows : []) {
    const id = txt(r?.player_id), name = txt(r?.name)
    const rank = num(r?.board_rank)
    if (!id || !name || rank == null || rank > ON_BOARD_MAX) continue
    const startMs = Date.parse(r?.game_time)
    if (!Number.isFinite(startMs) || startMs <= now) continue
    const problem = mlbNamingProblem(r, { live })
    if (problem && !problem.pending) continue                       // out / not on the slate / already started
    const p = { id, name, team: txt(r.team), opp: txt(r.opponent) || null, startMs, rank, score: num(r.hr_score), pos: null }
    if (problem) pending.push({ id, reason: problem.reason, startMs })
    else players.push(p)
  }
  return { players: onePerPlayer(players).sort(byBoard), pending }
}

/** Pure: game-log rates by player id -> the 2+ total bases bar with his real count over the last ten. */
export function mlbBarsFrom(ratesById, players) {
  const out = []
  for (const p of players) {
    const l10 = ratesById.get(p.id)?.markets?.tb2?.L10
    if (l10 && Number.isInteger(l10.ok) && Number.isInteger(l10.n)) out.push({ id: p.id, label: '2+ total bases', threshold: 2, cleared: l10.ok, of: l10.n })
  }
  return out
}

/** Pure: his current run of games with a home run / a hit, where it clears the ladder's floor. */
export function mlbStreaksFrom(ratesById, players) {
  const out = []
  for (const p of players) {
    const m = ratesById.get(p.id)?.markets
    for (const s of STREAK_LADDER) if (Number(m?.[s.key]?.streak) >= s.min) out.push({ id: p.id, what: s.what, whatKey: s.whatKey, n: Number(m[s.key].streak), min: s.min })
  }
  return out
}

/** The Slate (10-09 on) replaced the pregame post: MOONSHOT's names are the slate row's `picks`, narrowed by the
 *  MLB ids it really named. Days before the Slate (`SLATE_FROM`) read the old pregame row. */
export const SLATE_FROM = '2026-10-10'
export async function mlbCalledNames(db, day) {
  const slate = await storedPayload(db, day, 'slate')
  if (slate) {
    const mlb = slate.named_by_sport && Array.isArray(slate.named_by_sport.mlb) ? slate.named_by_sport.mlb : null
    return namesFromPostPayload({ picks: slate.picks, named: mlb && mlb.length ? mlb : null })
  }
  return String(day) < SLATE_FROM ? namesFromPostPayload(await storedPayload(db, day, 'pregame')) : []
}

export function createMlbPollAdapter({ day, now = Date.now(), db = null } = {}) {
  let _slate = null, _rates = null, _rows = []
  const slate = async () => {
    if (_slate) return _slate
    const [rows, meta] = await Promise.all([fetchBoardFull('today').catch(() => null), fetchRunMeta('today').catch(() => null)])
    // tonight's board only: the run_meta AND the rows' own game dates say today (the 9/26 stale-board lesson)
    const fresh = Array.isArray(rows) && rows.length && meta?.slate_date === day && slateDateFromRows(rows) === day
    if (!fresh) return (_slate = { active: false, why: 'no board for today yet', players: [], pending: [] })
    _rows = rows
    const live = liveIndexFrom(await fetchLiveSlate().catch(() => null))
    const { players, pending } = mlbPlayersFrom({ rows, live, now })
    return (_slate = { active: true, players, pending })
  }
  const rates = async () => {
    if (_rates) return _rates
    const { players } = await slate()
    const map = new Map()
    await Promise.all(players.slice(0, CHECKED).map(async (p) => { const r = await thresholdRates(p.id).catch(() => null); if (r) map.set(p.id, r) }))
    return (_rates = map)
  }
  return {
    sport: 'mlb',
    slate,
    // the board rows behind the slate (the fact engine reads batter-vs-starter off them); [] until slate() has run
    rows: async () => { await slate(); return _rows },
    bars: async () => mlbBarsFrom(await rates(), (await slate()).players.slice(0, CHECKED)),
    streaks: async () => mlbStreaksFrom(await rates(), (await slate()).players.slice(0, CHECKED)),
    called: async () => mlbCalledNames(db, day),
    // STORED results only: homer_feed rows for the poll's day; nobody on file = unknown
    async results(guess) {
      if (!db || !guess?.players?.length) return { known: false, ranking: [] }
      const { data, error } = await db.from('homer_feed').select('player_id').eq('day', guess.day).in('player_id', guess.players.map((p) => String(p.id)))
      if (error) { console.error(`[polls] mlb results: ${error.message}`); return { known: false, ranking: [] } }
      const counts = new Map()
      for (const r of data || []) counts.set(String(r.player_id), (counts.get(String(r.player_id)) || 0) + 1)
      const ranking = rankFromCounts(guess.players, counts)
      return { known: ranking.length > 0, ranking }
    },
  }
}
