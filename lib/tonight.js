// TONIGHT, IN THREE ROWS (2026-10-04, Donovan approved the shape): the top of
// every Home answers who WENT, who's LINING UP with tonight's number, and who's
// STILL TO GO -- the called and on-the-board players in live or upcoming games
// who haven't scored. The full Ledger stays the deep page behind it.
//
// PURE. Each sport's builder takes what its Home already holds and returns
// { went, lining, still, called: { scored, of } }, items { id, name, team, note, when?: 'now'|'later', status? }.
//   · status words come from lib/callStatus (callStatus / tdCallStatus) or the
//     board row's own status (NHL / NBA: scoreNight wrote it) -- never re-derived;
//   · LINING UP is the sport's Numerology page result handed in as-is
//     (alignedWith(...).byBotScore: 2+ of his own numbers on the date's root),
//     so the two can't disagree;
//   · nothing is filled: an empty row is an empty array.
import { callStatus, tdCallStatus } from './callStatus'

const byStill = (a, b) => (a.when === b.when ? 0 : a.when === 'now' ? -1 : 1) || (b.score ?? -1) - (a.score ?? -1)
const STILL = new Set(['called', 'board'])
const r1 = (v) => (Number.isFinite(Number(v)) ? Math.round(Number(v)) : null)

/** The Numerology page's byBotScore list -> LINING UP items. */
export function liningFrom(aligned = [], root = null) {
  return (aligned || []).map((m) => ({ id: String(m.a?.pid ?? m.a?.id ?? ''), name: m.a?.name, team: m.a?.team || null, note: root ? `${root}×${m.strength}` : null }))
    .filter((x) => x.id && x.name)
}

function finish(went, lining, cands) {
  const still = cands.filter((c) => STILL.has(c.status) && c.when && !c.scored).sort(byStill)
    .map((c) => ({ id: c.id, name: c.name, team: c.team, when: c.when, status: c.status, note: c.score != null ? String(r1(c.score)) : null }))
  // THE LEDGER'S ONE LINE (2026-10-07): of the men CALLED tonight, how many have scored so far. Read off the
  // same candidates, with the same status words (lib/callStatus; scoreNight for hockey) -- nothing new is fetched.
  // A called skater who did not dress is neither a hit nor a miss (the record sets him aside), so he is not counted --
  // the same denominator as the NHL Ledger's "7 of 14 called who dressed scored" (lib/sports/nhl/ledger.js).
  const calledMen = cands.filter((c) => c.status === 'called' && !c.out)
  return { went, lining, still, called: { scored: calledMen.filter((c) => c.scored).length, of: calledMen.length } }
}

/**
 * MOONSHOT.
 * @param board   boardOrder(players) -- the board in rank order (lib/boardOrder)
 * @param of      boardOfRows(players) || players.length
 * @param lines   fetchLiveSlate().lines (pid -> { hr, state, name, pk }) or null
 * @param games   fetchLiveSlate().games ([{ pk, state, postponed }]) or null
 * @param homers  graded fallback rows [{ player_id, name, team }] (before the live feed answers)
 * @param scoreOf boardScore (lib/boardOrder)
 */
export function tonightMlb({ board = [], of = 0, lines = null, games = null, homers = [], scoreOf = () => null, aligned = [], root = null, nameOf = (p) => p?.name, teamOf = (p) => p?.team }) {
  const byId = new Map(board.map((p) => [String(p.player_id ?? p.id), p]))
  const went = new Map()
  for (const [pid, l] of Object.entries(lines || {})) {
    if (!(Number(l?.hr) >= 1)) continue
    const p = byId.get(String(pid))
    went.set(String(pid), { id: String(pid), name: p ? nameOf(p) : l.name, team: p ? teamOf(p) : null, note: Number(l.hr) > 1 ? `×${l.hr}` : null })
  }
  for (const h of homers || []) {
    const id = String(h.player_id ?? '')
    if (id && !went.has(id)) went.set(id, { id, name: h.name || nameOf(byId.get(id)), team: h.team || null, note: null })
  }
  const gameState = new Map((games || []).map((g) => [String(g.pk), g.postponed ? 'postponed' : g.state]))
  const cands = board.map((p, i) => {
    const id = String(p.player_id ?? p.id)
    const st = gameState.get(String(p.game_pk)) || lines?.[id]?.state || 'Preview'
    return {
      id, name: nameOf(p), team: teamOf(p), score: scoreOf(p),
      status: callStatus({ role: p.game_pick_role, board_rank: i + 1, board_of: of }),
      when: st === 'Live' ? 'now' : st === 'Final' || st === 'postponed' ? null : 'later',
      scored: went.has(id),
    }
  })
  return finish([...went.values()], liningFrom(aligned, root), cands)
}

