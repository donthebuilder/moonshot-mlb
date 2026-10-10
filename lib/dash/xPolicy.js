// THE X POSTING POLICY: ONE PLACE (Donovan, 2026-10-09, X overhaul stage 3 piece 1).
//
// Every number and every list the X posting rules need lives HERE and nowhere
// else: the daily cap, which kinds count toward it, which are exempt, the
// priority order near the cap, the repeat windows, the hold/drop timing.
// Pure: no database, no network, no env reads except the emergency off-switches
// named at the bottom. lib/dash/xGate.js is the part that touches the database.
//
// THE RULES (locked 10-08 / answered 10-09):
//   1. ONE daily cap of 20 automated X posts (ET day) that EVERY kind counts
//      toward, except the two exempt families below.
//   2. EXEMPT from the cap AND not counted: live CALLED alerts (homer, td,
//      goal, nba30 -- the alert tables) and BOARD posts (board, nfl_board,
//      nhl_board: the page's essential feed). CALLED alerts may exceed the cap.
//   3. Near the cap: CALLED > slate > write-ups > facts > polls > numerology.
//      Each tier below stops RESERVE posts before the cap, so the lower tiers
//      give way first and the higher ones still have room.
//   4. The same player + the same kind not within 3 days (NFL: 7). Exempt: live
//      CALLED alerts, the night receipt (and the other receipts), the boards.
//   5. Before a post names a player: he is checked (xGate / namingChecks). A
//      check that fails when the post is due HOLDS it, tick after tick, until
//      HOLD_UNTIL_BEFORE_START_MIN minutes before first pitch / puck drop /
//      kickoff; after that it is DROPPED.
//   6. No links, no hashtags (threadsLink.xLinkFor, postLink.tailFor).

import { POLL_KINDS, POLL_RESULT_KINDS } from './polls/kinds'

export const X_POLICY = Object.freeze({
  dailyCap: 20,
  // Repeat windows in days. A player named in this kind's family on day D may be
  // named again on day D + window (so a 3-day window blocks D+1 and D+2, and a
  // 7-day NFL window allows the same weekday next week).
  repeatDays: Object.freeze({ default: 3, nfl: 7 }),
  // A held post is dropped this many minutes before the game's start.
  holdUntilBeforeStartMin: 30,
})

// ── THE TIERS, highest first. `reserve` = how many posts are kept free for the
// tiers above it: a tier is allowed while (counted today) < dailyCap - reserve.
export const TIERS = Object.freeze([
  { tier: 'called',     priority: 0, reserve: 0, exempt: true,  note: 'live CALLED alerts: never blocked, never counted' },
  { tier: 'board',      priority: 0, reserve: 0, exempt: true,  note: 'the board posts (the essential feed): never blocked, never counted' },
  { tier: 'slate',      priority: 1, reserve: 0,  note: 'the slate / called shots / call of the night' },
  { tier: 'writeup',    priority: 2, reserve: 2,  note: 'write-ups and the night receipt (grades, recaps, weekly, monthly)' },
  { tier: 'fact',       priority: 3, reserve: 4,  note: 'fact-style posts: lists, longshots, 2+ club, hardest shot, matchups, milestones, replies' },
  { tier: 'poll',       priority: 4, reserve: 6,  note: 'polls and community prompts' },
  { tier: 'numerology', priority: 5, reserve: 8,  note: 'numerology' },
])
const TIER = Object.fromEntries(TIERS.map((t) => [t.tier, t]))

// ── RETIRED FOR GOOD (2026-10-09, Donovan). Never claimed, built or posted again; their
// history rows stay (the database's kind check still lists them for that reason).
// The tick's claimSlot gate refuses them even if some code path asks.
export const RETIRED_KINDS = Object.freeze(['hotcontact_mid', 'dangercombos_mid'])
// ...and, 2026-10-09 (X overhaul piece 3): THE SLATE replaced these three. Their history rows stay (the
// database check still lists them, the receipt lookups still read an old row), nothing claims or posts them.
export const RETIRED_BY_SLATE = Object.freeze(['pregame', 'callofnight', 'thefour'])
// ...and, 2026-10-09 (X overhaul piece 5): THE NIGHT RECEIPT (lib/posts/receipt.js) absorbed these three: the
// accountability grade, the night recap and the graded board post. Their history rows stay valid (the database
// check still lists them), nothing claims or posts them again.
export const RETIRED_BY_RECEIPT = Object.freeze(['accountability', 'recap', 'board_results'])
export const isRetiredForever = (kind) => RETIRED_KINDS.includes(String(kind || '')) || RETIRED_BY_SLATE.includes(String(kind || '')) || RETIRED_BY_RECEIPT.includes(String(kind || ''))

