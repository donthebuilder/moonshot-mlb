// NHL: lamp_goal_log / lamp_prop_log rows -> LearnRows (2026-10-12, accuracy loop). Pure; the script does the reads.
// The status on each row is the one stored at lock (LAMP's scoreNight, lib/nhl/goalModel.js): never re-derived here.
// A row is SETTLED (produced true/false) only when graded and the skater dressed; otherwise produced is null (void).
import { numericFeatures } from '../features'

const ms = (s) => { const t = Date.parse(s); return Number.isFinite(t) ? t : null }

/** One lamp_goal_log (market 'GOAL') or lamp_prop_log row. Needs start_utc and locked_at to count as pregame. */
export function nhlRow(r, market = r.market || 'GOAL') {
  const settled = Boolean(r.graded_at) && r.dressed !== false && r.hit != null
  return {
    sport: 'nhl', market, unit: r.game_date, date: r.game_date, id: String(r.player_id), name: r.name, team: r.team, opp: r.opp,
    version: r.model_version, status: r.status, produced: settled ? r.hit === true : null,
    score: Number.isFinite(Number(r.score)) ? Number(r.score) : null,
    features: {
      ...numericFeatures([['legs', r.legs], ['pct', r.pct], ['context', r.context]]),
      ...(Number.isFinite(Number(r.rank_in_game)) ? { rank_in_game: Number(r.rank_in_game) } : {}),
      ...(typeof r.home === 'boolean' ? { home: r.home ? 1 : 0 } : {}),
    },
    lockedAt: ms(r.locked_at), startAt: ms(r.start_utc),
  }
}

/** Regular season only (game_type 2); the postseason is its own block and preseason is out, the record's own rule. */
export const nhlRows = (dbRows, market) => (dbRows || []).filter((r) => Number(r.game_type) === 2).map((r) => nhlRow(r, market))
