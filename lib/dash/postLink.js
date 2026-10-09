// WHICH POSTS CARRY THE LINK — one list, both networks.
//
// 2026-09-22, Donovan: "we're posting the link too much, look into that."
//
// He is right, and it is not only a taste problem. X_POST_LINK=1 turns the
// link on GLOBALLY: `TAIL` is spread into all 44 text builders in the MLB tick
// and 14 in the NFL one, including the per-homer alert. On 09-21 that was 25
// scheduled posts plus 31 homer alerts -- roughly 55 posts a day, every one of
// them carrying a URL.
//
// X charges $0.015 for a post and $0.200 for a post CONTAINING A URL. At 55 a
// day that is about $11/day, ~$330/month, against ~$25/month for the same
// posts clean. The switch is a ~$300/month switch.
//
// And the spam read is real on its own: a link under all forty of a night's
// homer alerts trains people to scroll past it, which costs the link its job
// at the same time as it costs the money.
//
// SO THE LINK IS A PER-KIND DECISION, NOT A GLOBAL FLAG. The anchor posts
// carry one -- the board, the grades, the invitation: the few a day that make
// a promise the site can pay off. The live alerts stay clean. They are the
// reach; the anchors are what converts it.
//
// ONE LIST FOR BOTH NETWORKS. lib/dash/threadsLink.js reads this same set, so
// X and Threads can never drift into disagreeing about which posts are the
// anchors.

import { appHref, playerHref } from '../routes'
import { linksEmergencyOn } from './xPolicy'

/**
 * The anchor kinds. Everything not listed here posts clean, on every network.
 *
 * Deliberately short. Five a day on a full MLB slate, two a week on football.
 * Every addition is another $0.20 a day on X and one more post that reads like
 * an ad, so a kind earns its place here by being one a stranger could act on.
 */
export const ANCHOR_KINDS = new Set([
  // MLB
  'pregame',         // the morning board — the names, before first pitch
  'board',           // the evening board
  'community_pick',  // the one post that asks the reader for something
  // (The @MLBHR reply was an anchor from 09-22; taken out 09-26 -- Donovan:
  // no link on those replies. It posts clean like the live alerts.)
  // NFL
  'nfl_board',
  'nfl_results',
])

export const isAnchorKind = (kind) => ANCHOR_KINDS.has(String(kind || '').trim())

// ── WHERE EACH POST SENDS (funnel step 2, 2026-09-26) ─────────────────────
// Every linked post used to point at /start, and /start pointed at /called,
// which pointed back at /start. A post now links to the thing it is about:
//   board   -- the sport's board in the app (board and pick posts)
//   record  -- /called?sport=X, where the record IS the point (results,
//              recaps, the running record)
//   player  -- that player's page in the app (a homer, a touchdown, a goal);
//              falls back to the board when the caller has no player id
//   start   -- /start, only for the "what is this" post
// This decides WHERE. Whether a kind carries a link at all is still
// ANCHOR_KINDS / threadsLink.js's LINKED, and X_POST_LINK is still off by
// default -- nothing here turns a link on.
const TARGET = {
  pregame: ['mlb', 'board'], board: ['mlb', 'board'], callofnight: ['mlb', 'board'],
  thefour: ['mlb', 'board'], community_pick: ['mlb', 'board'],
  hot_month: ['mlb', 'player'], hot_week: ['mlb', 'player'],
  receipt: ['mlb', 'record'], weekly: ['mlb', 'record'], monthly: ['mlb', 'record'],   // (accountability / recap / board_results retired into the receipt, 10-09)
  homer: ['mlb', 'player'], mlbhr_reply: ['mlb', 'player'],
  nfl_board: ['nfl', 'board'], nfl_spotlight: ['nfl', 'player'],
  nfl_results: ['nfl', 'record'], nfl_bigweek: ['nfl', 'record'],
  td: ['nfl', 'player'],
  goal: ['nhl', 'player'],
  whatis: ['mlb', 'start'],
  // 2026-09-27: the daily longshots posts open the Longshots page.
  longshots: ['mlb', 'longshots'], nfl_longshots: ['nfl', 'longshots'], nhl_longshots: ['nhl', 'longshots'],
}
const PATH = {
  board: (sport) => appHref(sport),
  record: (sport) => `/called?sport=${sport}`,
  player: (sport, id) => (id ? playerHref(sport, id) : appHref(sport)),
  start: (sport) => `/start?sport=${sport}`,
  longshots: (sport) => appHref(sport, 'longshots'),
}