/**
 * TUDDY. `rows` = tdPool(slate).rows -- the WEEK's board in score order (ON THE BOARD is its top
 * third, so ranks are taken against the whole week); `today(p)` keeps the men playing today;
 * `onBotOf(p)` = lib/nfl/tdFeed onBotFor (the TD ladder, then his game's call) -- what makes him CALLED;
 * `tdsOf(p)` = live + graded touchdowns (the TdWatch rule);
 * `stateOf(p)` = his game's 'pre' | 'in' | 'post'.
 */
export function tonightNfl({ rows = [], today = () => true, onBotOf = () => null, tdsOf = () => 0, stateOf = () => 'pre', aligned = [], root = null }) {
  const went = [], cands = []
  rows.forEach((p, i) => {
    if (!today(p)) return
    const td = Number(tdsOf(p)) || 0
    if (td > 0) went.push({ id: String(p.player_id), name: p.name, team: p.team, note: td > 1 ? `×${td}` : null })
    const st = stateOf(p)
    cands.push({
      id: String(p.player_id), name: p.name, team: p.team, score: p.scores?.TD,
      status: tdCallStatus({ on_bot: onBotOf(p), td_board: { rank: i + 1, of: rows.length } }),
      when: st === 'in' ? 'now' : st === 'pre' ? 'later' : null, scored: td > 0,
    })
  })
  return finish(went, liningFrom(aligned, root), cands)
}

/**
 * LAMP. `games` = the goal board's games ([{ game: { id, state }, rows: [{ playerId, name, team, score, status }] }]);
 * `scorers` = tonight's goals from the scores feed ([{ id, name, team }]).
 */
export function tonightNhl({ games = [], scorers = [], aligned = [], root = null }) {
  const full = new Map()
  for (const g of games || []) for (const r of g.rows || []) full.set(String(r.playerId), r)
  const went = new Map()
  for (const s of scorers || []) {
    const id = String(s.id ?? '')
    if (!id) continue
    const prev = went.get(id)
    went.set(id, { id, name: full.get(id)?.name || s.name, team: s.team || full.get(id)?.team || null, note: prev ? `×${(Number(prev.note?.slice(1)) || 1) + 1}` : null })
  }
  const cands = []
  for (const g of games || []) {
    const st = g.game?.state
    for (const r of g.rows || []) {
      cands.push({ id: String(r.playerId), name: r.name, team: r.team, score: r.score, status: r.status,
        when: st === 'live' ? 'now' : st === 'pre' ? 'later' : null, scored: went.has(String(r.playerId)), out: r.dressed === false })
    }
  }
  return finish([...went.values()], liningFrom(aligned, root), cands)
}

/**
 * BUCKETS. `rows` = the PTS board's rows ({ playerId, name, team, gameId, score, status, locked });
 * `games` = its games ({ id, state }); `cleared` = the ledger's PTS 25+ rows ({ playerId, name, team, value });
 * `aligned` / `root` = the Numerology tab's carriers (lib/nba/alignRows, 2026-10-05), as LAMP's.
 * A row that isn't locked yet is a projection, not a call: STILL TO GO takes locked rows only.
 */
export function tonightNba({ rows = [], games = [], cleared = [], aligned = [], root = null }) {
  const went = (cleared || []).map((c) => ({ id: String(c.playerId), name: c.name, team: c.team || null, note: c.value != null ? String(c.value) : null }))
  const done = new Set(went.map((w) => w.id))
  const state = new Map((games || []).map((g) => [String(g.id), g.state]))
  const cands = (rows || []).filter((r) => r.locked).map((r) => {
    const st = state.get(String(r.gameId))
    return { id: String(r.playerId), name: r.name, team: r.team, score: r.score, status: r.status,
      when: st === 'live' ? 'now' : st === 'pre' ? 'later' : null, scored: done.has(String(r.playerId)) }
  })
  return finish(went, liningFrom(aligned, root), cands)
}

export const TONIGHT = { mlb: tonightMlb, nfl: tonightNfl, nhl: tonightNhl, nba: tonightNba }