// ── KIND -> TIER. Exact kinds first, then prefixes. An unlisted kind is a
// 'fact' (counted, capped, repeat-guarded): the safe default for a new kind.
const KIND_TIER = {
  // live CALLED alerts (these post from their own ticks and are counted by table, not by kind)
  homer: 'called', td: 'called', nhlgoal: 'called', nba30: 'called',
  // the board posts
  board: 'board', nfl_board: 'board', nhl_board: 'board',
  // slate
  // the NFL call-sheet reply under a CALLED touchdown: its own post, so it counts
  nfl_callsheet_reply: 'slate',
  pregame: 'slate', callofnight: 'slate', thefour: 'slate', slate: 'slate',
  // TOP TOTALS: called before the first game like a write-up (lib/totals/post.js)
  top_totals: 'writeup', nfl_top_totals: 'writeup', nhl_top_totals: 'writeup', nba_top_totals: 'writeup',
  // THE CARD (2026-10-10, lib/card/post.js): the pregame card post and its free result, both write-up tier (called before the first game / graded after the final)
  card_mlb: 'writeup', card_nfl: 'writeup', card_nhl: 'writeup', card_result_mlb: 'writeup', card_result_nfl: 'writeup', card_result_nhl: 'writeup',
  // write-ups + the night receipt
  // receipt = THE NIGHT RECEIPT (accountability, recap and board_results retired into it); weekly / monthly are the same
  // receipt over the nights. nfl_results is the NFL board's own graded row (/called reads it).
  writeup: 'writeup', receipt: 'writeup', weekly: 'writeup', monthly: 'writeup',
  nfl_results: 'writeup', nfl_bigweek: 'writeup',
  // polls
  botpoll: 'poll', community_pick: 'poll', nfl_botpoll: 'poll', nfl_community: 'poll',
  // numerology
  numerology: 'numerology',
}
// The new polls (lib/dash/polls, 2026-10-09): every format is a poll-tier post (they stop at 14);
// the reveal is INFO, a receipt of the poll, so it is a write-up tier post.
for (const k of POLL_KINDS) KIND_TIER[k] = 'poll'
for (const k of POLL_RESULT_KINDS) KIND_TIER[k] = 'writeup'
const PREFIX_TIER = [
  ['call_', 'writeup'],        // the per-game call = the MLB write-up
  ['writeup_', 'writeup'],     // writeup_nfl_<game>, writeup_nhl_<game>, writeup_nba_<game>
]

/** The tier a kind belongs to. */
export function tierOf(kind) {
  const k = String(kind || '')
  if (KIND_TIER[k]) return KIND_TIER[k]
  for (const [p, t] of PREFIX_TIER) if (k.startsWith(p)) return t
  return 'fact'
}
export const tierInfo = (kind) => TIER[tierOf(kind)]
export const isCapExempt = (kind) => Boolean(tierInfo(kind).exempt)

/** Kinds (exact) that are exempt from the cap and not counted: for the count query's NOT IN list. */
export const EXEMPT_KINDS = Object.freeze(Object.entries(KIND_TIER).filter(([, t]) => TIER[t].exempt).map(([k]) => k))

// The night receipt and the other receipts grade a post that already named the
// players, so they repeat names by design: exempt from the repeat guard.
const RECEIPT_KINDS = new Set(['receipt', 'weekly', 'monthly', 'nfl_results', 'nfl_bigweek', 'card_result_mlb', 'card_result_nfl', 'card_result_nhl', ...POLL_RESULT_KINDS])
export const isReceipt = (kind) => RECEIPT_KINDS.has(String(kind || ''))
/** Exempt from the repeat guard: live CALLED alerts, the receipts, and the board. */
export const isRepeatExempt = (kind) => tierOf(kind) === 'called' || tierOf(kind) === 'board' || isReceipt(kind)