/** The site path a post of this kind links to. Unknown kinds get /start. */
export function postPath(kind, { playerId = null } = {}) {
  const [sport, where] = TARGET[String(kind || '').trim()] || ['mlb', 'start']
  return PATH[where](sport, playerId)
}

/** path + tracking query, with the query BEFORE any #hash (an app link's hash is its address). */
export function withQuery(path, query) {
  if (!query) return path
  const [head, hash] = String(path).split(/#(.*)/s)
  return `${head}${head.includes('?') ? '&' : '?'}${query}${hash != null ? `#${hash}` : ''}`
}

/**
 * The {site, handle} tail for one post kind.
 *
 * X_POST_LINK is still the master switch and still defaults OFF, so nothing
 * changes until it is set. What changed is that setting it no longer means
 * "every post": it means "the anchor posts".
 */
export function tailFor(kind, { site = '', handle = '' } = {}) {
  // NO LINKS ON X (2026-10-09): the tail carries a URL, so it needs the emergency
  // switch (X_LINKS_EMERGENCY=on) as well as X_POST_LINK=1. Default: never.
  if (!linksEmergencyOn() || String(process.env.X_POST_LINK || '') !== '1') return { site: '', handle: '' }
  if (!isAnchorKind(kind)) return { site: '', handle: '' }
  return { site, handle }
}

// ── WHAT THREADS CARRIES (2026-09-22) ──────────────────────────────────────
//
// Donovan: "they didn't have CALLED IT, so instead this will be DASH Network.
// This will be more free-flowing sports network — highlights, player
// spotlights and such — along with the tracker, since Threads is free."
//
// So Threads is NOT a mirror of the CALLED IT feed. Same engine, different
// account, different job: X is the record, Threads is the network. The handle
// is @dashsportsnetwork and the posts should read like a sports account that
// happens to run a model, not like a model that happens to post.
//
// FREE DOES NOT MEAN ALL OF IT. The 250-posts-a-day ceiling means volume costs
// nothing, which is exactly why the temptation is to send all ~55 a day. A new
// account whose first week is forty "PAIR TRAP · 12 same-day HR games (5.9%)"
// posts reads as a scraper. The dense stat lists are the CALLED IT feed's own
// texture -- they work for people already invested in the board -- and they
// are the wrong first impression for an account nobody follows yet.
//
// So Threads carries the three things a sports network posts: THE MOMENT (a
// homer, a touchdown), THE PLAYER (spotlights, hot stretches) and THE RECORD
// (the board, the grades). Everything else stays on X until Donovan says
// otherwise. THREADS_KINDS=all overrides this and sends everything.
const THREADS_KINDS = new Set([
  // THE MOMENT — the live alerts. On a highlights account these are the feed.
  'homer', 'td',
  // THE PLAYER
  'hot_month', 'hot_week',        // MOONSHOT's hot stretch — the MLB spotlight
  'nfl_spotlight', 'nfl_bigweek',
  'callofnight',
  // THE RECORD — the tracker, which is the reason to follow rather than scroll
  'pregame', 'board', 'receipt',
  'weekly', 'monthly', 'thefour',
  'nfl_board', 'nfl_results',
  // The one post that asks the reader for something
  'community_pick',
])

/**
 * Does this kind go to Threads at all?
 *
 * An unknown/absent kind returns FALSE deliberately: a post nobody classified
 * should not quietly become this account's first impression. Every kind that
 * belongs on Threads is named above.
 */
export function mirrorsToThreads(kind) {
  if (String(process.env.THREADS_KINDS || '').trim().toLowerCase() === 'all') return true
  return THREADS_KINDS.has(String(kind || '').trim())
}

export const threadsKinds = () => [...THREADS_KINDS]
