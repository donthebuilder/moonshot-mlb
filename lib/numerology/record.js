// 🔢 NUMEROLOGY, RECORDED AND GRADED (2026-09-27, BATCH-NUMEROLOGY step 6).
//
// Server only (takes a service-role client). Every lane that MATCHED a
// player pregame is written once to numerology_log and never rewritten
// (insert ... on conflict do nothing: first write wins, like the other
// logs). Grading fills played / hit / graded_at from results we already
// store. numerology_lane_nights is the derived per-night summary the "which
// lanes run hot" table reads; it is recomputed from the log, never edited.
//
// THE DENOMINATOR. "Hit rate of matched players" means nothing without the
// same rate for everyone who COULD have matched. So each player also gets one
// row with lane '_eligible', matched_to 'lanes', value = the comma-separated
// lane keys he had the fields for. That keeps the whole record in the schema
// that was run (no second migration) and lets grading count eligible hits
// per lane exactly.
import { matchLanes, eligibleLanes } from './lanes'
import { numbersNight } from './hotNumbers'

const CHUNK = 500
export const ELIGIBLE = '_eligible'

/** Pure: a night's players -> the rows to write. players: [{ player_id, name, team, ...adapter shape }]. */
export function buildRows(sport, day, players) {
  const rows = []
  for (const p of players || []) {
    if (!p?.player_id) continue
    const pid = String(p.player_id)
    const eligible = eligibleLanes(p)
    if (!eligible.length) continue
    // text on the eligible row (HOT-NUMBERS-FIX item 2, 2026-09-27): his
    // numbers as they stood pregame, {"jersey","birthDate"}, so TODAY can be
    // counted live from the event tables without a second lookup.
    const nums = JSON.stringify({ jersey: p.jersey ?? null, birthDate: p.birthDate || null })
    rows.push({ sport, day, player_id: pid, lane: ELIGIBLE, matched_to: 'lanes', value: eligible.join(','), name: p.name || null, team: p.team || null, text: nums })
    for (const m of matchLanes(p, { date: day })) {
      rows.push({ sport, day, player_id: pid, lane: m.lane, matched_to: m.matchedTo, value: m.value == null ? null : String(m.value), name: p.name || null, team: p.team || null, text: m.text })
    }
  }
  // The key is (sport, day, player, lane, matched_to); a lane can match the
  // same target twice (full AND last name = 47) -- one row, the first text.
  const seen = new Set()
  return rows.filter((r) => { const k = `${r.player_id}|${r.lane}|${r.matched_to}`; if (seen.has(k)) return false; seen.add(k); return true })
}

/** Write a night's players that are not written yet. Returns { players, rows }. */
export async function writeNight(db, sport, day, players) {
  const { data: have, error } = await db.from('numerology_log').select('player_id').eq('sport', sport).eq('day', day).eq('lane', ELIGIBLE)
  if (error) throw new Error(`numerology_log read: ${error.message}`)
  const done = new Set((have || []).map((r) => String(r.player_id)))
  const fresh = (players || []).filter((p) => p?.player_id && !done.has(String(p.player_id)))
  const rows = buildRows(sport, day, fresh)
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error: e } = await db.from('numerology_log').upsert(rows.slice(i, i + CHUNK), { onConflict: 'sport,day,player_id,lane,matched_to', ignoreDuplicates: true })
    if (e) throw new Error(`numerology_log write: ${e.message}`)
  }
  return { players: fresh.length, rows: rows.length }
}

