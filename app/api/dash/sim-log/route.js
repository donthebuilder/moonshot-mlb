// THE CONVERGENCE LOG — recording whether the simulator was right.
//
// 2026-09-03. GameSimPanel shows the simulator's homer odds beside `hr_score`
// and calls them two independent reads. That is a claim, and until this route
// existed nothing was checking it: both numbers were rendered and thrown away,
// so after a month nobody could say which had been right.
//
// This writes the pair down every night and grades it a day later.
//
// THE HOUSE RULE IT SERVES. No score earns weight before its outcome column is
// graded and trustworthy. That rule killed the doubles model this morning — it
// scored 0.76x base rate on 2,297 graded player-nights, worse than random. The
// simulator is under the same rule and this is how it earns its nights.
//
// FOUR THINGS THAT KEEP IT CHEAP AND QUIET, in the shape lib/dash/push/tick
// already uses:
//
//   1. FIRST WRITE WINS. The upsert is ON CONFLICT DO NOTHING on (day,
//      player_id), so a game logged at 16:00 is not re-logged at 17:00 with a
//      different draw. No claim table, no lock — the primary key IS the claim.
//      It also means the recorded probability is always the PREGAME one, which
//      is the only honest time to record a prediction.
//   2. PREGAME ONLY, AND CONFIRMED LINEUPS ONLY. A simulation run off an
//      unposted card is a simulation of the wrong nine men, and one run after
//      first pitch would be recording a forecast it could already see the
//      answer to.
//   3. IT NEVER FAILS LOUDLY. Missing config, an unreachable board, a graded
//      file that is not published yet — each is a counted, quiet no-op. A cron
//      that throws is a cron that stops running.
//   4. IT WRITES NOTHING A PERSON CAN SEE. No push, no user state, no UI. The
//      table is read by hand, later, when there are enough nights in it.

import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'
// fetchBoardFull, NOT fetchBoard: the slimmed read keeps seventeen fields and
// the simulator needs about forty. With the slim rows nothing throws — every
// rate quietly falls back to its league default and the sim runs the same
// generic ballclub every night.
import { fetchBoardFull } from '../../../../lib/dash/board'
import { gameFrom, simulate } from '../../../../lib/gameSim'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

// Same gate as the sender. Two accepted secrets because the project already
// runs with two, and a route that only honoured one would silently stop
// working the day the other is rotated.
function authorized(request) {
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (!supplied) return false
  return [process.env.CRON_SECRET, process.env.FRANCHISE_CRON_SECRET].filter(Boolean).some((expected) => {
    const a = Buffer.from(expected)
    const b = Buffer.from(supplied)
    return a.length === b.length && timingSafeEqual(a, b)
  })
}

function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

// The slate's own day, not the server's. A 10pm Phoenix first pitch is already
// tomorrow in UTC, and a log keyed on the wrong day would split one night's
// games across two rows and never join to its graded file. This is the same
// Phoenix-anchored rule the Results tab's "Yesterday" fix landed on.
const slateDay = (d = new Date()) => {
  const p = new Date(d.toLocaleString('en-US', { timeZone: 'America/Phoenix' }))
  return `${p.getFullYear()}-${String(p.getMonth() + 1).padStart(2, '0')}-${String(p.getDate()).padStart(2, '0')}`
}
const shiftDay = (day, by) => {
  const [y, m, d] = day.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + by))
  return t.toISOString().slice(0, 10)
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null)

// How many games per simulate() call. 2,000 is what the panel runs for one
// game on demand; a cron doing fifteen games has a 60s ceiling to respect, and
// the quantity being recorded is a probability whose third decimal nobody will
// ever read. 1,000 halves the work and moves the estimate by well under a
// point.
const RUNS = 1000

const DATA_BASE = process.env.NEXT_PUBLIC_DATA_BASE
  || 'https://raw.githubusercontent.com/donthebuilder/MLB-HR-DASHBOARD-STREAMLIT/data/public/data'

