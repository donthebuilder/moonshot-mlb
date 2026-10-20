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
  // THE SLATE (2026-10-09, X overhaul piece 3) is the day's morning post now. Its `named` holds the ids of EVERY
  // sport it names, so MOONSHOT's ids are read from `named_by_sport.mlb` (always present on a Slate row, empty
  // when it named no hitter); an older pregame row keeps `named`, then `picks`.
  const slated = pre?.payload?.named_by_sport
  const preIds = new Set(
    Array.isArray(slated?.mlb)
      ? slated.mlb.map((id) => String(id))
      : (pre?.payload?.named || []).length
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
  // the same words as every sport's receipt (2026-10-20): "WE HAD HIM 🔥 Called at 6:05 PM ET."
  const calledAtLine = (row) => { const t = etTime(gameCallFor(row)?.payload?.posted_at); return t ? `WE HAD HIM \u{1F525} Called at ${t} ET.` : '' }
  return { quoteFor, calledAtLine }
}

/**
 * THE SLATE's receipt for any other sport (NFL, NHL, NBA): a CALLED player of `sport` quotes the day's Slate
 * only when the post NAMES him (named_by_sport[sport]) and it really went out (a real X id).
 * @returns {(playerId) => string|null}
 */
export function slateQuoteFor(sport, slate = null) {
  const ids = new Set((Array.isArray(slate?.payload?.named_by_sport?.[sport]) ? slate.payload.named_by_sport[sport] : []).map((id) => String(id)))
  return (playerId) => (isTweetId(slate?.x_post_id) && ids.has(String(playerId)) ? String(slate.x_post_id) : null)
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
    return p ? { id: p.x_post_id, line: receiptLineOf({ at: p.payload?.posted_at || p.seen_at }) } : null
  }
}

// ── THE LIVE RECEIPT, EVERY SPORT (2026-10-20, claude/CALLED-IT-PLAYBOOK-2026-10-20.txt: "every CALLED hit quotes our own pregame
// post. 'WE HAD HIM 🔥 Called at 9:12 AM.'"). A CALLED touchdown, goal or 30-point night quotes the most specific public post that
// NAMED him before it happened, and says when it went out. Only a post that really went to X (a tweet id) and that names him
// (`named`, stored at post time; a write-up's `called`) counts. Most specific first:
//   his game's write-up -> THE CARD -> the sport's own pregame post (LAMP's slate, the board post) -> THE SLATE
// MLB keeps mlbQuotes above (its call_<game_pk> posts are its write-ups); its line is RECEIPT_WORDS too.
export const RECEIPT_WORDS = 'WE HAD HIM \u{1F525}'
const QUOTE_ORDER = Object.freeze({
  nfl: { writeup: 'writeup_nfl_', kinds: ['card_nfl', 'nfl_board'] },
  nhl: { writeup: 'writeup_nhl_', kinds: ['card_nhl', 'nhl_slate', 'nhl_board'] },
  nba: { writeup: 'writeup_nba_', kinds: ['card_nba'] },
})
/** The kinds a sport's receipt may quote (for the one read of the day's posts). */
export const quoteKinds = (sport) => (QUOTE_ORDER[sport] ? [...QUOTE_ORDER[sport].kinds, 'slate'] : ['slate'])
const namesOf = (p) => new Set([...(p?.payload?.named || []), ...(p?.payload?.called || [])].map((v) => String(v)))
const atOf = (p) => p?.payload?.posted_at || p?.seen_at || null

/**
 * `posts` = homer_feed_posts rows ({ day, kind, x_post_id, payload, seen_at }) of the event's days. Returns
 * ({ day, playerId, gameId }) -> { id, at, kind } | null: the post a CALLED event of `sport` quotes. Pure.
 */
export function pregameQuotes(sport, posts = []) {
  const order = QUOTE_ORDER[sport]
  const real = (posts || []).filter((p) => isTweetId(p.x_post_id))
  return ({ day, playerId, gameId }) => {
    const pid = String(playerId)
    const same = real.filter((p) => !day || p.day === day)
    const pick = (p) => (p ? { id: String(p.x_post_id), at: atOf(p), kind: p.kind } : null)
    if (order) {
      const w = same.find((p) => String(p.kind).startsWith(order.writeup) && String(p.payload?.game_id ?? '') === String(gameId ?? '') && namesOf(p).has(pid))
      if (w) return pick(w)
      for (const k of order.kinds) { const p = same.find((x) => x.kind === k && namesOf(x).has(pid)); if (p) return pick(p) }
    }
    const s = same.find((p) => p.kind === 'slate' && (p.payload?.named_by_sport?.[sport] || []).map(String).includes(pid))
    return pick(s)
  }
}

/** "WE HAD HIM 🔥 Called at 6:05 PM ET." (the quoted post's own time), or "WE HAD HIM 🔥 Called pregame." when it has none. */
export function receiptLineOf(q) {
  if (!q) return null
  const t = etTime(q.at)
  return `${RECEIPT_WORDS} Called ${t ? `at ${t} ET` : 'pregame'}.`
}
