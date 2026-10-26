// GET /api/record/lamp-goal-export -- the GRADED NHL goal board, one row per (game, skater, model_version), for the model harness
// (bots/model_harness.py reads it as lamp_goal_log_export.json via bots/export_lamp_goal_log.py). 2026-10-16.
//
// It exists so the bot repo needs NO database secret: the site already holds the Supabase access, and lamp_goal_log is the public
// record (its rows are the same ones /called, the goal board and the ledger print). Read-only; only graded regular-season rows;
// only the scoring and the grade, no user data. Cached an hour per instance (a nightly reader, not a polled feed).
import { unstable_cache } from 'next/cache'
import { adminClient } from '../../../../lib/supabase/admin'
import { VERSIONS } from '../../../../lib/nhl/versions'

export const dynamic = 'force-dynamic'

const COLS = 'game_id,player_id,model_version,game_date,game_type,score,pct,legs,dressed,goals,hit,rank_in_game,status,context'
// GAME CONTEXT (2026-10-18): the residual scan (bots/nhl_residual_scan.py) tests every numeric/boolean leaf of `context`. Only these keys ride, all measured pregame and
// numbers or flags: the opposing club's goals against per game, his club's back-to-back, whether the lineup was posted, a stale-season flag, his role and night rank. NOT exported:
// the opposing goalie object, season labels, or the projection/chance fields (a score is a rank, never a chance).
const CONTEXT_KEYS = ['oppGaPg', 'b2b', 'lineupKnown', 'staleSeason', 'role', 'nightRank']
const slimContext = (c) => {
  if (!c || typeof c !== 'object') return null
  const out = {}
  for (const k of CONTEXT_KEYS) if (typeof c[k] === 'number' || typeof c[k] === 'boolean') out[k] = c[k]
  return Object.keys(out).length ? out : null
}
const PAGE = 1000
const MAX_PAGES = 60      // 60k rows is far past a season of this log; a stop, not a limit anyone should reach

const build = unstable_cache(async () => {
  const db = adminClient()
  if (!db) throw new Error('database not configured')
  const rows = []
  for (let i = 0; i < MAX_PAGES; i++) {
    const { data, error } = await db.from('lamp_goal_log').select(COLS)
      .not('hit', 'is', null).eq('game_type', 2)
      .order('game_date', { ascending: true }).order('game_id', { ascending: true }).order('player_id', { ascending: true }).order('model_version', { ascending: true })
      .range(i * PAGE, i * PAGE + PAGE - 1)
    if (error) throw new Error(error.message || String(error))
    rows.push(...(data || []).map((r) => ({ ...r, context: slimContext(r.context) })))
    if (!data || data.length < PAGE) break
  }
  // COMPOSITE (2026-10-18, a hidden shadow in lamp_prop_log market 'GOAL'): its score rides on the SAME rows so the harness grades the live `score`
  // and the composite on identical games. `comp` / `comp_pick` (= the top composite on his team in that game) / `comp_version` are the CURRENT composite
  // (VERSIONS.comp2 = lamp-goal-comp-v2); v1's rows stay distinguishable and ride as `comp_v1` / `comp_v1_pick`. Additive: no existing key changes. A skater a
  // version did not score has no field for it; a failed or empty read leaves every row exactly as before.
  try {
    const vCur = [...new Set(VERSIONS.comp2)], vOld = [...new Set(VERSIONS.comp)]
    const comp = new Map()
    for (let i = 0; i < MAX_PAGES; i++) {
      const { data, error } = await db.from('lamp_prop_log').select('game_id,player_id,score,status,model_version')
        .eq('market', 'GOAL').in('model_version', [...vCur, ...vOld]).not('hit', 'is', null)
        .order('game_id', { ascending: true }).order('player_id', { ascending: true }).order('model_version', { ascending: true }).range(i * PAGE, i * PAGE + PAGE - 1)
      if (error) throw new Error(error.message)
      for (const c of data || []) comp.set(`${c.game_id}|${c.player_id}|${c.model_version}`, c)
      if (!data || data.length < PAGE) break
    }
    for (const r of rows) {
      const k = `${r.game_id}|${r.player_id}`
      const cur = vCur.map((v) => comp.get(`${k}|${v}`)).find(Boolean), old = vOld.map((v) => comp.get(`${k}|${v}`)).find(Boolean)
      if (cur) { r.comp = cur.score; r.comp_pick = cur.status === 'called'; r.comp_version = cur.model_version }
      if (old) { r.comp_v1 = old.score; r.comp_v1_pick = old.status === 'called' }
    }
  } catch (e) { console.error(`[lamp-goal-export] composite: ${e?.message}`) }
  return rows
}, ['lamp-goal-export-v4'], { revalidate: 3600 })

export async function GET() {
  try {
    return Response.json(await build(), { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=7200' } })
  } catch (e) {
    return Response.json({ error: 'EXPORT UNAVAILABLE', detail: String(e?.message || e).slice(0, 200) }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}
