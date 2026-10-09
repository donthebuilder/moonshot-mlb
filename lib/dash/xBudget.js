// THE SHARED X MONTHLY BUDGET COUNT — split out of
// app/api/dash/homers/tick/route.js (2026-09-07's own "THE MONTHLY X BUDGET,
// COUNTED" block) so app/api/dash/nfl/tick/route.js can log against the SAME
// running total instead of the MLB tick being the only place this number
// ever gets checked.
//
// 2026-09-13, wiring the live touchdown alert: the MLB tick only ever ran
// this check when IT posted something (`if (totals.x > 0)`), so from
// roughly November through the NFL playoffs -- when MLB is fully dormant --
// nothing would log usage at all, even on nights the NFL side posted
// plenty. Same function, same queries, called from both ticks now, each
// time THAT tick actually posted something.
//
// READ-ONLY, same as it always was. It never blocks a post -- a guard that
// silences the whole feed on a miscount is a worse outcome than the overage
// it prevents (2026-09-07's own reasoning) -- it only logs and returns the
// total for whichever caller wants to put it on its own response.
//
// homer_feed_posts already covers every kind, MLB and NFL alike (no `kind`
// filter -- it never had one), so nfl_milestone posts were already counted
// the moment ANY tick ran this. nfl_td_feed is the one table the original
// query never knew existed.
export async function logXBudget(db, day, { mode, cap } = {}) {
  try {
    const monthStart = `${day.slice(0, 7)}-01`
    const [alerts, posts, tds, facts, buckets] = await Promise.all([
      db.from('homer_feed').select('*', { count: 'exact', head: true })
        .gte('day', monthStart).lte('day', day)
        .not('x_post_id', 'is', null)
        .not('x_post_id', 'in', '("posting","skipped","backfill")'),
      db.from('homer_feed_posts').select('*', { count: 'exact', head: true })
        .gte('day', monthStart).lte('day', day)
        .not('x_post_id', 'is', null)
        // a write-up's dry run never reached X (BATCH-GAME-WRITEUP, 2026-10-04)
        .not('x_post_id', 'in', '("posting","skipped","backfill","dry")'),
      db.from('nfl_td_feed').select('*', { count: 'exact', head: true })
        .gte('day', monthStart).lte('day', day)
        .not('x_post_id', 'is', null)
        // 'skipped' (not CALLED, postseason plan step 1) and 'backfill' never
        // reached X -- counting them overstated the month (2026-09-28).
        .not('x_post_id', 'in', '("posting","skipped")'),
      // the fact engine's posts (no table yet = an error = 0)
      db.from('fact_posts').select('*', { count: 'exact', head: true })
        .gte('day', monthStart).lte('day', day)
        .not('x_post_id', 'is', null),
      // BUCKETS' CALLED 30 pieces (no table / no rows = 0)
      db.from('buckets_feed').select('*', { count: 'exact', head: true })
        .gte('game_date', monthStart).lte('game_date', day)
        .not('x_post_id', 'is', null).not('x_post_id', 'in', '("posting","skipped")'),
    ])
    const used = (alerts.count || 0) + (posts.count || 0) + (tds.count || 0) + (facts.count || 0) + (buckets.count || 0)
    if (used >= cap) {
      console.error(`[budget] X monthly total ${used}/${cap} (last posting tick mode=${mode}). Expect 429s if this account's real plan has a hard ceiling.`)
    } else if (used >= cap * 0.8) {
      console.warn(`[budget] X monthly total at ${used}/${cap} (last posting tick mode=${mode}).`)
    }
    return { used, cap, mode }
  } catch (e) {
    // A failed count must never take the tick down with it.
    console.error(`[budget] X budget count failed: ${e.message}`)
    return null
  }
}

