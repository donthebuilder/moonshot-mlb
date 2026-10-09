// PRE-GAME TOUCHDOWN SNAPSHOTS (2026-10-08, fix10-nfl-1008).
//
// WHY. The old game number was the sum of the players' xTD. It was never stored
// before kickoff, so "old sum vs team model vs what happened" could not be
// answered afterwards. From now on each game is stamped ONCE, before its
// kickoff, with both numbers side by side. The read side is
// scripts/nfl-td-compare.mjs.
//
// RULES (tested in scripts/check-nfl-game-snapshot.mjs, TEST data):
//   - a game is stamped only while now < its kickoff (never at or after);
//   - one row per (game_id, model_version), written with ignore-duplicates, so
//     a second pass never rewrites it; a new model is a new model_version;
//   - preseason is not stamped (the model has no club rates for it).
// Pure functions here; the one write is stampSnapshots(), called from the
// existing NFL tick (no new cron).
import { slateTotals, teamGames, PARAMS } from './teamTdModel'

export const SNAPSHOT_TABLE = 'nfl_game_td_snapshots'

/** Changes whenever a model knob changes, so a retuned model never overwrites an older stamp. */
export const MODEL_VERSION = `nfl-team-td:carry${PARAMS.carry}-k${PARAMS.k}-a${PARAMS.a}-b${PARAMS.b}-cover${PARAMS.cover}`

/** The old dial: the sum of the scored players' xTD for one club (the same filter the old dial used). */
export const playersXtdSum = (players, team) => (players || [])
  .filter((p) => p && p.team === team && !p.on_bye && p.stats)
  .reduce((s, p) => s + (Number(p.stats.xTD) || 0), 0)

/** Games of this week file still to kick off at `now` (ms), as the rows to store. [] when nothing is stampable. */
export function buildSnapshots({ week, logs, now = Date.now(), modelVersion = MODEL_VERSION }) {
  if (!week || week.mode === 'preseason' || !Array.isArray(week.games)) return []
  const season = Number(week.season); const wk = Number(week.week)
  if (!season || !wk) return []
  const totals = slateTotals(week, logs)
  const stamped_at = new Date(now).toISOString()
  const out = []
  for (const g of week.games) {
    const t = Date.parse(String(g?.kickoff || ''))
    if (!g?.game_id || !g.home || !g.away || !Number.isFinite(t) || now >= t) continue   // unknown kickoff: not stamped
    const m = totals[g.game_id]
    if (!m) continue
    out.push({
      game_id: String(g.game_id), season, week: wk, home: g.home, away: g.away, kickoff: new Date(t).toISOString(),
      team_model_total: m.total, team_model_home: m.homeTd, team_model_away: m.awayTd,
      players_xtd_sum_home: playersXtdSum(week.players, g.home), players_xtd_sum_away: playersXtdSum(week.players, g.away),
      model_version: modelVersion, stamped_at,
    })
  }
  return out
}

const missing = (error) => error && (error.code === '42P01' || error.code === 'PGRST205' || /does not exist|schema cache/i.test(error.message || ''))

/** Stamp whatever is stampable. Never throws; never rewrites (ignoreDuplicates on the key).
 *  Cost: one small select per tick; the (big) logs file is read only when a game is still unstamped. */
export async function stampSnapshots(db, { week, getLogs, now = Date.now(), modelVersion = MODEL_VERSION }) {
  try {
    if (!week || week.mode === 'preseason' || !week.games?.length) return 'no-week'
    const upcoming = week.games.filter((g) => g?.game_id && now < Date.parse(String(g.kickoff || '')))
    if (!upcoming.length) return 'nothing-before-kickoff'
    const { data: have, error: e1 } = await db.from(SNAPSHOT_TABLE).select('game_id')
      .eq('season', Number(week.season)).eq('week', Number(week.week)).eq('model_version', modelVersion)
    if (missing(e1)) return 'table-missing (run supabase/migrations/202610081300_nfl_game_td_snapshots.sql)'
    if (e1) return `error: ${e1.message}`
    const done = new Set((have || []).map((r) => String(r.game_id)))
    if (upcoming.every((g) => done.has(String(g.game_id)))) return 'all-stamped'
    const logs = await getLogs()
    if (!logs) return 'no-logs'
    const rows = buildSnapshots({ week, logs, now, modelVersion }).filter((r) => !done.has(r.game_id))
    if (!rows.length) return 'nothing-new'
    const { error } = await db.from(SNAPSHOT_TABLE).upsert(rows, { onConflict: 'game_id,model_version', ignoreDuplicates: true })
    if (missing(error)) return 'table-missing (run supabase/migrations/202610081300_nfl_game_td_snapshots.sql)'
    return error ? `error: ${error.message}` : `stamped ${rows.length}`
  } catch (e) { return `error: ${e?.message}` }
}

/** THE COMPARISON (pure). snapshots: stored rows. logs: the nfl_logs.json payload, whose club-per-game touchdowns
 *  are the unit both numbers are in (tracked skill-player touchdowns). A game with no logged result yet (no club
 *  entries for that week) is `actual: null` and left out of the error totals. */
export function compareSnapshots(snapshots, logs) {
  const byClub = new Map()
  for (const r of teamGames(logs)) byClub.set(`${r.s}|${r.w}|${r.tm}`, r.td)
  const rows = (snapshots || []).map((s) => {
    const a = byClub.get(`${s.season}|${s.week}|${s.away}`); const h = byClub.get(`${s.season}|${s.week}|${s.home}`)
    const actual = a != null && h != null ? a + h : null
    const old = s.players_xtd_sum_home + s.players_xtd_sum_away
    return { game_id: s.game_id, season: s.season, week: s.week, game: `${s.away} @ ${s.home}`, model_version: s.model_version,
      old_sum: old, team_model: s.team_model_total, actual,
      old_err: actual == null ? null : old - actual, model_err: actual == null ? null : s.team_model_total - actual }
  }).sort((x, y) => x.season - y.season || x.week - y.week || x.game.localeCompare(y.game))
  const graded = rows.filter((r) => r.actual != null)
  const mae = (k) => (graded.length ? graded.reduce((s, r) => s + Math.abs(r[k]), 0) / graded.length : null)
  const bias = (k) => (graded.length ? graded.reduce((s, r) => s + r[k], 0) / graded.length : null)
  return { rows, summary: { games: rows.length, graded: graded.length, old_mae: mae('old_err'), model_mae: mae('model_err'), old_bias: bias('old_err'), model_bias: bias('model_err') } }
}
