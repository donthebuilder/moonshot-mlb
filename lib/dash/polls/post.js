// POSTING THE POLLS (X overhaul stage 3 piece 2, 2026-10-09). Server only.
//
// One native poll per ACTIVE sport per day, a different question each time, board and fun
// alternating; and, after the games, the REVEAL post for a "guess the stat" poll. Everything goes
// through the same seams as every scheduled post: the claim row in homer_feed_posts (the poll's
// kind carries the sport), the X gate (cap tier 'poll', stops at 14; the repeat guard; the
// pre-naming holds), the posting log, postToX's native poll, and a plain-text Discord mirror.
//
// ON in code. No approval step. The only switch is the emergency one: X_POLLS_PAUSE=on.
import { postOnce } from '../longshotsPost'
import { knownTaken, markTaken, claimSlot } from '../postClaim'
import { hasX, postToDiscord, postToX } from '../xPost'
import { feedHooks } from '../discordChannels'
import { admit, logPosted, recentNamed } from '../xGate'
import { withNamed } from '../xPolicy'
import { easternToday, etHour, shiftDay } from '../../data'
import { BUILDERS, buildReveal, formatOrder, rotationState } from './build'
import { POLL_DURATION_MIN, kindFor, pollKindsOf, resultKindFor } from './kinds'
import { pollSlots } from './slots'

// the same switch as lib/nba/gate.js bucketsPublic (not imported: that module pulls in the request-bound supabase client)
const bucketsPublic = () => String(process.env.BUCKETS_PUBLIC || '').toLowerCase() === 'on'

export const pollsPaused = () => /^(on|1|true)$/i.test(String(process.env.X_POLLS_PAUSE || '').trim())

// COST: a sport with nothing to post (no game left, names not confirmed, thin data) is not re-read for
// a while on this warm instance. The board and game-log reads are the expensive part of a poll tick.
const BACKOFF_MS = { inactive: 30 * 60e3, thin: 15 * 60e3 }
const _idle = new Map()   // `${day}|${sport}` -> { until }
export const _resetPollBackoff = () => _idle.clear()

const HISTORY_DAYS = 8
const REAL_ID = /^\d+$/

/** This sport's poll rows of the last week (for the rotation): [{ day, kind, payload, x_post_id }]. */
export async function readHistory(db, sport, day) {
  const { data, error } = await db.from('homer_feed_posts').select('day, kind, payload, x_post_id')
    .in('kind', pollKindsOf(sport)).gte('day', shiftDay(day, -HISTORY_DAYS)).lte('day', day)
  if (error) { console.error(`[polls] history read failed (${sport}): ${error.message}`); return null }
  return data || []
}

/**
 * Choose today's poll for a sport from real data, lazily (only the data a format needs is read).
 * -> { spec } | { none: reason, pending?, startMs? }
 */
export async function choosePollFor(db, { sport, day, adapter, history }) {
  const slate = await adapter.slate()
  if (!slate.active) return { none: slate.why || 'inactive', inactive: true }
  const { usedKeys, last, lastFun } = rotationState({ sport, day, history })
  const excl = new Map()
  const excludeFor = async (format) => {
    if (!excl.has(format)) excl.set(format, await recentNamed(db, { kind: kindFor(sport, format), day }).catch(() => new Set()))
    return excl.get(format)
  }
  for (const format of formatOrder(last, lastFun)) {
    const data = { players: slate.players }
    if (format === 'over') data.bars = await adapter.bars().catch(() => [])
    if (format === 'streak') data.streaks = await adapter.streaks().catch(() => [])
    if (format === 'board') data.called = await adapter.called().catch(() => [])
    const spec = BUILDERS[format]({ sport, day, usedKeys, exclude: await excludeFor(format), ...data })
    if (spec) return { spec, rebuild: async (extra) => BUILDERS[format]({ sport, day, usedKeys, exclude: new Set([...(await excludeFor(format)), ...extra]), ...data }) }
  }
  const startMs = Math.min(...slate.pending.map((p) => p.startMs).filter(Number.isFinite))
  return { none: slate.pending.length ? 'names not confirmed yet' : 'not enough real data', pending: slate.pending, startMs: Number.isFinite(startMs) ? startMs : NaN }
}

/**
 * The tick's one call per sport: post today's poll if it is due and can be built.
 * @returns {Promise<string>} what happened, for the tick's own log.
 */
