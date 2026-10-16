// GET /api/record/lamp-goal-export -- the GRADED NHL goal board, one row per (game, skater, model_version), for the model harness
// (bots/model_harness.py reads it as lamp_goal_log_export.json via bots/export_lamp_goal_log.py). 2026-10-16.
//
// It exists so the bot repo needs NO database secret: the site already holds the Supabase access, and lamp_goal_log is the public
// record (its rows are the same ones /called, the goal board and the ledger print). Read-only; only graded regular-season rows;
// only the scoring and the grade, no user data. Cached an hour per instance (a nightly reader, not a polled feed).
import { unstable_cache } from 'next/cache'
import { adminClient } from '../../../../lib/supabase/admin'

export const dynamic = 'force-dynamic'

const COLS = 'game_id,player_id,model_version,game_date,game_type,score,pct,legs,dressed,goals,hit'
const PAGE = 1000
const MAX_PAGES = 60      // 60k rows is far past a season of this log; a stop, not a limit anyone should reach

const build = unstable_cache(async () => {
  const db = adminClient()
  if (!db) throw new Error('database not configured')
  const rows = []
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await db.from('lamp_goal_log').select(COLS)
      .not('hit', 'is', null).eq('game_type', 2)
      .order('game_date', { ascending: true }).order('game_id', { ascending: true }).order('player_id', { ascending: true })
      .range(i * PAGE, i * PAGE + PAGE - 1)
    if (error) throw new Error(error.message || String(error))
    rows.push(...(data || []))
    if (!data || data.length < PAGE) break
  }
  return rows
}, ['lamp-goal-export-v1'], { revalidate: 3600 })

export async function GET() {
  try {
    return Response.json(await build(), { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } })
  } catch (e) {
    return Response.json({ error: 'EXPORT UNAVAILABLE', detail: String(e?.message || e).slice(0, 200) }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
