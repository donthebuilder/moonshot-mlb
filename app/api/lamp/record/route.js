// LAMP · RECORD — GET /api/lamp/record?days=30
//
// THE NUMBER, hockey edition: of the skaters who actually scored, how many
// were CALLED, how many ON THE BOARD, at lock — per night and over the
// window — plus the called hit rate and hit rate by rank band. Read
// straight off graded lamp_goal_log rows; nothing here is recomputed from
// a later feed. An empty record says so. The rows come through the shared
// record reader (lib/record/nhl.js), the same one /start and /called use.
import { addCounts, coverage, coverageFromCounts } from '../../../../lib/nhl/goalModel'
import { VERSIONS, V3_FROM } from '../../../../lib/nhl/versions'
// one track record across the versions (each night was called by the one it locked under)
const MODEL_VERSION = VERSIONS.goal.join(' -> ')
import { readNhlNights, readNhlRecords, isMissingTable, markAnyMarketCalls } from '../../../../lib/record/nhl'
import { adminClient } from '../../../../lib/supabase/admin'
import { ok, delayed } from '../../../../lib/nhl/respond'

export const dynamic = 'force-dynamic'

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const days = Math.min(120, Math.max(1, Number(searchParams.get('days')) || 30))
  // Preseason is not the season: camp lineups, split squads, three-line
  // rosters. Those nights are locked and graded like any other (the record
  // is the record) but stay out of the headline unless ?pre=1 asks.
  const includePre = searchParams.get('pre') === '1'
  try {
    const db = adminClient()
    if (!db) return ok({ modelVersion: MODEL_VERSION, nights: [], total: null, dbReady: false }, 60)
    const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    // THE SHOTS 3+ RECORD (2026-10-04, audit 05 #5). lamp/tick grades the SOG
    // calls into lamp_prop_log and nothing read them back -- the headline said
    // "not graded yet" forever. Called rows with a grade (hit true/false;
    // a void stays null and is not counted), same window and preseason rule.
    let sog = null
    try {
      let q = db.from('lamp_prop_log').select('hit').eq('market', 'SOG').eq('status', 'called').in('model_version', VERSIONS.sog)
        .not('graded_at', 'is', null).not('hit', 'is', null).gte('game_date', since)
      if (!includePre) q = q.neq('game_type', 1)
      const r = await q
      if (r.error) throw new Error(r.error.message)
      sog = { calledN: r.data.length, calledHits: r.data.filter((x) => x.hit === true).length }
    } catch (e) { console.error(`[lamp record] sog: ${e?.message || e}`) }
    const done = (nights, total) => ok({ modelVersion: MODEL_VERSION, versionFrom: { [VERSIONS.goal[1]]: V3_FROM }, since, days, includePre, nights, total, sog, dbReady: true, fetchedAt: new Date().toISOString() }, 300)

    // COUNTED IN POSTGRES (2026-09-26). The per-night numbers come from the
    // lamp_goal_nights view -- one row a night -- and only the rows the two
    // lists print (CALLED rows and scorers, ~80 a night) are read. Reading
    // every graded row to count it here was 40k-80k rows a call in season.
    const counted = await readNhlNights(db, { since, includePre })
    if (!counted.error) {
      const { rows, error } = await readNhlRecords(db, { since, includePre, graded: true, calledOrHit: true })
      if (error) throw new Error(error.message)
      // ONE CALLED, EVERY PAGE (2026-10-04, Donovan: SHOTS 3+ calls "are
      // called just like hit picks are"). /called, /start and the ledger count
      // a scorer CALLED when any public LAMP market called him (the 0c rule,
      // lib/record/nhl.js); this page counted the goal board only, so the same
      // night read 8 here and 16 there. Scorers a SHOTS 3+ call caught move
      // from ON THE BOARD / NOT ON IT to CALLED. The goal board's own called
      // hit rate (calledN / calledHits) is unchanged -- it is that model's.
      await markAnyMarketCalls(db, rows.filter((r) => r.hit))
      const byNight = groupByNight(rows)
      const moved = (counts, rs) => {
        const c = { ...counts }
        for (const r of rs) {
          if (!r.hit || !r.called_by) continue
          c.scorers_called = (Number(c.scorers_called) || 0) + 1
          const from = r.goal_status === 'board' ? 'scorers_board' : 'scorers_off'
          c[from] = Math.max(0, (Number(c[from]) || 0) - 1)
        }
        return c
      }
      const adj = counted.nights.map((n) => ({ ...n, counts: moved(n.counts, byNight.get(n.date) || []) }))
      const nights = adj.map(({ date, counts }) => ({ date, games: counts.games, ...coverageFromCounts(counts), ...lists(byNight.get(date) || []) }))
      const total = adj.length ? coverageFromCounts(adj.reduce((a, n) => addCounts(a, n.counts), null)) : null
      return done(nights, total)
    }
    // The view not created yet (its migration not run): the old full read,
    // same answer, heavier. Any other error is a real one.
    if (!isMissingTable(counted.error)) throw new Error(counted.error.message)
    console.warn(`[lamp record] counting in JS -- ${counted.error.message}`)

    const { rows, error } = await readNhlRecords(db, { since, includePre, graded: true })
    if (error) {
      // Before the migration has been run the table is simply not there;
      // that is an empty record with a reason, not a feed outage.
      if (isMissingTable(error)) {
        console.error(`[lamp record] ${error.message}`)
        return ok({ modelVersion: MODEL_VERSION, nights: [], total: null, dbReady: false, note: 'record table not created yet' }, 60)
      }
      throw new Error(error.message)
    }
    const nights = [...groupByNight(rows).entries()].map(([date, rs]) => ({
      date, games: new Set(rs.map((r) => r.game_id)).size, ...coverage(rs), ...lists(rs),
    }))
    return done(nights, rows.length ? coverage(rows) : null)
  } catch (e) {
    return delayed('record', e)
  }
}

function groupByNight(rows) {
  const byNight = new Map()
  for (const r of rows) { if (!byNight.has(r.game_date)) byNight.set(r.game_date, []); byNight.get(r.game_date).push(r) }
  return byNight
}

// A night's two lists. Needs only CALLED rows and scorers, which is all the
// counted path reads.
function lists(rs) {
  return {
    called: rs.filter((r) => r.status === 'called' && r.dressed).sort((a, b) => a.game_id - b.game_id || a.rank - b.rank).map((r) => ({ playerId: r.player_id, name: r.name, team: r.team, opp: r.opp, rank: r.rank, score: r.score, goals: r.goals, hit: r.hit, calledBy: r.called_by || null })),
    // `scorersOff` is coverage()'s COUNT; the list is `offScorers` (a clash the render harness caught).
    offScorers: rs.filter((r) => r.hit && r.status !== 'called').map((r) => ({ playerId: r.player_id, name: r.name, team: r.team, opp: r.opp, rank: r.rank, status: r.status, goals: r.goals })),
  }
}