/** Log tonight's pregame simulations. Returns a counted summary, never throws. */
async function record(db, day) {
  let rows = []
  try {
    rows = (await fetchBoardFull('today')) || []
  } catch { return { recorded: 0, why: 'board unreachable' } }
  if (!rows.length) return { recorded: 0, why: 'empty board' }

  const now = Date.now()
  const byGame = new Map()
  for (const r of rows) {
    const pk = String(r?.game_pk || '')
    if (!pk) continue
    if (!byGame.has(pk)) byGame.set(pk, [])
    byGame.get(pk).push(r)
  }

  const out = []
  for (const [pk, mine] of byGame) {
    const any = mine[0]
    // Rule 2, both halves: the card has to be posted, and first pitch has to
    // still be ahead of us.
    if (!any?.lineup_confirmed) continue
    const start = Date.parse(any?.game_time || '')
    if (!Number.isFinite(start) || start <= now) continue

    let dist = null
    try {
      const g = gameFrom(rows, pk)
      if (!g) continue
      dist = simulate(g, RUNS)
    } catch { continue }

    // simulate() reports homer odds BY NAME, because that is what a box score
    // line carries. Join back to the slate row to recover the id the table is
    // keyed on — a name is not an identity and must never be a primary key.
    const idOf = new Map(mine.map((r) => [r.player_name || r.name, r]))
    for (const { name, p } of dist.hrProb) {
      const r = idOf.get(name)
      const id = r && (r.player_id ?? r.id)
      if (!r || id == null) continue
      out.push({
        day,
        player_id: String(id),
        name: name || null,
        team: r.team || null,
        game_pk: pk,
        sim_hr_prob: Math.min(1, Math.max(0, Number(p.toFixed(5)))),
        sim_runs: RUNS,
        hr_score: num(r.hr_score),
      })
    }
  }
  if (!out.length) return { recorded: 0, why: 'nothing pregame with a posted card' }

  // ON CONFLICT DO NOTHING — rule 1. `ignoreDuplicates` is how supabase-js
  // spells it; without it this is an UPDATE and the 17:00 run would overwrite
  // the 16:00 draw for no reason.
  const { error } = await db
    .from('sim_convergence')
    .upsert(out, { onConflict: 'day,player_id', ignoreDuplicates: true })
  if (error) return { recorded: 0, why: `write failed: ${error.message}` }
  return { recorded: out.length, games: byGame.size }
}

/**
 * Fill actual_hr from the published graded file. Looks back three days rather
 * than one: the file is published by the bot on its own schedule, so "not there
 * yet" is normal and a one-day window would lose a night permanently every
 * time the pipeline was late.
 */
async function grade(db, day) {
  let filled = 0
  const notes = []
  for (let back = 1; back <= 3; back++) {
    const d = shiftDay(day, -back)
    const { data: pending, error } = await db
      .from('sim_convergence')
      .select('player_id')
      .eq('day', d)
      .is('actual_hr', null)
      .limit(1000)
    if (error || !pending?.length) continue

    let graded = null
    try {
      const res = await fetch(`${DATA_BASE}/current/graded_results_${d}.json`, { cache: 'no-store' })
      if (!res.ok) { notes.push(`${d}: not published yet`); continue }
      const j = await res.json()
      graded = Array.isArray(j) ? j : j?.results
    } catch { notes.push(`${d}: fetch failed`); continue }
    if (!Array.isArray(graded) || !graded.length) { notes.push(`${d}: empty`); continue }

    // The graded file covers the ~90 PICKED players, not the whole slate, so
    // most of a night's logged rows will never be graded from it. That is a
    // known and stated limit — it is also exactly why "grade the full 261-row
    // slate" is one of the three standing bot asks. A row left NULL stays NULL
    // rather than being written as a zero, because "not graded" and "did not
    // homer" are different facts and every rate this table is asked for
    // depends on telling them apart.
    const want = new Set(pending.map((r) => r.player_id))
    const at = new Date().toISOString()
    const updates = []
    for (const g of graded) {
      const id = String(g?.player_id ?? g?.id ?? '')
      if (!id || !want.has(id)) continue
      const hr = num(g?.actual_hr)
      if (hr == null) continue
      updates.push({ day: d, player_id: id, actual_hr: hr, graded_at: at })
    }
    if (!updates.length) { notes.push(`${d}: no overlap with the graded picks`); continue }

    // A plain upsert here, not ignoreDuplicates: these rows exist and the
    // point is to update them. Only the graded columns are sent, so the
    // pregame numbers cannot be disturbed.
    const { error: uerr } = await db
      .from('sim_convergence')
      .upsert(updates, { onConflict: 'day,player_id' })
    if (uerr) { notes.push(`${d}: write failed`); continue }
    filled += updates.length
  }
  return { filled, notes }
}

export async function GET(request) {
  if (!authorized(request)) return new Response('no', { status: 401 })
  const db = admin()
  if (!db) return Response.json({ ok: true, skipped: 'supabase not configured' })

  const day = slateDay()
  const [rec, gra] = [await record(db, day), await grade(db, day)]
  return Response.json({ ok: true, day, record: rec, grade: gra })
}
