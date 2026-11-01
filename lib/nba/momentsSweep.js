// WHICH BUCKETS MOMENTS TO POST THIS TICK (batch 3, 2026-10-26). Pure. app/api/buckets/moments used to post only the rows it had JUST inserted, so
//   - a row inserted while posting was off (maintenance mode, the nba30 kind switched off) or whose tick died before the claim NEVER posted (the next tick's
//     `have` set already held it), unlike the homer_feed / lamp_goal_feed ticks, which re-read their pending rows every tick;
//   - and there was no expiry at all: after an outage every 30-point night already final went out at once.
// Now: a NEW row posts unless its game ended long ago (GAME_STALE_MS after its start); a PENDING row (stored earlier, x_post_id still null) posts again until it is
// older than LATE_ALERT_MS (lib/dash/xFail.js), then it is closed 'skipped' with a log; a row that already has an id, 'posting' or 'skipped' is never touched; preseason never posts.
import { isLate } from '../dash/xFail'

/** A final game is "long over" this long after its START (a game is ~2.5 h; the rest is the late-alert window). */
export const GAME_STALE_MS = 4 * 3600e3
export const keyOf = (r) => `${r.game_id}|${r.player_id}|${r.kind}`

/**
 * @param derived  every moment the box scores show right now (momentRows + ddtdRows)
 * @param stored   Map(key -> { x_post_id, seen_at }) what buckets_feed already held before this tick's insert
 * @param written  Set(key) the keys this tick's upsert really inserted
 * @param games    the scoreboard games ({ id, state, start })
 * @returns { post: row[], expired: [{ row, why }] }
 */
export function momentCandidates({ derived = [], stored = new Map(), written = new Set(), games = [], now = Date.now() } = {}) {
  const gameOf = (r) => games.find((g) => String(g.id) === String(r.game_id))
  const post = [], expired = []
  for (const r of derived) {
    if (r.season_type === 1) continue                                      // preseason is recorded, never posted
    const k = keyOf(r)
    const s = stored.get(k)
    if (!s) {
      if (!written.has(k)) continue                                        // not stored (the upsert lost a race): another tick owns it
      const g = gameOf(r)
      const start = Date.parse(g?.start || '')
      if (g?.state === 'final' && Number.isFinite(start) && now - start > GAME_STALE_MS) { expired.push({ row: r, why: 'its game ended long ago' }); continue }
      post.push(r)
    } else if (s.x_post_id == null) {
      if (isLate(s.seen_at, now)) expired.push({ row: r, why: 'pending too long' })
      else post.push(r)
    }
  }
  return { post, expired }
}
