// THE THREE LANES (Path to Victory A1, 2026-09-14).
//
// One question, three honest answers, never mixed:
//
//   PICKS   the TOP / HR designation, ~2 names a game   ->  ~16% of all HR
//   BOARD   per-game top-8 in board order, ~110 names  ->  ~59% of all HR
//   RATED   every hitter the slate scored, ~240         ->  ~94% of all HR
//
// Those rates are measured off the LOCKED per-game runs, 274 games 08-21 ->
// 09-13 (claude/step-0-gate-done-2026-09-13.md). The lane a homer lands in is
// the lane it gets reported in: a RATED hit is never written up in PICKS
// language, because at RATED you have named two-thirds of the league. Called
// It posts RATED and says so.
//
// Ranks here come off the slate the page is showing. That is the board the
// reader saw; the graded archive keeps the locked one.
import { hrScore, mlbId } from './player'
import { boardCompare } from './boardOrder'
import { rolesOf } from './verdict'

export const BOARD_DEPTH = 8

export const LANES = {
  picks: { key: 'picks', label: 'PICKS', title: 'The bot\'s TOP and HR designations — the bet slip. About two names a game.' },
  board: { key: 'board', label: 'BOARD', title: `Each game's top ${BOARD_DEPTH} by HR score — live, worth watching. Not a pick.` },
  rated: { key: 'rated', label: 'RATED', title: 'Every hitter the slate scored. "On our board" — the tracker lane, and the honest home of a 90%+ number.' },
}

/** Map player_id -> rank inside HIS game in board order (1 = that game's top bat). */
export function gameRank(players) {
  const byGame = new Map()
  for (const p of players || []) {
    const gp = p?.game_pk
    if (gp == null || !mlbId(p)) continue
    if (!byGame.has(gp)) byGame.set(gp, [])
    byGame.get(gp).push(p)
  }
  const out = new Map()
  for (const list of byGame.values()) {
    list.sort(boardCompare)   // 2026-09-25: the board order, not raw hr_score
    list.forEach((p, i) => { if (!out.has(mlbId(p))) out.set(mlbId(p), i + 1) })
  }
  return out
}

export const isPick = (p) => {
  const t = rolesOf(p)
  return t.includes('TOP') || t.includes('HR')
}

/** The innermost lane a slate row sits in: 'picks' | 'board' | 'rated'. */
export function laneOf(p, ranks) {
  if (!p) return null
  if (isPick(p)) return 'picks'
  const r = ranks?.get(mlbId(p))
  if (r != null && r <= BOARD_DEPTH) return 'board'
  return 'rated'
}

/**
 * Tonight's record in three lanes.
 * @param players  the slate rows the page is showing
 * @param homers   hr_capture_report.all_homer_entries (or merged_homers): every
 *                 homer hit tonight, rated or not, keyed by player_id
 */
export function laneRecord(players, homers) {
  const rows = (players || []).filter((p) => mlbId(p))
  const ranks = gameRank(rows)
  const byId = new Map(rows.map((p) => [mlbId(p), p]))
  const seen = new Set()
  let total = 0
  const hit = { picks: 0, board: 0, rated: 0 }
  for (const h of homers || []) {
    const id = Number(h?.player_id)
    if (!id || seen.has(id)) continue   // one homer-hitter counts once, however many he hit
    seen.add(id)
    total += 1
    const p = byId.get(id)
    if (!p) continue                    // an unrated bat homered: a miss in every lane
    const lane = laneOf(p, ranks)
    hit.rated += 1
    if (lane === 'picks' || lane === 'board') hit.board += 1
    if (lane === 'picks') hit.picks += 1
  }
  const games = new Set(rows.map((p) => p.game_pk)).size
  const pool = {
    picks: rows.filter(isPick).length,
    board: rows.filter((p) => (ranks.get(mlbId(p)) ?? 99) <= BOARD_DEPTH).length,
    rated: rows.length,
  }
  return { total, games, hit, pool, ranks }
}
