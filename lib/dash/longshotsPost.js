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
import { feedHooks, hookList } from './discordChannels'
import { readLongshots } from '../odds/longshots'
import { HARD_LIMIT } from './postLimit'
import { admit, repeatCheck, logDroppedRepeat, logPosted } from './xGate'
import { recordPost } from './xPostLog'
import { namedInText, withNamed } from './xPolicy'
import { resolveNaming, nflNamingProblem, nhlNamingProblem } from './namingChecks'

export const MIN_ROWS = 3
const MAX_ROWS = 5
const HEAD = { mlb: 'HOME RUN', nfl: 'ANYTIME TD', nhl: 'ANYTIME GOAL' }
const DROP_NOTE = new Set(['lineup not confirmed', 'questionable'])

/** The rows a post may name, best model score first. Pure. */
export function postableLongshots(body, now = Date.now(), { exclude = null } = {}) {
  return (body?.rows || []).filter((r) => (!r.startsAt || Date.parse(r.startsAt) > now) && !DROP_NOTE.has(r.note) && !(exclude && exclude.has(String(r.id))))
}

/** The post, or '' when there is not enough to say. Pure. Fits X's 280
 *  (HARD_LIMIT) by naming fewer men, never by cutting a line in half. */
export function longshotsText(body, now = Date.now(), { exclude = null, rows = null } = {}) {
  const all = (rows || postableLongshots(body, now, { exclude })).slice(0, MAX_ROWS)
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
export const longshotsPayload = (body, now = Date.now(), { exclude = null, rows = null } = {}) => ({
  text: longshotsText(body, now, { exclude, rows }),
  date: body?.date || null,
  longAt: body?.longAt ?? null,
  rows: (rows || postableLongshots(body, now, { exclude })).slice(0, MAX_ROWS).map((r) => ({ id: r.id, name: r.name, team: r.team, median: r.median, best: r.best, score: r.score, status: r.status, takenAt: r.takenAt })),
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
  // a post given its own webhooks (members) with no usable URL must never fall
  // through to the public feed -- and must not claim the day's row
  if (webhooks !== null && !hookList(webhooks).length) return 'no-webhook'
  const k = `${day}|${kind}`
  if (Date.now() - (_notYet.get(k) || 0) < NOT_YET_MS) return 'not-enough-yet (waiting)'
  // a slot already seen taken today costs no request (lib/dash/postClaim.js)
  if (knownTaken(day, kind)) return 'already-posted'
  const { data: done } = await db.from('homer_feed_posts').select('day').match({ day, kind }).maybeSingle()
  if (done) { markTaken(day, kind); return 'already-posted' }
  let built = await build({ exclude: new Set() })
  // THE X RULES (2026-10-09, lib/dash/xGate): a members post never goes to X, so none of this
  // touches it. Everything else that goes to X is held / dropped / counted here, in the one place.
  const gated = toX && webhooks === null && hasX()
  let xOk = true
  if (gated && built?.pending?.length) {
    // a name is still unconfirmed: HOLD (nothing claimed, asked again in NOT_YET_MS), then DROP
    const a = await admit(db, { day, kind, pending: built.pending, startMs: built.startMs, sport, repeat: false })
    if (a.state === 'held') { _notYet.set(k, Date.now()); return `held: ${a.reason}` }
    if (a.state === 'dropped') {
      _notYet.delete(k)
      const { error } = await db.from('homer_feed_posts').upsert([{ day, kind, payload: { dropped: a.reason } }], { onConflict: 'day,kind', ignoreDuplicates: true })
      if (error) console.error(`[post] ${kind} drop not recorded: ${error.message}`)
      markTaken(day, kind)
      return `dropped: ${a.reason}`
    }
  }
  if (gated && built?.text) {
    // the same man in the same kind not within 3 days (NFL 7): ask the builder for a post without him
    let repeats = await repeatCheck(db, { day, kind, ids: namedInText(built.payload, built.text) })
    if (repeats.length) {
      const again = await build({ exclude: new Set(repeats) })
      built = again?.text ? again : { text: '' }
      repeats = built.text ? await repeatCheck(db, { day, kind, ids: namedInText(built.payload, built.text) }) : []
      if (repeats.length) { logDroppedRepeat({ day, kind, sport }, `${repeats.slice(0, 4).join(', ')} named too recently`); xOk = false }
    }
  }
  if (!built?.text) { _notYet.set(k, Date.now()); return 'not-enough-yet' }
  _notYet.delete(k)
  // the pause and the daily cap, by tier (a post over the cap still goes to Discord, as every kind always has)
  if (gated && xOk) xOk = (await admit(db, { day, kind, ids: namedInText(built.payload, built.text), sport, repeat: false })).state === 'go'
  const { data: claimed, error } = await db.from('homer_feed_posts')
    .upsert([{ day, kind, payload: {} }], { onConflict: 'day,kind', ignoreDuplicates: true }).select('day')
  if (error) { console.error(`[post] ${kind} claim failed: ${error.message}`); return 'claim-failed' }
  markTaken(day, kind)
  if (!claimed?.length) return 'already-posted'
  const ids = namedInText(built.payload, built.text)
  const patch = { payload: ids.length ? withNamed(built.payload || {}, ids) : (built.payload || {}) }
  const d = await postToDiscord(built.text, { kind, sportKey: sport }, webhooks !== null ? webhooks : feedHooks(sport))
  if (d.ok) patch.discord_sent = true
  if (toX && hasX() && xOk) {
    const r = await postToX(built.text, { kind })
    if (r.ok && r.id) { patch.x_post_id = r.id; if (gated) logPosted({ day, kind, ids, tweetId: r.id, text: built.text }) }
    else console.error(`[post] ${kind} refused: ${r.status} ${r.error}`)
  }
  const { error: saveErr } = await db.from('homer_feed_posts').update(patch).match({ day, kind })
  if (saveErr) console.error(`[post] ${kind} posted but the row did not record it: ${saveErr.message}`)   // the "ignores save errors" item (2026-10-09)
  return 'posted'
}

// BEFORE HE IS NAMED (2026-10-09): NFL not OUT/inactive, NHL the opposing starting goalie
// confirmed (MLB's lineup check is already DROP_NOTE above). Definite no = left out; pending
// = HELD until 30 minutes before the game, then left out (resolveNaming, trim).
const namingFor = { mlb: () => null, nfl: (r) => nflNamingProblem({ player_id: r.id, injury_status: r.injury, on_bye: false }), nhl: (r) => nhlNamingProblem(r) }

/** The longshots build: { text, payload } | { pending, startMs } (held) | null. */
export async function longshotsBuild(body, { sport, exclude = new Set(), now = Date.now() } = {}) {
  if (!body?.sport) return null
  const check = namingFor[sport] || (() => null)
  const nr = resolveNaming({
    rows: postableLongshots(body, now, { exclude }).map((r) => ({ ...r, player_id: r.id })),
    check: (r) => check(r),
    pickFrom: (rs) => rs.slice(0, MAX_ROWS),
    startOf: (r) => Date.parse(r?.startsAt),
    trim: true, now,
  })
  if (nr.state === 'held') {
    const starts = postableLongshots(body, now).map((r) => Date.parse(r.startsAt)).filter(Number.isFinite)
    return { text: '', payload: {}, pending: nr.pending, startMs: starts.length ? Math.min(...starts) : NaN }
  }
  if (nr.trimmed?.length) recordPost({ day: body.date || '', kind: `${sport}_longshots`, sport, state: 'DROPPED', reason: `left out, ${nr.reason || 'not confirmed'} 30 min before the game: ${nr.trimmed.join(', ')}`, ids: nr.trimmed })
  const rows = nr.picks
  const text = longshotsText(body, now, { rows })
  return text ? { text, payload: longshotsPayload(body, now, { rows }) } : null
}

/** @returns {Promise<string>} what happened, for the tick's own log. */
export async function postLongshotsOnce(db, { sport, day, kind }) {
  return postOnce(db, {
    day, kind, sport,
    build: async ({ exclude } = {}) => longshotsBuild(await readLongshots(db, { sport, date: day }), { sport, exclude }),
  })
}
