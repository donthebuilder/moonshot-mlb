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
    const [alerts, posts, tds] = await Promise.all([
      db.from('homer_feed').select('*', { count: 'exact', head: true })
        .gte('day', monthStart).lte('day', day)
        .not('x_post_id', 'is', null)
        .not('x_post_id', 'in', '("posting","skipped")'),
      db.from('homer_feed_posts').select('*', { count: 'exact', head: true })
        .gte('day', monthStart).lte('day', day)
        .not('x_post_id', 'is', null),
      db.from('nfl_td_feed').select('*', { count: 'exact', head: true })
        .gte('day', monthStart).lte('day', day)
        .not('x_post_id', 'is', null)
        .not('x_post_id', 'in', '("posting")'),
    ])
    const used = (alerts.count || 0) + (posts.count || 0) + (tds.count || 0)
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