// ── THE DAILY CAP (2026-10-09, X overhaul stage 3 piece 1; replaces the 12-post,
// P0/P1/P2 version). ONE cap of 20 automated X posts per ET day that EVERY kind
// counts toward -- except the two exempt families (lib/dash/xPolicy.js):
//   - live CALLED alerts (homer_feed, nfl_td_feed, lamp_goal_feed, buckets_feed):
//     never blocked and NOT counted, so they cannot squeeze the scheduled posts;
//   - the board posts (board, nfl_board, nhl_board): never blocked, not counted.
// Counted: homer_feed_posts rows of every other kind that reached X, the fact
// engine's posts, and the NFL call-sheet replies. The cap, the kinds and the
// priority order near it (CALLED > slate > write-ups > facts > polls > numerology)
// are in xPolicy.js; there is no env knob for the number any more.
// A count that fails lets the post through: a silent feed is worse than one over.
import { EXEMPT_KINDS, X_POLICY, capAllows, isCapExempt, postsPaused } from './xPolicy'

const NOT_REAL = '("posting","skipped","backfill","dry")'   // 'dry': a write-up's dry run

/** The ET day `day` as [startISO, endISO): "the ET day" is when a post was MADE, not the slate day on its row (the 8am grades are filed under yesterday). */
export function etDayWindow(day) {
  const startOf = (d) => {
    for (const off of [4, 5]) {
      const t = Date.parse(`${d}T0${off}:00:00Z`)
      const hh = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false }).format(new Date(t))
      if (Number(hh) % 24 === 0) return t
    }
    return Date.parse(`${d}T05:00:00Z`)
  }
  const next = new Date(Date.parse(`${day}T12:00:00Z`) + 864e5).toISOString().slice(0, 10)
  return [new Date(startOf(day)).toISOString(), new Date(startOf(next)).toISOString()]
}

export async function xPostsToday(db, day) {
  const [from, to] = etDayWindow(day)
  const real = (q) => q.not('x_post_id', 'is', null).not('x_post_id', 'in', NOT_REAL)
  const [posts, facts, replies] = await Promise.all([
    // claimed (seen_at) inside this ET day, any kind but the exempt ones
    real(db.from('homer_feed_posts').select('*', { count: 'exact', head: true })).gte('seen_at', from).lt('seen_at', to).not('kind', 'in', `(${EXEMPT_KINDS.join(',')})`),
    // the fact engine's posts (lib/facts/engine.js); no table yet = an error = 0
    real(db.from('fact_posts').select('*', { count: 'exact', head: true })).gte('posted_at', from).lt('posted_at', to),
    nflReplyCount(db, day),
  ])
  return (posts.count || 0) + (facts.count || 0) + replies
}
// The NFL call-sheet replies (nfl tick): one per CALLED touchdown that was on the
// ladder, stored as nfl_td_feed.reply_x_post_id (supabase/migrations/2026-10-09-nfl-td-reply-id.sql).
// Until that column exists the count is estimated from the rows that qualify for
// a reply, which can only over-count -- never let the replies go uncounted again.
async function nflReplyCount(db, day) {
  const exact = await db.from('nfl_td_feed').select('*', { count: 'exact', head: true }).eq('day', day).not('reply_x_post_id', 'is', null)
  if (!exact.error) return exact.count || 0
  const est = await db.from('nfl_td_feed').select('*', { count: 'exact', head: true }).eq('day', day)
    .not('on_bot', 'is', null).not('x_post_id', 'is', null).not('x_post_id', 'in', NOT_REAL)
  return est.error ? 0 : (est.count || 0)
}
/** May a SCHEDULED post of `kind` go to X now? (Exempt kinds always may.) */
export async function xDailyAllows(db, day, kind) {
  if (isCapExempt(kind)) return true
  if (postsPaused()) return false   // X_POSTS_PAUSE=on: the emergency off-switch
  try {
    const used = await xPostsToday(db, day)
    const ok = capAllows(kind, used)
    if (!ok) console.warn(`[budget] daily X cap: ${kind} held (${used}/${X_POLICY.dailyCap} counted today)`)
    return ok
  } catch (e) {
    console.error(`[budget] daily count failed, posting anyway: ${e.message}`)
    return true
  }
}
