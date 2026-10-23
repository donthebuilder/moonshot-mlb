// 🏀 QUARTER SPLITS (2026-10-22, Donovan: "build quarter splits on the BUCKETS bars"; PropFinder's Q1 / Q2 / Q3 / Q4 / 1H / 2H pills,
// .claude-notes/SPORTS-FOLDER-SCAN.md #6). Pure: ESPN's game summary in, one row per player per period out
// (supabase/migrations/202610230100_buckets_quarters.sql). Counted from the play-by-play, never estimated: a play the feed doesn't
// carry is not counted, so a period's numbers add up to the box score only as far as the feed does (scripts/check-nba-quarters.mjs
// checks that on real games).
//
//   pts  scoreValue of every scoring play, to the scorer (participants[0]); free throws included
//   tpm / tpa  three-point attempts (the play's pointsAttempted = 3; its words don't always say "three point"), made = scoring;
//              an end-of-period heave is nobody's (the box leaves it out)
//   reb  every "Offensive Rebound" / "Defensive Rebound" with a player on it (team rebounds have none)
//   ast  the second participant of a made field goal whose words say "assists"
// Overtimes are periods 5, 6, ...; the halves are read as Q1+Q2 and Q3+Q4 (an overtime is in neither).
import { orderedPlays } from './openings'

const num = (v) => { const x = Number(v); return Number.isFinite(x) ? x : null }
const words = (p) => `${p?.type?.text || ''} ${p?.text || ''}`
const who = (p, i) => (p?.participants?.[i]?.athlete?.id != null ? String(p.participants[i].athlete.id) : null)

/** summary -> [{ player_id, period, pts, reb, ast, tpm, tpa }] (only players with a play in that period). */
export function quarterLines(summary) {
  const rows = new Map()
  const at = (pid, period) => {
    const k = `${pid}|${period}`
    if (!rows.has(k)) rows.set(k, { player_id: pid, period, pts: 0, reb: 0, ast: 0, tpm: 0, tpa: 0 })
    return rows.get(k)
  }
  for (const p of orderedPlays(summary)) {
    const period = num(p?.period?.number)
    if (!period) continue
    const w = words(p)
    if (/rebound/i.test(p?.type?.text || '')) {
      const r = who(p, 0)
      if (r) at(r, period).reb += 1
      continue
    }
    if (!p.shootingPlay && !p.scoringPlay) continue
    const shooter = who(p, 0)
    // an end-of-period heave is in the feed but not in the box score's attempts
    if (!shooter || /heave/i.test(w)) continue
    const made = p.scoringPlay === true
    const value = num(p.scoreValue) || 0
    const three = !/free throw/i.test(w) && (num(p.pointsAttempted) === 3 || (p.pointsAttempted == null && /three point/i.test(w)))
    const row = at(shooter, period)
    if (made && value > 0) row.pts += value
    if (three) { row.tpa += 1; if (made) row.tpm += 1 }
    if (made && !/free throw/i.test(w) && /assist/i.test(w)) {
      const a = who(p, 1)
      if (a) at(a, period).ast += 1
    }
  }
  return [...rows.values()]
}

export const SEGMENTS = [
  { k: 'full', label: 'Game', periods: null },
  { k: 'q1', label: 'Q1', periods: [1] },
  { k: 'q2', label: 'Q2', periods: [2] },
  { k: 'q3', label: 'Q3', periods: [3] },
  { k: 'q4', label: 'Q4', periods: [4] },
  { k: 'h1', label: '1H', periods: [1, 2] },
  { k: 'h2', label: '2H', periods: [3, 4] },
]

/** One game's line in a segment from its period rows ({ [period]: row }); null when the game has no period rows on file. */
export function segmentLine(byPeriod, seg) {
  if (!byPeriod) return null
  const s = SEGMENTS.find((x) => x.k === seg)
  if (!s?.periods) return null
  const out = { pts: 0, reb: 0, ast: 0, tpm: 0, tpa: 0 }
  for (const pr of s.periods) {
    const r = byPeriod[pr]
    if (!r) continue
    for (const k of Object.keys(out)) out[k] += Number(r[k]) || 0
  }
  return out
}

/**
 * Write one game's period rows (regular season and playoffs only). game: { gameId, gameDate, season, seasonType }.
 * Returns null on success, else a short reason (the tick logs it and never holds the game open on it).
 */
export async function writeQuarters(db, summary, game, source = 'tick') {
  if (game.seasonType !== 2 && game.seasonType !== 3) return null
  const lines = quarterLines(summary)
  if (!lines.length) return 'no plays'
  const rows = lines.map((r) => ({ ...r, game_id: String(game.gameId), game_date: game.gameDate, season: game.season ?? null, season_type: game.seasonType, source }))
  const w = await db.from('buckets_quarters').upsert(rows, { onConflict: 'game_id,player_id,period' })
  return w.error ? w.error.message : null
}
