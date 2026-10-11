// RANK MOVES (2026-10-10, Donovan: "the ranking should show an up and down arrow for players who
// moved since the bot updated, and this is site wide").
//
// WHAT THIS IS: a quiet arrow beside a player's rank when his place on a board changed since the
// previous update of that same board. INFORMATION ONLY. It is never part of a score, a rank, a
// call or a status, and it never changes a sort order: every function here reads ranks that
// already exist and writes nothing back into them.
//
// WHERE THE PREVIOUS RANK COMES FROM (traced 2026-10-10, source -> transform -> state -> output):
//   1. The data branch is ONE force-pushed orphan commit (publish_data.sh), so there is no git
//      history of earlier runs to read. A previous snapshot is not stored anywhere on the bot side.
//   2. NHL and NBA boards are computed by this site's own API routes from public feeds; no bot run
//      exists for them at all.
//   3. So: (a) if the bot publishes the previous rank on the row, we read it (spec:
//      .claude-notes/RANK-MOVE-SPEC.md; absent today); (b) otherwise this DEVICE remembers the last
//      two distinct orderings it saw for that board and that game date (localStorage, ~3 KB a
//      board), and the arrow compares the two. No server, no cron, no SQL, no stored model data.
//
// RULES (each one is tested in scripts/check-rank-move.mjs):
//   - ranks are compared on the SAME ordering the board prints by default (the caller passes them);
//     a user's own sort or filter never changes what the arrow refers to
//   - different game dates are never compared
//   - a previous snapshot older than MAX_AGE_H hours before the current one shows nothing
//   - no previous snapshot, or one that covers too little of this board, shows nothing
//   - NEW = on this board now, not on the previous snapshot (only when the snapshots overlap)
//   - a player who dropped off the board has no row, so there is nothing to draw
//   - unchanged shows nothing

export const MAX_AGE_H = 6
const MIN_ROWS = 3          // a "board" of fewer than three ranked players is not one
const MIN_OVERLAP = 0.5     // share of today's players the previous snapshot must also hold

/** Map | plain object | [[id, rank], ...] -> Map(string id -> finite rank). */
export function rankMapOf(input) {
  const out = new Map()
  if (!input) return out
  const entries = input instanceof Map ? input.entries() : Array.isArray(input) ? input : Object.entries(input)
  for (const [k, v] of entries) {
    const r = Number(v)
    if (k == null || k === '' || !Number.isFinite(r) || r <= 0) continue
    out.set(String(k), r)
  }
  return out
}

/** A short stable fingerprint of one ordering (ids + ranks), independent of insertion order. */
export function signature(ranks) {
  const m = rankMapOf(ranks)
  const parts = [...m.entries()].sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)).map(([k, v]) => `${k}:${v}`)
  let h = 5381
  const s = parts.join('|')
  for (let i = 0; i < s.length; i += 1) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0
  return `${m.size}.${h.toString(36)}`
}

/**
 * How each current player moved against a previous ordering.
 * Returns a Map(id -> { kind: 'up' | 'down' | 'new', n }) holding ONLY the players who moved or are new,
 * or null when the two orderings cannot honestly be compared (too few rows, too little overlap).
 */
export function diffMoves(curIn, prevIn) {
  const cur = rankMapOf(curIn), prev = rankMapOf(prevIn)
  if (cur.size < MIN_ROWS || prev.size < MIN_ROWS) return null
  let shared = 0
  for (const id of cur.keys()) if (prev.has(id)) shared += 1
  if (shared / cur.size < MIN_OVERLAP) return null
  const out = new Map()
  for (const [id, c] of cur) {
    const p = prev.get(id)
    if (p == null) { out.set(id, { kind: 'new', n: 0 }); continue }
    if (c < p) out.set(id, { kind: 'up', n: p - c })
    else if (c > p) out.set(id, { kind: 'down', n: c - p })
  }
  return out
}

// ── the device's memory: the last two distinct orderings of one board on one game date ────────────
// store = { v: 1, date, cur: { sig, at, ranks: {id: rank} }, prev: {...} | null }

const plain = (ranks) => Object.fromEntries(rankMapOf(ranks))

/**
 * Fold a newly seen ordering into the store. Pure: returns the next store (the same object when
 * nothing changed). A different game date starts a fresh store (dates are never compared). An
 * ordering already held as `cur` changes nothing (a record is never rewritten). An OLDER run
 * (its `at` before cur's) is ignored so a stale payload cannot become the "previous".
 */