/** The most posts the tier of `kind` may reach today (counted posts < this = allowed). */
export function allowedBelow(kind) {
  const t = tierInfo(kind)
  return t.exempt ? Infinity : X_POLICY.dailyCap - t.reserve
}
/** Pure cap decision: may a post of `kind` go out when `used` counted posts have already? */
export const capAllows = (kind, used) => used < allowedBelow(kind)

// ── SPORT OF A KIND (for the NFL 7-day window).
export function sportOfKind(kind) {
  const k = String(kind || '')
  const card = /^card_(?:result_|members_)?(mlb|nfl|nhl|nba)$/.exec(k)   // THE CARD's kinds end in their sport (lib/card/post.js)
  if (card) return card[1]
  if (/^(nfl_|list_nfl|writeup_nfl)/.test(k)) return 'nfl'
  if (/^(nhl_|list_nhl|writeup_nhl|nhlhardest|nhlgoal)/.test(k)) return 'nhl'
  if (/^(nba|buckets|writeup_nba)/.test(k)) return 'nba'
  return 'mlb'
}
export const repeatWindowDays = (kind) => (sportOfKind(kind) === 'nfl' ? X_POLICY.repeatDays.nfl : X_POLICY.repeatDays.default)

/** The family a kind repeats within: every call_<game_pk> is one family, as are the write-ups per sport. */
export function familyOf(kind) {
  const k = String(kind || '')
  if (k.startsWith('call_')) return 'call_*'
  const w = k.match(/^(writeup_(?:nfl|nhl|mlb|nba))_/)
  if (w) return `${w[1]}_*`
  return k
}
/** The SQL LIKE pattern for a family, or null when the family is one exact kind. */
export function familyLike(kind) {
  const f = familyOf(kind)
  return f.endsWith('_*') ? `${f.slice(0, -1).replace(/_/g, '\\_')}%` : null
}
export const inFamily = (family, kind) => (family.endsWith('_*') ? String(kind || '').startsWith(family.slice(0, -1)) : String(kind || '') === family)

// ── WHO A POST NAMED. Every public post stores `named` (player ids) in its payload
// at post time (withNamed); older rows carry them under the kind's own shape.
const idOf = (o) => (o == null ? '' : typeof o === 'object' ? String(o.player_id ?? o.id ?? o.gsis_id ?? '') : String(o))
/** The player ids a stored payload names, from `named` and every legacy shape. */
export function namedIdsOf(payload) {
  const p = payload && typeof payload === 'object' ? payload : {}
  const out = new Set()
  const add = (v) => { const s = idOf(v).trim(); if (s) out.add(s) }
  // an explicit `named` list is exactly who the text named: trust it over the legacy shapes
  if (Array.isArray(p.named) && p.named.length) { for (const v of p.named) add(v); return [...out] }
  for (const key of ['picks', 'rows', 'players']) for (const v of Array.isArray(p[key]) ? p[key] : []) add(v)
  if (p.pick && typeof p.pick === 'object') add(p.pick)
  if (p.player_id != null && typeof p.player_id !== 'object') add(p.player_id)
  return [...out]
}
/**
 * The ids a payload names that are really IN the posted text: a payload may keep the whole
 * list (a list post stores every row) while the text shows only the first few. Entries with
 * no name to look for are kept; an explicit `named` list is trusted as it is.
 */
export function namedInText(payload, text) {
  const p = payload && typeof payload === 'object' ? payload : {}
  if (Array.isArray(p.named) && p.named.length) return namedIdsOf({ named: p.named })
  const t = String(text == null ? '' : text)
  const out = new Set()
  const consider = (o) => {
    const id = idOf(o).trim()
    if (!id) return
    const name = o && typeof o === 'object' ? String(o.name || '').trim() : ''
    if (!name || t.includes(name)) out.add(id)
  }
  for (const key of ['picks', 'rows', 'players']) for (const v of Array.isArray(p[key]) ? p[key] : []) consider(v)
  if (p.pick && typeof p.pick === 'object') consider(p.pick)
  if (p.player_id != null && typeof p.player_id !== 'object') consider({ player_id: p.player_id, name: p.name })
  return [...out]
}

