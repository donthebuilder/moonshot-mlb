// GET /api/record/calls?sport=mlb|nfl|nhl -- every graded call this season with
// its price at lock and its result (2026-10-04, Donovan's user review build 2:
// "every call, price, result ... downloadable. Verify 14/13").
//
// lib/odds/gradedPicks.js pricedPicks does the work -- grading reused, never
// redone; the price is the lock snapshot (lib/odds/priceAtLock.js). Kept to
// each sport's headline call whose market IS the price we hold:
//   MLB  TOP / HR calls (the home-run price; a HIT or CONTACT call's market is
//        not the home run, so it isn't listed against that price)
//   NFL  the week's TD calls
//   NHL  CALLED skaters on the goal board
// Cached 30 minutes per sport and ET day: one build serves every viewer.
import { unstable_cache } from 'next/cache'
import { adminClient } from '../../../../lib/supabase/admin'
import { pricedPicks } from '../../../../lib/odds/gradedPicks'
import { easternToday } from '../../../../lib/data'

export const dynamic = 'force-dynamic'

const DATA = 'https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data/current'
const SINCE = { mlb: '2026-09-01', nhl: '2026-09-29' }
// which calls are listed, and the call word when a row has no role -- per sport, as data
const LISTED = { mlb: (p) => p.hrCall, nfl: (p) => p.status === 'called', nhl: (p) => p.status === 'called' }
const CALL_WORD = { mlb: 'HR', nfl: 'TD', nhl: 'GOAL' }

async function build(sport, today) {
  const db = adminClient()
  if (!db) throw new Error('database not configured')
  let opts
  if (sport === 'nfl') {
    const wk = await fetch(`${DATA}/nfl_week.json`, { cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
    const season = Number(wk?.season) || 2026
    const week = Number(wk?.week) || 1
    // each week's Wednesday..Tuesday, counted back from this week's first kickoff (ET)
    const first = (wk?.games || []).map((g) => Date.parse(g.kickoff || '')).filter(Number.isFinite).sort((a, b) => a - b)[0]
    const etDay = (ms) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
    const weekWindow = Number.isFinite(first) ? (w) => {
      const start = Date.parse(`${etDay(first)}T12:00:00Z`) - 864e5 - 7 * 864e5 * (week - w)
      return [etDay(start), etDay(start + 6 * 864e5)]
    } : null
    opts = { sport, season, weeks: Array.from({ length: week }, (_, i) => i + 1), since: `${season}-09-01`, until: today, weekWindow }
  } else {
    opts = { sport, since: SINCE[sport], until: today }
  }
  const { picks, error } = await pricedPicks(db, opts)
  if (error) throw new Error(error.message || String(error))
  const keep = picks.filter((p) => LISTED[sport](p) && (p.result === 'hit' || p.result === 'miss' || p.result === 'void'))
  return keep
    .map((p) => ({
      date: p.game_date || p.graded_date || null, week: p.week ?? null,
      player_id: p.player_id, name: p.name, team: p.team || null, role: p.role || CALL_WORD[sport],
      result: p.result,
      best: p.price?.best ?? null, book: p.price?.best_book ?? null, median: p.price?.median ?? null, books: p.price?.books ?? null,
    }))
    .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(a.name).localeCompare(String(b.name)))
}

export async function GET(request) {
  const sport = new URL(request.url).searchParams.get('sport') || 'mlb'
  if (!['mlb', 'nfl', 'nhl'].includes(sport)) return Response.json({ error: 'sport must be mlb, nfl or nhl' }, { status: 400 })
  const today = easternToday()
  try {
    const calls = await unstable_cache(() => build(sport, today), ['record-calls-v2', sport, today], { revalidate: 1800 })()
    return Response.json({ sport, calls, builtAt: new Date().toISOString() }, { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=1800' } })
  } catch (e) {
    console.error(`[record/calls] ${sport}: ${e?.message || e}`)
    return Response.json({ error: 'the call history is delayed' }, { status: 502 })
  }
}