/** Grade: results = Map(player_id -> { played: bool|null, hit: bool }). Only ungraded rows of those players. */
export async function gradeNight(db, sport, day, results) {
  const at = new Date().toISOString()
  const byOutcome = new Map()
  for (const [pid, r] of results) {
    const k = `${r.played ?? 'null'}|${Boolean(r.hit)}`
    if (!byOutcome.has(k)) byOutcome.set(k, [])
    byOutcome.get(k).push(String(pid))
  }
  let graded = 0
  for (const [k, ids] of byOutcome) {
    const [playedS, hitS] = k.split('|')
    for (let i = 0; i < ids.length; i += 200) {
      const { data, error } = await db.from('numerology_log')
        .update({ played: playedS === 'null' ? null : playedS === 'true', hit: hitS === 'true', graded_at: at })
        .eq('sport', sport).eq('day', day).in('player_id', ids.slice(i, i + 200)).is('graded_at', null).select('player_id')
      if (error) throw new Error(`numerology_log grade: ${error.message}`)
      graded += data?.length || 0
    }
  }
  return graded
}

/** Pure: a night's log rows -> per-lane summary rows for numerology_lane_nights. */
export function laneNights(sport, day, logRows) {
  const eligibleOf = new Map()                     // player -> Set(lanes)
  const hitOf = new Map()                          // player -> { graded, hit }
  const matched = new Map()                        // lane -> Set(players)
  for (const r of logRows || []) {
    hitOf.set(r.player_id, { graded: Boolean(r.graded_at), hit: r.hit === true && r.played !== false })
    if (r.lane === ELIGIBLE) { eligibleOf.set(r.player_id, new Set(String(r.value || '').split(',').filter(Boolean))); continue }
    if (!matched.has(r.lane)) matched.set(r.lane, new Set())
    matched.get(r.lane).add(r.player_id)
  }
  const lanes = new Set([...[...eligibleOf.values()].flatMap((s) => [...s]), ...matched.keys()])
  const allGraded = [...hitOf.values()].length > 0 && [...hitOf.values()].every((h) => h.graded)
  return [...lanes].map((lane) => {
    const elig = [...eligibleOf].filter(([, s]) => s.has(lane)).map(([pid]) => pid)
    const m = [...(matched.get(lane) || [])]
    const hits = (ids) => ids.filter((pid) => hitOf.get(pid)?.graded && hitOf.get(pid)?.hit).length
    return {
      sport, day, lane, eligible: elig.length, matched: m.length,
      eligible_hits: allGraded ? hits(elig) : null, matched_hits: allGraded ? hits(m) : null,
      graded_at: allGraded ? new Date().toISOString() : null,
    }
  })
}

/** Recompute a night's lane summary from the log (derived; safe to repeat). */
export async function refreshLaneNights(db, sport, day) {
  const rows = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from('numerology_log').select('player_id, lane, value, played, hit, graded_at').eq('sport', sport).eq('day', day)
      .order('player_id', { ascending: true }).order('lane', { ascending: true }).order('matched_to', { ascending: true }).range(from, from + 999)
    if (error) throw new Error(`numerology_log read: ${error.message}`)
    rows.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  const summary = laneNights(sport, day, rows)
  if (summary.length) {
    const { error } = await db.from('numerology_lane_nights').upsert(summary, { onConflict: 'sport,day,lane' })
    if (error) throw new Error(`numerology_lane_nights write: ${error.message}`)
  }
  return summary.length
}

/**
 * HOT NUMBERS for one graded night (step 6b), written once: players = who
 * played (adapter shape + player_id), hits = Set(player_id) with an event.
 * Skips a night already written. Returns the row count, or 'already'.
 */
export async function writeNumbersNight(db, sport, day, players, hits) {
  const { count, error } = await db.from('numerology_numbers').select('value', { count: 'exact', head: true }).eq('sport', sport).eq('day', day)
  if (error) throw new Error(`numerology_numbers read: ${error.message}`)
  if (count) return 'already'
  const { rows } = numbersNight(players, hits, day)
  const full = rows.map((r) => ({ sport, day, ...r }))
  for (let i = 0; i < full.length; i += CHUNK) {
    const { error: e } = await db.from('numerology_numbers').upsert(full.slice(i, i + CHUNK), { onConflict: 'sport,day,kind,value' })
    if (e) throw new Error(`numerology_numbers write: ${e.message}`)
  }
  return full.length
}
