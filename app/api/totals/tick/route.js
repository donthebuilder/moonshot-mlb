// TOP TOTALS CRON (2026-10-09). Every ten minutes through the playing day. Per sport, in this order:
//   1. GRADE   the open rows whose game is final -> actual_total / result / hit (once; lib/totals/store.js gradeRows)
//   2. LOCK    the slate's calls, from 90 minutes before its first game, never at or after a game's start
//   3. POST    the calls (X + Discord) through the one posting path, once a day (a week for the NFL)
// Most runs end in one cheap select: nothing open, the slate already locked, the window not yet open.
// A sport that fails never costs another its turn. TOTALS_POSTS_PAUSE=on stops the posts only.
import { cronAuthorized, adminClient } from '../../../../lib/supabase/admin'
import { isMaintenanceMode } from '../../../../lib/edgeConfig'
import { slateNight } from '../../../../lib/slateNight'
import { TOTALS_SPORTS, TOTALS_UNITS, LOCK_LEAD_MIN } from '../../../../lib/totals/core'
import { loadSlate, loadFinals } from '../../../../lib/totals/sources'
import { lockedKeys, lockSlate, openRows, gradeRows, slateRows } from '../../../../lib/totals/store'
import { postTotalsOnce } from '../../../../lib/totals/post'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// a slate whose window is not open yet is not re-read until it can be (the board file is the heavy read)
const _wait = new Map()   // sport -> ms before which the slate is not read again (this warm instance)

async function one(db, sport, now) {
  const out = {}
  const have = await lockedKeys(db, sport, now)
  if (have.missing) return { error: 'table-missing (run supabase/migrations/202610091600_top_totals.sql)' }

  // 1. GRADE
  const open = await openRows(db, sport, now)
  if (open.length) out.graded = await gradeRows(db, open, await loadFinals(sport, open, now), now)

  // 2. LOCK. A week sport (NFL) is locked while no locked game is still to come; a night sport while tonight's key is absent
  const week = TOTALS_UNITS[sport].slate === 'week'
  const pending = have.rows.some((r) => Date.parse(r.start_at) > now)
  const night = week ? null : await slateNight(sport, now)
  const locked = week ? pending : have.rows.some((r) => r.slate_key === night)
  let slateKey = night
  let day = night
  if (!locked && now >= (_wait.get(sport) || 0)) {
    const slate = await loadSlate(sport, now)
    out.lock = await lockSlate(db, sport, slate, { now, have })
    if (out.lock === 'window-not-open' && slate.games?.length) {
      const first = Math.min(...slate.games.map((g) => g.start_ms))
      _wait.set(sport, Math.min(first - LOCK_LEAD_MIN * 60e3, now + 30 * 60e3))
    }
    if (slate.ok) { slateKey = slate.slate_key; day = slate.day }
  } else if (week) {
    const next = have.rows.filter((r) => Date.parse(r.start_at) > now).sort((a, b) => Date.parse(a.start_at) - Date.parse(b.start_at))[0]
    slateKey = next?.slate_key || null
  }

  // 3. POST: the calls of the slate this run is about, once locked
  if (slateKey) {
    const rows = await slateRows(db, sport, slateKey)
    if (rows.length) {
      const dayOf = week ? rows.map((r) => r.game_date).sort()[0] : day
      out.post = await postTotalsOnce(db, { sport, day: dayOf, rows, now })
    }
  }
  return out
}

export async function GET(request) {
  if (!cronAuthorized(request)) return Response.json({ error: 'unauthorized' }, { status: 401 })
  if (await isMaintenanceMode()) return Response.json({ skipped: 'maintenance_mode' })
  const db = adminClient()
  if (!db) return Response.json({ error: 'no supabase env' }, { status: 500 })
  const now = Date.now()
  const out = {}
  for (const sport of TOTALS_SPORTS) {
    try { out[sport] = await one(db, sport, now) } catch (e) { console.error(`[totals] ${sport} failed: ${e?.message || e}`); out[sport] = { error: String(e?.message || e) } }
  }
  return Response.json(out, { headers: { 'Cache-Control': 'no-store' } })
}
