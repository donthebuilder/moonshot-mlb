// THE FUNNEL LINE — what a Threads post says to do next, and where it sends.
//
// 2026-09-20, Donovan: "what about focusing on linking the thread... have
// threads be funnel system for signup."
//
// THIS IS THE WHOLE REASON THREADS IS WORTH DOING. On X a post costs $0.015
// and a post CONTAINING A URL costs $0.200 -- thirteen times -- which is why
// app/api/dash/homers/tick/route.js passes an empty `site` into every builder
// and why the link has been in zero tweets since 09-05. That constraint does
// not exist here. Threads posting is free, so on Threads the link is free,
// and the same work that currently ends at a reader can end at a visitor.
//
// ── THE LINK GOES IN A REPLY, NOT THE POST ─────────────────────────────────
//
// Default mode is `reply`: the post goes up clean and the link follows as the
// first reply under it, one tap away. Two reasons, and they point the same
// way. Every feed ranks a link-out post below one that keeps people in the
// app, so a URL in the body costs the post the reach it needs to be worth
// linking from. And a post that ends in a URL reads like an ad; a post that
// says something true and then quietly offers the receipt reads like a
// sports account. Free replies (1,000/day) are what make this affordable
// here and what made it unaffordable on X.
//
// THREADS_LINK_MODE=inline puts it in the body instead, `off` disables it.
//
// ── NOT EVERY POST ─────────────────────────────────────────────────────────
//
// A link under all forty of a night's homer alerts is a spam pattern and
// trains people to scroll past. Only the ANCHOR posts carry one -- the board,
// the grades, the recaps, the spotlight: the handful a day that make a
// promise the site can pay off. The live alerts stay clean; they are the
// reach, and reach is what the anchors convert.

import { ANCHOR_KINDS } from './postLink'

const clean = (v) => String(v == null ? '' : v).trim()

const SITE = clean(process.env.NEXT_PUBLIC_SITE_URL).replace(/\/$/, '')

export const threadsLinkMode = () => {
  const m = clean(process.env.THREADS_LINK_MODE).toLowerCase()
  return ['reply', 'inline', 'off'].includes(m) ? m : 'reply'
}

// WHERE EACH POST SENDS. /called is the public proof page -- every home run
// tonight, tagged with whether the board had him, no account needed. That is
// the right first door for a stranger: it answers the question the post just
// raised instead of asking them to sign up before they believe anything.
// 2026-09-20: football now lands on the SAME page. Donovan: "can you not just
// build it on the same side of the site" — so /called?sport=nfl is the same
// record, same layout, same promise, one URL family.
const MLB_PATH = '/called'
const NFL_PATH = '/called?sport=nfl'

// The anchor posts, by kind. Everything not listed here posts clean.
const LINKED = new Map([
  // MLB
  ['pregame', { path: MLB_PATH, cta: "Tonight's board is public before first pitch." }],
  ['board', { path: MLB_PATH, cta: 'The board is on record. Every name, before the games.' }],
  ['board_results', { path: MLB_PATH, cta: 'Every call graded in public — the misses too.' }],
  ['accountability', { path: MLB_PATH, cta: 'The full record, night by night.' }],
  ['recap', { path: MLB_PATH, cta: 'Every homer tonight, and who was on the board.' }],
  ['weekly', { path: MLB_PATH, cta: 'The week, graded.' }],
  ['monthly', { path: MLB_PATH, cta: 'The month, graded.' }],
  ['callofnight', { path: MLB_PATH, cta: 'See what else the board had tonight.' }],
  ['community_pick', { path: MLB_PATH, cta: 'Your call goes on the board with ours.' }],
  ['thefour', { path: MLB_PATH, cta: 'Four markets, four names, every day.' }],
  // NFL
  ['nfl_board', { path: NFL_PATH, cta: 'The touchdown board is on record before kickoff.' }],
  ['nfl_results', { path: NFL_PATH, cta: 'Every touchdown call graded — the misses too.' }],
  ['nfl_spotlight', { path: NFL_PATH, cta: 'The full week, player by player.' }],
  ['nfl_bigweek', { path: NFL_PATH, cta: 'The week, graded.' }],
])

/**
 * The funnel link line for one post kind and network, or '' when this kind
 * posts clean. Shared by both networks off the same LINKED map so the
 * anchor list and destinations can never drift apart between them.
 *
 * utm_source is on it so the visit is attributable. Nothing identifying goes
 * in the query string -- this says which network sent them and which post
 * type, and nothing about who they are.
 */
function linkLineFor(kind, source) {
  if (!SITE) return ''
  const hit = LINKED.get(clean(kind))
  if (!hit) return ''
  const sep = hit.path.includes('?') ? '&' : '?'
  const url = `${SITE}${hit.path}${sep}utm_source=${source}&utm_medium=social&utm_campaign=${encodeURIComponent(clean(kind))}`
  return `${hit.cta}\n${url}`
}

export function threadsLinkFor(kind) {
  if (threadsLinkMode() === 'off') return ''
  return linkLineFor(kind, 'threads')
}

// THE X FUNNEL LINK (2026-09-21). X has no free tier for this -- a post
// CONTAINING a url costs $0.200 against $0.015 without one, per xPost.js's
// own header -- so this fires only for the same short anchor list Threads
// uses (the board, the grades, the recaps, the spotlight): a couple dozen
// calls a month at the higher rate, not the 500+ live alerts. Opt-OUT, not
// opt-in -- set X_LINK_KINDS=0 to go back to fully link-free. Donovan,
// 2026-09-21: "complete the funnel for twitter at least."
export function xLinkFor(kind) {
  if (clean(process.env.X_LINK_KINDS).toLowerCase() === '0') return ''
  return linkLineFor(kind, 'x')
}

/** Every kind that carries a link — for the tick's diagnostics and for tests. */
export const linkedKinds = () => [...LINKED.keys()]

// ONE ANCHOR LIST, TWO NETWORKS (2026-09-22). X's own link policy lives in
// lib/dash/postLink.js and is the shorter of the two, because on X a link
// costs $0.200 a post and here it costs nothing. Any kind X links, Threads
// must link too -- a post that earns the link on the expensive network
// certainly earns it on the free one. This asserts that rather than trusting
// two hand-kept lists to stay in step; a kind added to ANCHOR_KINDS and
// forgotten here shows up in the check route's preview as a missing line.
export const anchorsMissingHere = () => [...ANCHOR_KINDS].filter((k) => !LINKED.has(k))