export async function postPollOnce(db, { sport, day = easternToday(), adapter, now = Date.now() }) {
  if (pollsPaused()) return 'paused (X_POLLS_PAUSE)'
  const slot = pollSlots(sport, day)[0]
  if (!slot || now < slot.startMs) return 'not-yet'
  const done = `${sport}:poll`
  if (knownTaken(day, done)) return 'already-posted'
  if ((_idle.get(`${day}|${sport}`)?.until || 0) > now) return 'idle (backing off)'
  const history = await readHistory(db, sport, day)
  if (!history) return 'history-unavailable'
  if (history.some((r) => r.day === day)) { markTaken(day, done); return 'already-posted' }
  const picked = await choosePollFor(db, { sport, day, adapter, history })
  if (!picked.spec) {
    if (picked.pending?.length) {
      // names still unconfirmed: HELD tick after tick, DROPPED 30 minutes before the first game
      const a = await admit(db, { day, kind: kindFor(sport, 'pick'), sport, pending: picked.pending, startMs: picked.startMs, now, repeat: false })
      if (a.state === 'dropped') { markTaken(day, done); return `dropped: ${a.reason}` }
      if (a.state === 'held') { _idle.set(`${day}|${sport}`, { until: now + BACKOFF_MS.thin }); return `held: ${a.reason}` }
    }
    _idle.set(`${day}|${sport}`, { until: now + (picked.inactive ? BACKOFF_MS.inactive : BACKOFF_MS.thin) })
    return `no-poll: ${picked.none}`
  }
  const { spec } = picked
  const out = await postOnce(db, {
    day, kind: spec.kind, sport, envGate: false,
    build: async ({ exclude }) => {
      const s = exclude && exclude.size ? await picked.rebuild(exclude) : spec
      return s ? { text: s.text, discordText: s.discordText, skipDiscord: sport === 'nba' && !bucketsPublic(), poll: { options: s.options, durationMinutes: POLL_DURATION_MIN }, payload: s.payload } : { text: '' }
    },
  })
  if (out === 'posted' || out === 'already-posted') markTaken(day, done)
  return out
}

// ── THE REVEAL: INFO, quotes the poll, only a real stored outcome ───────────────────────────────
/**
 * For a sport: any guess poll from the last three days whose games are over and whose outcome is on
 * file gets one reveal post, claimed under the poll's own day as kind <sport>poll_result. An unknown
 * result posts nothing (and is asked again next tick). Needs the poll to be a real X post to quote.
 */
export async function postRevealsOnce(db, { sport, today = easternToday(), adapter, now = Date.now() }) {
  if (pollsPaused()) return 'paused (X_POLLS_PAUSE)'
  if (etHour(now) < 8) return 'too-early'                              // the morning after: the games are over
  const kind = resultKindFor(sport)
  const { data: polls, error } = await db.from('homer_feed_posts').select('day, payload, x_post_id')
    .eq('kind', kindFor(sport, 'guess')).gte('day', shiftDay(today, -3)).lt('day', today)
  if (error) { console.error(`[polls] reveal read failed (${sport}): ${error.message}`); return 'read-failed' }
  const out = []
  for (const poll of polls || []) {
    const guess = poll.payload?.guess
    if (!guess || !REAL_ID.test(String(poll.x_post_id || ''))) continue     // no poll tweet: nothing to quote
    if (knownTaken(poll.day, kind)) continue
    const { data: have } = await db.from('homer_feed_posts').select('day').match({ day: poll.day, kind }).maybeSingle()
    if (have) { markTaken(poll.day, kind); continue }
    const result = await adapter.results(guess).catch(() => null)
    const reveal = buildReveal({ sport, guess, result })
    if (!reveal) { out.push(`${poll.day}: result not on file`); continue }   // unknown = post nothing
    const gate = await admit(db, { day: today, kind, sport, ids: reveal.named, repeat: false })
    if (gate.state !== 'go') { out.push(`${poll.day}: ${gate.state}`); continue }
    if (!(await claimSlot(db, poll.day, kind, { tag: 'polls' }))) { out.push(`${poll.day}: claim lost`); continue }
    const patch = { payload: withNamed({ poll_day: poll.day, metric: guess.metric, ranking: result.ranking }, reveal.named) }
    const d = await postToDiscord(reveal.text, { kind, sportKey: sport }, feedHooks(sport))
    if (d.ok) patch.discord_sent = true
    if (hasX()) {
      const r = await postToX(reveal.text, { kind, quoteId: poll.x_post_id })
      if (r.ok && r.id) { patch.x_post_id = r.id; logPosted({ day: poll.day, kind, ids: reveal.named, tweetId: r.id, text: reveal.text }) }
      else console.error(`[polls] ${kind} refused: ${r.status} ${r.error}`)
    }
    const { error: saveErr } = await db.from('homer_feed_posts').update(patch).match({ day: poll.day, kind })
    if (saveErr) console.error(`[polls] ${kind} posted but the row did not record it: ${saveErr.message}`)
    out.push(`${poll.day}: posted`)
  }
  return out.length ? out.join('; ') : 'nothing-to-reveal'
}
