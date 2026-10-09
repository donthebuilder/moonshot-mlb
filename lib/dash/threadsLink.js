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

import { ANCHOR_KINDS, postPath, withQuery } from './postLink'
import { linksEmergencyOn } from './xPolicy'

const clean = (v) => String(v == null ? '' : v).trim()

const SITE = clean(process.env.NEXT_PUBLIC_SITE_URL).replace(/\/$/, '')

export const threadsLinkMode = () => {
  const m = clean(process.env.THREADS_LINK_MODE).toLowerCase()
  return ['reply', 'inline', 'off'].includes(m) ? m : 'reply'
}

// WHERE EACH POST SENDS: lib/dash/postLink.js postPath() (funnel step 2,
// 2026-09-26). Until then every line here pointed at /start, whose buttons
// pointed at /called and back -- a loop. Board posts now open the board,
// results and recaps open the record, a player post opens the player. This
// map only says WHICH kinds carry a line and what the line says.

// The anchor posts, by kind. Everything not listed here posts clean.
const LINKED = new Map([
  // MLB
  ['pregame', { cta: "Tonight's board is public before first pitch." }],
  ['board', { cta: 'The board is on record. Every name, before the games.' }],
  ['receipt', { cta: 'Every call graded in public — the misses too.' }],   // THE NIGHT RECEIPT (accountability / recap / board_results retired into it, 10-09)
  ['weekly', { cta: 'The week, graded.' }],
  ['monthly', { cta: 'The month, graded.' }],
  ['callofnight', { cta: 'See what else the board had tonight.' }],
  ['community_pick', { cta: 'Your call goes on the board with ours.' }],
  ['thefour', { cta: 'Four markets, four names, every day.' }],
  // NFL
  ['nfl_board', { cta: 'The touchdown board is on record before kickoff.' }],
  ['nfl_results', { cta: 'Every touchdown call graded — the misses too.' }],
  // Longshots (2026-09-27): Threads links cost nothing; X stays clean.
  ['longshots', { cta: 'Every long price tonight, beside the model.' }],
  ['nfl_longshots', { cta: 'Every long price this week, beside the model.' }],
  ['nhl_longshots', { cta: 'Every long price tonight, beside the model.' }],
  ['nfl_spotlight', { cta: 'The full week, player by player.' }],
  ['nfl_bigweek', { cta: 'The week, graded.' }],
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
function linkLineFor(kind, source, ctx = {}) {
  if (!SITE) return ''
  const hit = LINKED.get(clean(kind))
  if (!hit) return ''
  // The query goes before an app link's #hash (withQuery) -- after it, it
  // would become part of the tab name and open NO SUCH TAB.
  const url = `${SITE}${withQuery(postPath(kind, ctx), `utm_source=${source}&utm_medium=social&utm_campaign=${encodeURIComponent(clean(kind))}`)}`
  return `${hit.cta}\n${url}`
}

/** `ctx.playerId` points a player post at that player; without it, his board. */
export function threadsLinkFor(kind, ctx = {}) {
  if (threadsLinkMode() === 'off') return ''
  return linkLineFor(kind, 'threads', ctx)
}

// NO LINKS ON X (Donovan, 2026-10-09). The funnel link that used to ride on the
// anchor posts is OFF in code, for every kind: this returns '' unless the
// emergency switch X_LINKS_EMERGENCY=on is set (lib/dash/xPolicy.js). The
// default is off and nothing else turns it on -- X_LINK_KINDS no longer does
// anything. (A link post is also priced at $0.200 against $0.015.) Threads keeps
// its own links (threadsLinkFor above).
export function xLinkFor(kind, ctx = {}) {
  if (!linksEmergencyOn()) return ''
  return linkLineFor(kind, 'x', ctx)
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
