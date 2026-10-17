// THE DISPLAY GATE ON TONIGHT'S CALLED LABELS (2026-10-16, Donovan: no new page; in the app, a visitor who is not a member sees a taste of
// tonight's CALLED picks and the rest drawn as plain ON THE BOARD (Donovan: "don't show them as locked"); everything graded stays public).
//
// COSMETIC BY DESIGN: the browser already downloads the board, so this only changes what is drawn. The real hiding is server-side on the front page
// (lib/members/access.js). So it FAILS OPEN: unknown membership (loading, or the state call failed) draws the label exactly as before.
//
// Pure functions only (no React, no clock of its own): components/MemberGate.js wires them, scripts/check-member-gate.mjs tests them.
import { FREE_CALLS_PER_SPORT } from './limits'

/** 'member' | 'free' | 'unknown', from lib/dash/sync getAccount()/useDashAccount(). Only a CONFIRMED non-member is 'free'. */
export function memberStateOf(account) {
  if (!account || !account.ready || !account.configured) return 'unknown'
  if (!account.signedIn) return 'free'                       // a signed-out visitor is a non-member
  if (account.who?.member === true) return 'member'          // members and admins (the route folds admins into member)
  if (account.who?.member === false) return 'free'
  return 'unknown'                                           // signed in but the state call did not say: never show a member a lock
}

/** Has the game started? `time` is the row's own game time (ISO string or ms). No usable time: not started only on today's slate, else started. */
export function startedAt(time, { now = Date.now(), slateIsToday = true } = {}) {
  const t = time == null || time === '' ? NaN : typeof time === 'number' ? time : Date.parse(time)
  if (Number.isFinite(t)) return now >= t
  return !slateIsToday
}

/**
 * The keys that stay visible to a free viewer: the first FREE_CALLS_PER_SPORT rows that are CALLED and not yet started, in the board's own order.
 * `rows` is ONE sport's whole board (not a filtered view). `rankOf` (optional) orders them by the board's place; ties and missing places keep the
 * order given, so the same 4 stay free from one render to the next.
 */
export function freeCalledKeys(rows, { keyOf, startedOf, statusOf = (r) => r?.status, rankOf = null, max = FREE_CALLS_PER_SPORT } = {}) {
  const list = (Array.isArray(rows) ? rows : []).map((r, i) => ({ r, i }))
  if (rankOf) {
    const rk = (x) => { const n = Number(rankOf(x.r)); return Number.isFinite(n) ? n : Infinity }
    list.sort((a, b) => (rk(a) - rk(b)) || (a.i - b.i) || 0)
  }
  const out = new Set()
  for (const { r } of list) {
    if (out.size >= max) break
    if (statusOf(r) !== 'called' || startedOf(r)) continue
    out.add(keyOf(r))
  }
  return out
}

/**
 * How many CALLED, not-started rows a free viewer does NOT see as CALLED (the board's whole CALLED set minus the free taste). A count only: it names no one.
 * Same arguments as freeCalledKeys, plus `free` (its result).
 */
export function hiddenCalledCount(rows, { startedOf, statusOf = (r) => r?.status, keyOf, free } = {}) {
  let n = 0
  const seen = new Set()
  for (const r of Array.isArray(rows) ? rows : []) {
    if (statusOf(r) !== 'called' || startedOf(r)) continue
    const k = keyOf(r)
    if (seen.has(k)) continue
    seen.add(k)
    if (!(free && free.has(k))) n++
  }
  return n
}

/**
 * The table's row key for a story / list line, built the way each sport's board builds its own (components/tabs/RankedBoard.js `${playerId}|${game_pk}` where
 * playerId is `${id}-${game_pk}`; NFL `String(player_id)`; NHL `${game id}|${playerId}`), so a list and a table agree on who is in the free four.
 * A key that does not match any board's can only LOCK a man (he is not in the free set), never reveal one.
 */
const STORY_KEY = {
  mlb: (p, g) => `${p}-${g}|${g}`,
  nhl: (p, g) => `${g}|${p}`,
  nfl: (p) => p,
}
export function storyLockKey(sport, playerId, gameId) {
  const f = STORY_KEY[sport] || STORY_KEY.nfl
  return f(String(playerId ?? ''), String(gameId ?? ''))
}

/** Is this CALLED label hidden (drawn as ON THE BOARD)? Only a CALLED, not-started, not-graded pick of a non-member, outside the free taste. */
export function lockedFor({ status, started = false, graded = false, key, free, memberState }) {
  if (memberState !== 'free') return false
  if (status !== 'called') return false                      // ON THE BOARD / NOT ON THE BOARD are never locked
  if (started || graded) return false                        // public proof: once it is under way or graded the real label shows
  return !(free && free.has(key))
}

/**
 * THE PLAYER CARD RULE (2026-10-16, Donovan: lock the cards too). A card has no free four of its own, so for a non-member tonight's not-started CALLED
 * pick is LOCKED ALL, except a man who is one of the boards' free four (`free`, the same set the tables use, shared through components/MemberGate.js)
 * so the table and the card never disagree. Graded / started / ON THE BOARD / NOT ON THE BOARD, members and unknown membership: never locked.
 * Returns { locked, gate } where `gate` is CallStatusBadge's gate prop (the same shape the tables pass).
 */
export function cardGate({ status, time, graded = false, key, free = null, memberState, slateIsToday = true, now = Date.now() }) {
  const started = startedAt(time, { now, slateIsToday })
  const locked = lockedFor({ status, started, graded, key, free, memberState })
  return { locked, gate: { key, started, graded, free } }
}

/**
 * THE GAME RULE (2026-10-17, Donovan: "the games on the slate page are showing the called picks"). A game's card / header / chip row / pill must not name, mark
 * or count the CALLED men a non-member may not read. Two pure pieces, used by every game surface through components/MemberGate.js:
 *
 *   maskCalledRows   the rows of a game with the call fields of every LOCKED man taken off (he is then an ordinary ON THE BOARD row: his name, club, stats and
 *                    price stay, nothing says the bot called him). A row that is not locked is returned as the SAME object; with nothing to mask, the SAME array.
 *   gameCountVisible a per-game COUNT of called picks may be drawn only when it cannot point at a man: every called man in the game is one the viewer may read
 *                    (the free four, or the viewer is a member). One hidden man and the count is hidden for the whole game.
 */
export function maskCalledRows(rows, { lockedOf, strip }) {
  if (!Array.isArray(rows)) return rows
  let changed = false
  const out = rows.map((r) => {
    if (!r || !lockedOf(r)) return r
    changed = true
    const c = { ...r, _callHidden: true }   // the flag lets a sentence that would say "nobody was designated" say something true instead
    for (const f of strip) if (f in c) c[f] = typeof c[f] === 'string' ? '' : null
    return c
  })
  return changed ? out : rows
}

/** True when no CALLED man in `items` is locked for this viewer (so a count of them names no one the viewer may not read). */
export function gameCountVisible(items, { lockedOf }) {
  return !(Array.isArray(items) ? items : []).some((x) => lockedOf(x))
}
