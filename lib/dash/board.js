// THE BOARD, READ BY THE SENDER.
//
// Everything the push cron knew until now came from two live league feeds:
// who is playing right now and what they have done so far. That is enough for
// in-game alerts and useless before first pitch, which is the half of the
// evening you can still act on.
//
// The published board is the missing half. Every row carries game_pk,
// game_time, the team, the venue, whether the lineup card is confirmed and
// where he is batting -- so one read answers "which game is he in", "when does
// it start" and "is the card out yet", none of which the live feed will say.
//
// WHY THIS IS NOT FETCHED EVERY TICK. today_slim.json is about four megabytes.
// At a one-minute cadence that is a quarter of a gigabyte an hour spent mostly
// learning that nothing changed. Three things keep it honest:
//
//   1. ONLY BEFORE FIRST PITCH. If no game on the slate is still in Preview,
//      the board has nothing left to say and this is never called.
//   2. ONE RUN PER WINDOW OWNS IT. The fetch slot is claimed by inserting into
//      dash_push_seen -- the same insert-and-see-what-stuck the sender already
//      uses for events. If the insert sticks you own this window; if it does
//      not, another run already fetched. No cache to go stale, no clock to
//      trust, and two overlapping runs can never both pull four megabytes.
//   3. ONLY THE FIELDS THAT MATTER. The row has 472 of them. Seventeen are
//      kept and the rest are dropped before anything else sees the payload.
//
// Net cost: at most one fetch every FETCH_WINDOW_MS, and only during the
// pregame hours of a day with games on it.

import { slatePaths } from '../dataSource'

const FETCH_WINDOW_MS = 5 * 60 * 1000

// Seventeen of four hundred and seventy-two.
const KEEP = [
  'player_id', 'name', 'team', 'opponent', 'game_pk', 'game_time', 'venue_name',
  'lineup_confirmed', 'lineup_spot', 'lineup_spot_risk',
  'hr_score', 'overall_score', 'best_bet_type', 'hr_confidence_tier',
  'top_pick_reason', 'trap_flag', 'k_trap_flag',
]

const slim = (row) => {
  const out = {}
  for (const k of KEEP) if (row[k] !== undefined) out[k] = row[k]
  return out
}

/**
 * Does this run own the board for this window?
 *
 * Returns true at most once per FETCH_WINDOW_MS across every concurrent
 * invocation, because the uniqueness is enforced by the table rather than by
 * anything this process believes about the time.
 */
export async function claimBoardWindow(db) {
  const key = `board:fetch:${Math.floor(Date.now() / FETCH_WINDOW_MS)}`
  try {
    const { data } = await db
      .from('dash_push_seen')
      .upsert([{ event_key: key }], { onConflict: 'event_key', ignoreDuplicates: true })
      .select('event_key')
    return Boolean(data?.length)
  } catch {
    return false      // a database wobble must not turn into a four-megabyte retry storm
  }
}

/** Tonight's board, trimmed. Null when it cannot be had -- never a throw. */
// THE UNSLIMMED READ (2026-09-03).
//
// `fetchBoard` returns rows through `slim`, which keeps seventeen fields. That
// is right for the sender — it holds the whole board in memory inside a 60s
// function and needs none of the rest. It is wrong for anything that needs the
// MODEL inputs: the simulator reads season_avg, season_k_rate, pitcher_k_rate,
// park_fit and about twenty more, and `slim` drops every one of them.
//
// The failure mode if you use the slimmed rows anyway is the dangerous kind:
// nothing throws. Every missing rate falls back to its league default, the sim
// runs happily, and it produces the same generic ballclub every night while
// looking exactly like baseball. So this is a separate export rather than a
// flag on the existing one, and KEEP stays as small as the sender wants it.
export async function fetchBoardFull(mode = 'today') {
  for (const url of slatePaths(mode)) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) continue
      const body = await res.json()
      const rows = Array.isArray(body) ? body : (body?.players || body?.rows || [])
      if (Array.isArray(rows) && rows.length) return rows
    } catch { /* try the next candidate path */ }
  }
  return null
}

export async function fetchBoard(mode = 'today') {
  for (const url of slatePaths(mode)) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) continue
      const body = await res.json()
      const rows = Array.isArray(body) ? body : (body?.players || body?.rows || [])
      if (!Array.isArray(rows) || !rows.length) continue
      return rows.map(slim)
    } catch { /* try the next candidate path */ }
  }
  return null
}
