// 🎯 THE LONGSHOTS POST (2026-09-27, Donovan: "do the post too. for all
// sports"). One a day per sport, off exactly what the Longshots page shows
// (lib/odds/longshots.js readLongshots): the top model scores among players
// the books price long, each with his price. Text only, no card.
//
// WHO MAY BE NAMED. The house rule since 09-26 ("strict, posts wait"): a post
// names only men who are playing. So a row is dropped when
//   - his game has started (a price we hold is for a game still to come),
//   - MLB: his lineup isn't confirmed ('lineup not confirmed' note),
//   - NFL: he's questionable (the inactives aren't posted at this hour).
// Fewer than MIN_ROWS left = no post; the slot stays open for a later tick.
//
// Words: "prices, not picks" -- the post never says or implies a bet.
import { knownTaken, markTaken } from './postClaim'
import { hasX, postToDiscord, postToX } from './xPost'
import { feedHooks } from './discordChannels'
import { readLongshots } from '../odds/longshots'
import { HARD_LIMIT } from './postLimit'

export const MIN_ROWS = 3
const MAX_ROWS = 5
const HEAD = { mlb: 'HOME RUN', nfl: 'ANYTIME TD', nhl: 'ANYTIME GOAL' }
const DROP_NOTE = new Set(['lineup not confirmed', 'questionable'])

/** The rows a post may name, best model score first. Pure. */
export function postableLongshots(body, now = Date.now()) {
  return (body?.rows || []).filter((r) => (!r.startsAt || Date.parse(r.startsAt) > now) && !DROP_NOTE.has(r.note))
}

/** The post, or '' when there is not enough to say. Pure. Fits X's 280
 *  (HARD_LIMIT) by naming fewer men, never by cutting a line in half. */
export function longshotsText(body, now = Date.now()) {
  const all = postableLongshots(body, now).slice(0, MAX_ROWS)
  if (all.length < MIN_ROWS || !body?.sport) return ''
  const plus = (v) => (v > 0 ? `+${v}` : String(v))
  const build = (rows) => [
    `\u{1F3AF} LONGSHOTS \u00b7 ${HEAD[body.sport] || String(body.market || '').toUpperCase()}`,
    `${plus(body.longAt)} or longer, by our model score:`,
    '',
    ...rows.map((r) => `${r.name} (${r.team}) ${plus(r.median)} \u00b7 ${Math.round(r.score)}${r.status === 'called' ? ' \u00b7 CALLED' : ''}`),
    '',
    'Prices, not picks. Full list on the site.',
  ].join('\n')
  // X counts an emoji as two; [...] counts it as one, so leave headroom.
  for (let n = all.length; n >= MIN_ROWS; n -= 1) {
    const t = build(all.slice(0, n))
    if ([...t].length + 4 <= HARD_LIMIT) return t
  }
  return ''
}

/** What the claim row keeps: who was named, at what price, when. */
export const longshotsPayload = (body, now = Date.now()) => ({
  text: longshotsText(body, now),
  date: body?.date || null,
  longAt: body?.longAt ?? null,
  rows: postableLongshots(body, now).slice(0, MAX_ROWS).map((r) => ({ id: r.id, name: r.name, team: r.team, median: r.median, best: r.best, score: r.score, status: r.status, takenAt: r.takenAt })),
})

// ── POSTING, ONCE A DAY PER SPORT ────────────────────────────────────────
// Shared by the three ticks (homers: MLB, nfl: NFL, lamp: NHL), so each is
// one call. Same claim table and rules as every other post: one row per
// (day, kind) in homer_feed_posts, claimed only when there is text to post;
// POST_KINDS_ON (Vercel env) still switches it, like the MLB kinds.

// Exported for the LAMP goal tick's per-goal CALLED IT post (kind 'nhlgoal').
export const kindOn = (kind) => {
  const env = String(process.env.POST_KINDS_ON || '').trim()
  if (!env || env.toLowerCase() === 'all') return true
  return env.split(',').map((k) => k.trim()).includes(kind)
}

/**
 * One post a day per kind, shared by every once-a-day post outside the MLB
 * tick's own claimAndPostStat (longshots, the 2+ Club). `build()` is only
 * called when the slot is still open, and returns { text, payload } or null.
 * @returns {Promise<string>} what happened, for the tick's own log.
 */
// COST CUT (2026-09-27): a build that came back short is not retried for
// NOT_YET_MS on this warm instance. The builds read a whole day of odds_snap
// (~0.5 MB) or a season of multi_games, and the per-minute ticks asked every
// minute until there was enough -- for posts that wait on lineups or on
// Monday night going final, where ten minutes changes nothing.
const NOT_YET_MS = 10 * 60 * 1000
const _notYet = new Map()   // `${day}|${kind}` -> ms of the last short build

// `webhooks` / `toX` (2026-10-02, Members M3): a members-only post goes to the
// private #members webhook and never to X. Left out, a post goes where every
// post always has: the public feed webhooks, and X when it is configured.
export async function postOnce(db, { day, kind, build, webhooks = null, toX = true, sport = 'mlb' }) {
  if (!kindOn(kind)) return 'off'
  const k = `${day}|${kind}`
  if (Date.now() - (_notYet.get(k) || 0) < NOT_YET_MS) return 'not-enough-yet (waiting)'
  // a slot already seen taken today costs no request (lib/dash/postClaim.js)
  if (knownTaken(day, kind)) return 'already-posted'
  const { data: done } = await db.from('homer_feed_posts').select('day').match({ day, kind }).maybeSingle()
  if (done) { markTaken(day, kind); return 'already-posted' }
  const built = await build()
  if (!built?.text) { _notYet.set(k, Date.now()); return 'not-enough-yet' }
  _notYet.delete(k)
  const { data: claimed, error } = await db.from('homer_feed_posts')
    .upsert([{ day, kind, payload: {} }], { onConflict: 'day,kind', ignoreDuplicates: true }).select('day')
  if (error) { console.error(`[post] ${kind} claim failed: ${error.message}`); return 'claim-failed' }
  markTaken(day, kind)
  if (!claimed?.length) return 'already-posted'
  const patch = { payload: built.payload || {} }
  const d = await postToDiscord(built.text, {}, webhooks || feedHooks(sport))
  if (d.ok) patch.discord_sent = true
  if (toX && hasX()) {
    const r = await postToX(built.text, { kind })
    if (r.ok && r.id) patch.x_post_id = r.id
    else console.error(`[post] ${kind} refused: ${r.status} ${r.error}`)
  }
  await db.from('homer_feed_posts').update(patch).match({ day, kind })
  return 'posted'
}

/** @returns {Promise<string>} what happened, for the tick's own log. */
export async function postLongshotsOnce(db, { sport, day, kind }) {
  return postOnce(db, {
    day, kind, sport,
    build: async () => {
      const body = await readLongshots(db, { sport, date: day })
      const text = longshotsText(body)
      return text ? { text, payload: longshotsPayload(body) } : null
    },
  })
}