/** payload + the `named` list (the exact ids the public text names). */
export function withNamed(payload, ids) {
  const named = [...new Set((ids || []).map((v) => String(v)).filter(Boolean))]
  return { ...(payload || {}), named }
}

// ── REPEATS. `recent` = [{ day, kind, payload }] rows already posted in this kind's family.
const dayNo = (d) => Math.floor(Date.parse(`${d}T12:00:00Z`) / 864e5)
/** The ids named by a same-family post fewer than `windowDays` days before `day`. Pure. */
export function recentNamedIds(recent, { day, windowDays }) {
  const out = new Set()
  for (const r of recent || []) {
    const gap = dayNo(day) - dayNo(r.day)
    if (gap < 0 || gap >= windowDays) continue          // a later day, or old enough to name him again
    for (const id of namedIdsOf(r.payload)) out.add(id)
  }
  return out
}
/** Which of `ids` were named too recently. Pure. */
export const repeatsOf = (ids, recentSet) => [...new Set((ids || []).map(String))].filter((id) => recentSet.has(id))

// ── HOLD, THEN DROP (rule 5). `startMs` = the first pitch / puck drop / kickoff of the
// earliest game the post names. Pure. 'go' = nothing pending.
export function holdOrDrop({ pending, startMs, now = Date.now() }) {
  if (!pending || !pending.length) return { state: 'go' }
  const reason = pending.map((p) => (p && p.reason) || String(p)).slice(0, 3).join('; ')
  if (!Number.isFinite(startMs)) return { state: 'held', reason }   // no start known: keep waiting, never name him
  const dropAt = startMs - X_POLICY.holdUntilBeforeStartMin * 60e3
  return now >= dropAt ? { state: 'dropped', reason } : { state: 'held', reason }
}

// ── POLL OPTIONS: distinct, as X will see them (X cuts an option at 25 characters).
export const POLL_OPTION_MAX = 25
/** Up to `max` options with no two the same (case, spacing, accents, or after the 25-character cut). */
export function distinctOptions(names, max = 4) {
  const seen = new Set()
  const out = []
  for (const raw of names || []) {
    const text = String(raw == null ? '' : raw).replace(/\s+/g, ' ').trim()
    if (!text) continue
    const key = text.slice(0, POLL_OPTION_MAX).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
    if (out.length >= max) break
  }
  return out
}

// ── EMERGENCY OFF-SWITCHES (env). Never knobs: the cap, kinds and priorities are code.
//   X_POSTS_PAUSE=on          no scheduled X post goes out (live CALLED alerts still do)
//   X_GUARDS_OFF=repeat,naming,cap   turns the named guard(s) off, for a bad deploy
//   X_LINKS_EMERGENCY=on      lets the funnel link back onto X posts (default: never)
const envList = (name) => String(process.env[name] || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)
export const postsPaused = () => /^(on|1|true)$/i.test(String(process.env.X_POSTS_PAUSE || '').trim())
export const guardOff = (name) => envList('X_GUARDS_OFF').includes(name)
export const linksEmergencyOn = () => /^(on|1|true)$/i.test(String(process.env.X_LINKS_EMERGENCY || '').trim())

// ── NO LINKS (rule 6). The last line of defence, applied to every X post in
// postToX: a URL (or the site's own host) in a post's text is cut, whatever
// wrote it. Text without one comes back unchanged, character for character.
const LINK = /https?:\/\/\S+|\bdashnetwork\.vercel\.app\S*/gi
export function stripLinks(text) {
  const s = String(text == null ? '' : text)
  if (linksEmergencyOn() || !LINK.test(s)) { LINK.lastIndex = 0; return s }
  LINK.lastIndex = 0
  return s.replace(LINK, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')
}
