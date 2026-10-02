// THE DASH LINE, FROZEN AT LOCK (2026-10-02, BATCH-DASH-LINE step 3). Server only.
// The odds tick's LOCK write (app/api/odds/tick) calls this with the same
// odds_lines rows it just stored: for every NFL player and market we have a
// book line for, our line (lib/dashLine.js, dash-line-v1) is computed from
// the bot's published files and frozen beside it -- one instant, both lines.
// Insert-only (a row is never rewritten); a later model is new rows.
// HIDDEN UNTIL ITS SQL RUNS: no dash_lines table = nothing read, nothing written.
import { dashLine, leanOf, oppFactor, DASH_MARKETS, DASH_MODEL } from './dashLine'
import { NFL_DATA_BASE } from './nfl/dataSource'

let ready = null   // per instance: the table exists (checked once)
async function tableReady(db) {
  if (ready === true) return true
  ready = !(await db.from('dash_lines').select('player_id').limit(1)).error
  return ready
}
const OUT = new Set(['OUT', 'D', 'IR', 'DOUBTFUL'])
const get = (name) => fetch(`${NFL_DATA_BASE}/${name}`, { next: { revalidate: 3600 } }).then((r) => (r.ok ? r.json() : null)).catch(() => null)

/** Rows to write for one NFL event's lock lines (pure given the files). */
export function dashRows({ lineRows, logs, matchup, week, takenAt }) {
  const byPid = new Map((week?.players || []).map((p) => [String(p.player_id), p]))
  const out = []
  for (const r of lineRows) {
    const M = DASH_MARKETS.nfl[r.market]
    if (!M || r.bet !== 'ou' || !r.our_player_id || !Number.isFinite(r.line)) continue
    const pid = String(r.our_player_id)
    const p = byPid.get(pid)
    const games = logs?.logs?.[pid]?.log || []
    const season = Number(week?.season) || Math.max(0, ...games.map((g) => g.s))
    const role = typeof matchup?.roles?.[pid] === 'string' ? matchup.roles[pid] : matchup?.roles?.[pid]?.role || null
    const opp = p?.opp || null
    const of = opp ? oppFactor(matchup?.dvp?.season, opp, role, M.dvp) : { factor: 1, note: 'no opponent this week' }
    const d = !p ? { line: null, reason: "not on this week's TUDDY slate" } : dashLine({ games, season, market: r.market, opp: of, out: OUT.has(String(p.injury_status || '').toUpperCase()) })
    out.push({
      sport: 'nfl', game_id: r.event_id, game_date: r.game_date, player_id: pid, player_name: r.player_name || p?.name || null,
      team: p?.team || null, opp, market: r.market, model_version: DASH_MODEL,
      dash_line: d.line, book_line: r.line, book_odds: r.odds, lean: d.line != null ? leanOf(d.line, r.line, r.market) : null,
      reason: d.reason || null, base: d.base != null ? Math.round(100 * d.base) / 100 : null,
      opp_factor: d.factor != null ? Math.round(1000 * d.factor) / 1000 : null, games_used: d.gamesUsed ?? null, frozen_at: takenAt,
    })
  }
  return out
}

/** At an NFL lock: freeze our lines beside the book's. Its own failure, logged; never the snapshot's. */
export async function freezeDashLines(db, ev, lineRows, takenAt) {
  if (ev?.leagueID !== 'NFL' || !lineRows?.length) return null
  if (!(await tableReady(db))) return 'no table (sql not run)'
  const [logs, matchup, week] = await Promise.all([get('nfl_logs.json'), get('nfl_matchup.json'), get('nfl_week.json')])
  if (!logs || !week) return 'no logs / week file'
  const rows = dashRows({ lineRows, logs, matchup, week, takenAt })
  if (!rows.length) return 0
  const w = await db.from('dash_lines').upsert(rows, { onConflict: 'sport,game_id,player_id,market,model_version', ignoreDuplicates: true })
  if (w.error) { console.error(`[dash lines] ${ev.eventID}: ${w.error.message}`); return `error: ${w.error.message}` }
  return rows.filter((x) => x.dash_line != null).length
}