export function advance(store, { date, ranks, at = null, now = Date.now() }) {
  const m = rankMapOf(ranks)
  if (!date || m.size < MIN_ROWS) return store || null
  const sig = signature(m)
  const stamp = Number.isFinite(Number(at)) && Number(at) > 0 ? Number(at) : now
  const snap = { sig, at: stamp, ranks: plain(m) }
  if (!store || store.v !== 1 || String(store.date) !== String(date) || !store.cur) return { v: 1, date: String(date), cur: snap, prev: null }
  if (store.cur.sig === sig) return store
  if (stamp < store.cur.at) return store
  return { v: 1, date: String(date), cur: snap, prev: store.cur }
}

/**
 * What the board should draw right now.
 *   { moves: Map, prevAt: ms | null, source: 'device' | 'bot' } or null (draw nothing).
 * `ranks` is the board's CURRENT default ordering. Before the store has absorbed it, the store's
 * `cur` is what it will become `prev`, so the answer is the same either way.
 */
export function movesFor(store, { date, ranks, atNow = null, maxAgeH = MAX_AGE_H }) {
  const m = rankMapOf(ranks)
  if (!store || store.v !== 1 || !date || String(store.date) !== String(date) || m.size < MIN_ROWS) return null
  const sig = signature(m)
  const prev = store.cur?.sig === sig ? store.prev : store.cur
  if (!prev) return null
  const curAt = store.cur?.sig === sig ? store.cur.at : (Number.isFinite(Number(atNow)) && Number(atNow) > 0 ? Number(atNow) : Date.now())
  if (curAt - prev.at > maxAgeH * 3600 * 1000) return null
  const moves = diffMoves(m, prev.ranks)
  if (!moves) return null
  return { moves, prevAt: prev.at, source: 'device' }
}

/**
 * The previous ranks the BOT published on the rows, if it publishes them (see RANK-MOVE-SPEC.md):
 * row[spec.prevRanks] = { [board]: rank }, row[spec.prevAt] = ISO time of that snapshot,
 * row[spec.prevDate] = the game date it was for. Returns { ranks, prevAt } or null.
 * A snapshot for another date, or older than maxAgeH before `curAt`, is not used.
 */
export function botPrevOf(rows, spec, { board, date, idOf, curAt = Date.now(), maxAgeH = MAX_AGE_H }) {
  if (!spec || !Array.isArray(rows) || !rows.length) return null
  const ranks = new Map()
  let at = null
  for (const r of rows) {
    const pr = r?.[spec.prevRanks]
    if (!pr || typeof pr !== 'object') continue
    const d = r?.[spec.prevDate]
    if (d && date && String(d).slice(0, 10) !== String(date).slice(0, 10)) return null
    const v = Number(pr[board])
    const id = idOf ? idOf(r) : null
    if (id == null || !Number.isFinite(v) || v <= 0) continue
    ranks.set(String(id), v)
    const t = Date.parse(r?.[spec.prevAt])
    if (Number.isFinite(t)) at = at == null ? t : Math.max(at, t)
  }
  if (!ranks.size) return null
  if (at != null && curAt - at > maxAgeH * 3600 * 1000) return null
  return { ranks, prevAt: at }
}

/** The words behind an arrow. `prevAt` is a ms time or null; `fmtTime` turns it into HH:MM. */
export function moveText(move, prevAt = null, fmtTime = defaultTime, source = 'device') {
  if (!move) return ''
  const since = prevAt ? `since the update at ${fmtTime(prevAt)}` : 'since the last update'
  const whose = "our model's ranking"   // source ('bot' | 'device') is kept for the caller; the words are the same
  if (move.kind === 'new') return `New on this board: not in the previous update (${prevAt ? fmtTime(prevAt) : 'last update'}). Information only, it changes no score.`
  const word = move.kind === 'up' ? 'up' : 'down'
  return `Moved ${word} ${move.n} place${move.n === 1 ? '' : 's'} in ${whose} ${since}. Information only, it changes no score.`
}

function defaultTime(ms) {
  try { return new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) } catch { return '' }
}

/** Caption under a board that draws arrows. Our model's ranking, never "the bot". */
export const MOVE_CAPTION = "Arrows: places moved in our model’s ranking since its last update. A sort or filter of yours does not change them."
