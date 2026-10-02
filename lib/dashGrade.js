// THE DASH LINE, GRADED (2026-10-02, BATCH-DASH-LINE step 5). Server only.
// Once a day (the odds tick's first run, 11:00 UTC): every frozen NFL line
// whose game is over gets the player's actual stat from the bot's published
// game logs (nfl_logs.json, the same file the line was built from) -- the
// log row for that season against that opponent. Only the result columns
// (actual, graded_at) are written; the line itself is never touched.
// No log row yet (the bot hasn't published the week) = left for tomorrow.
import { DASH_MARKETS } from './dashLine'
import { NFL_DATA_BASE } from './nfl/dataSource'

export async function gradeDashLines(db, today) {
  const open = await db.from('dash_lines').select('sport, game_id, player_id, market, model_version, opp, game_date')
    .eq('sport', 'nfl').is('graded_at', null).lt('game_date', today).limit(2000)
  if (open.error) return `no table or error: ${open.error.message}`
  if (!open.data?.length) return 0
  const logs = await fetch(`${NFL_DATA_BASE}/nfl_logs.json`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
  if (!logs) return 'no logs file'
  let n = 0
  for (const r of open.data) {
    const M = DASH_MARKETS.nfl[r.market]
    const season = Number(String(r.game_date).slice(0, 4)) - (Number(String(r.game_date).slice(5, 7)) <= 2 ? 1 : 0)
    const g = (logs.logs?.[r.player_id]?.log || []).filter((x) => x.s === season && x.opp === r.opp).sort((a, b) => b.w - a.w)[0]
    if (!M || !g || !Number.isFinite(Number(g[M.stat]))) continue
    const w = await db.from('dash_lines').update({ actual: Number(g[M.stat]), graded_at: new Date().toISOString() })
      .match({ sport: r.sport, game_id: r.game_id, player_id: r.player_id, market: r.market, model_version: r.model_version }).is('graded_at', null)
    if (!w.error) n++
  }
  return n
}
