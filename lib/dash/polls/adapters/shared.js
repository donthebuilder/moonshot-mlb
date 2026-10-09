// What every poll adapter shares (X overhaul stage 3 piece 2). Pure helpers + two small db reads.
//
// AN ADAPTER is created per (sport, day) and read lazily; the runner only asks for the data the
// chosen format needs. Its shape:
//   slate()    -> { active, why?, players: [{ id, name, team, opp, startMs, rank, pos }], pending: [{ id, reason, startMs }] }
//                 players = EVERY pre-naming check passed (lineup / starter / goalie / injury), his game not
//                 started, best first. pending = a check that may still clear (the post is HELD, then DROPPED).
//   bars()     -> [{ id, label, threshold, cleared, of }]   real counts over his last games
//   streaks()  -> [{ id, what, whatKey, n, min }]           real active streaks
//   called()   -> [{ id, name, team }]                      the names the public pregame/slate post carried
//   results(guess) -> { known, ranking: [{ id, name, value }] }   from STORED results only

export const num = (v) => { if (v == null || v === '') return null; const n = Number(v); return Number.isFinite(n) ? n : null }
export const txt = (v) => String(v == null ? '' : v).trim()

/** Best-first by rank (lower first), then score (higher first); unranked last. */
export const byBoard = (a, b) => (num(a.rank) ?? 1e9) - (num(b.rank) ?? 1e9) || (num(b.score) ?? 0) - (num(a.score) ?? 0)

/** One row per player id (a doubleheader or a second game lists him twice): the earliest game. */
export function onePerPlayer(list) {
  const seen = new Map()
  for (const p of list) {
    const old = seen.get(p.id)
    if (!old || (num(p.startMs) ?? 1e18) < (num(old.startMs) ?? 1e18)) seen.set(p.id, p)
  }
  return [...seen.values()]
}

/** The public names a stored post carried: payload.named narrows payload.picks to who the text really names. */
export function namesFromPostPayload(payload) {
  const p = payload && typeof payload === 'object' ? payload : {}
  const picks = Array.isArray(p.picks) ? p.picks : []
  const named = Array.isArray(p.named) && p.named.length ? new Set(p.named.map(String)) : null
  return picks
    .map((r) => ({ id: txt(r?.player_id ?? r?.id), name: txt(r?.name), team: txt(r?.team) || null }))
    .filter((r) => r.id && r.name && (!named || named.has(r.id)))
}

/** The stored (day, kind) row's payload, or null. A failed read is null: the board question just waits. */
export async function storedPayload(db, day, kind) {
  if (!db) return null
  const { data, error } = await db.from('homer_feed_posts').select('payload').match({ day, kind }).maybeSingle()
  if (error) { console.error(`[polls] read ${kind} ${day}: ${error.message}`); return null }
  return data?.payload || null
}

/** Rank [{id, name, value}] from per-id counts for a poll's candidate list; only ids with a value > 0. */
export function rankFromCounts(candidates, counts) {
  return (candidates || [])
    .map((c) => ({ id: String(c.id), name: c.name, value: counts.get(String(c.id)) || 0 }))
    .filter((r) => r.value > 0)
    .sort((a, b) => b.value - a.value)
}

/** Consecutive games from the newest with `ok(game)`; `games` newest first. */
export function runLength(games, ok) {
  let n = 0
  for (const g of games) { if (ok(g)) n += 1; else break }
  return n
}
