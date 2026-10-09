// WHICH PREGAME POST A SCORE QUOTES (lifted from app/api/dash/homers/tick,
// 2026-10-04, BATCH-GAME-WRITEUP: the receipt). Pure: the ticks read the rows,
// these decide. A score quotes the post that called it, so the feed reads
// "called pregame -> it happened" without anyone having to say so.
//
// MLB (unchanged from the tick): a CALLED homer quotes its game's own call post
// (kind call_<game_pk>) first, else the morning's pregame post when he was on it.
// NFL (new): a CALLED touchdown by a player named in a FEATURED game write-up
// (kind writeup_nfl_<game_id>, a real X id -- never 'dry' / 'skipped') quotes it.

const isTweetId = (v) => /^\d+$/.test(String(v || ''))
const etTime = (iso) => { const t = Date.parse(iso || ''); return Number.isFinite(t) ? new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' }) : '' }

/**
 * MLB. `pre` = the day's pregame row ({ x_post_id, payload }), `gamePosts` = the
 * day's call_% rows, `callStatus` = lib/callStatus's. Returns { quoteFor, calledAtLine }.
 */
export function mlbQuotes({ pre = null, gamePosts = [], callStatus }) {
  // THE QUOTED SET IS THE NAMED SET (2026-10-09, X overhaul piece 1). A homer
  // quotes a public post only when that post NAMES him: `named` is the ids the
  // posted text names, stored at post time. A row from before `named` existed
  // falls back to its `picks` (the names that were posted) -- never to the old
  // `called` list, which held every roled name on the board and quoted posts
  // that did not mention the hitter.
  const preIds = new Set(
    (pre?.payload?.named || []).length
      ? (pre.payload.named).map((id) => String(id))
      : ((pre?.payload?.picks) || []).map((p) => String(p.player_id))
  )
  // a call post names the hitter it is about, plus any other man its write-up names (`named`)
  const gameCall = new Map()
  for (const g of gamePosts || []) {
    if (!isTweetId(g.x_post_id) || !g.payload) continue
    const ids = (g.payload.named || []).length ? g.payload.named : (g.payload.player_id ? [g.payload.player_id] : [])
    for (const id of ids) gameCall.set(`${g.payload.game_pk}:${id}`, g)
  }
  const gameCallFor = (row) => (callStatus(row) === 'called' ? gameCall.get(`${row.game_pk}:${row.player_id}`) || null : null)
  const quoteFor = (row) => {
    const g = gameCallFor(row)
    if (g && isTweetId(g.x_post_id)) return g.x_post_id
    return isTweetId(pre?.x_post_id) && preIds.has(String(row.player_id)) && callStatus(row) === 'called' ? pre.x_post_id : null
  }
  const calledAtLine = (row) => { const t = etTime(gameCallFor(row)?.payload?.posted_at); return t ? `✅ Called at ${t} ET` : '' }
  return { quoteFor, calledAtLine }
}

/**
 * NFL. `posts` = homer_feed_posts rows of kind writeup_nfl_% for the touchdowns'
 * days. Returns (row, called) -> { id, line } | null for a nfl_td_feed row.
 */
export function nflWriteupQuotes(posts = []) {
  const byKey = new Map()
  for (const p of posts || []) {
    if (!isTweetId(p.x_post_id) || !p.payload?.featured) continue
    for (const pid of p.payload.called || []) byKey.set(`${p.payload.game_id}:${pid}`, p)
  }
  return (row, called) => {
    if (!called) return null
    const p = byKey.get(`${row.game_id}:${row.gsis_id}`)
    return p ? { id: p.x_post_id, line: 'Called pregame. He scored.' } : null
  }
}
