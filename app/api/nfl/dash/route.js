// GET /api/nfl/dash -- this week's DASH lines (BATCH-DASH-LINE step 4, TEST).
// Frozen rows from dash_lines (the odds tick's LOCK writes them beside the
// book's line); before a game locks, a PREVIEW from the newest book lines by
// the same function (lib/dashLock.js dashRows), never stored, flagged
// provisional. Hidden until its SQL runs: no dash_lines table = available:false.
import { adminClient } from '../../../../lib/supabase/admin'
import { dashRows } from '../../../../lib/dashLock'
import { DASH_MODEL } from '../../../../lib/dashLine'
import { NFL_DATA_BASE } from '../../../../lib/nfl/dataSource'
import { shiftDay } from '../../../../lib/data'

export const dynamic = 'force-dynamic'
const get = (name) => fetch(`${NFL_DATA_BASE}/${name}`, { next: { revalidate: 3600 } }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
const pick = (r) => ({ player_id: r.player_id, market: r.market, dash_line: r.dash_line == null ? null : Number(r.dash_line), book_line: r.book_line == null ? null : Number(r.book_line), lean: r.lean, reason: r.reason, frozen_at: r.frozen_at })

export async function GET() {
  const db = adminClient()
  if (!db) return Response.json({ available: false, why: 'no database' }, { status: 503 })
  const head = await db.from('dash_lines').select('player_id').limit(1)
  if (head.error) return Response.json({ available: false, why: 'sql not run' }, { headers: { 'Cache-Control': 'public, s-maxage=600' } })
  const today = new Date(Date.now() - 7 * 3600e3).toISOString().slice(0, 10)
  const from = shiftDay(today, -4), to = shiftDay(today, 7)
  const frozen = await db.from('dash_lines').select('player_id, market, dash_line, book_line, lean, reason, frozen_at').eq('sport', 'nfl').eq('model_version', DASH_MODEL).gte('game_date', from).lte('game_date', to)
  const rows = (frozen.data || []).map((r) => ({ ...pick(r), provisional: false }))
  const have = new Set(rows.map((r) => `${r.player_id}|${r.market}`))
  // the preview: the newest book line per player/market not yet frozen
  const lines = await db.from('odds_lines').select('event_id, game_date, our_player_id, player_name, market, bet, line, odds, taken_at')
    .eq('sport', 'nfl').gte('game_date', today).lte('game_date', to).not('our_player_id', 'is', null).eq('bet', 'ou')
  const newest = new Map()
  for (const r of lines.data || []) { const k = `${r.our_player_id}|${r.market}`; if (!have.has(k) && (!newest.has(k) || r.taken_at > newest.get(k).taken_at)) newest.set(k, r) }
  if (newest.size) {
    const [logs, matchup, week] = await Promise.all([get('nfl_logs.json'), get('nfl_matchup.json'), get('nfl_week.json')])
    if (logs && week) for (const r of dashRows({ lineRows: [...newest.values()], logs, matchup, week, takenAt: null })) rows.push({ ...pick(r), provisional: true })
  }
  return Response.json({ available: true, model: DASH_MODEL, frozen: rows.filter((r) => !r.provisional).length, rows }, { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' } })
}
