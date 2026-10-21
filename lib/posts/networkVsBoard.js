// THE NETWORK vs THE BOARD (Sunday's series, claude/CALLED-IT-PLAYBOOK-2026-10-20.txt: "how the network's votes did against our board that week.
// The network becomes part of the record."). Donovan, 2026-10-21: "the next work vs board", "keep working".
//
// THE WEEK   the polls of the seven days Sunday..Saturday before the Sunday it posts (lib/dash/polls: one a sport a day; kinds <sport>poll_<format>).
// GRADED     only what can be answered from STORED events, the same rows the reveals and the first-scorer ledger read:
//              pick   "Who scores first: A or B?" (A, B, Neither)      -> the first of them to score; Neither when neither did
//              board  "Which CALLED player cashes first?"              -> the first of them to score; nobody = not graded
//              guess  "Which of these 3 scores the most?"              -> the reveal's own ranking (ties: each tied man is right)
//            "first" = the game's own order when the two are in the same game (MLB the half-inning, NFL ESPN's td_n, NHL period + clock), else the
//            time each event was first seen, and only when they are FIRST_GAP_S apart (closer = "too close to call": not graded). Over / under and
//            streak polls, and BUCKETS (no stored results), are not graded.
// THE NETWORK'S PICK  the option with the most votes on X (one read for the whole week: GET /2/tweets with the polls expanded). A tie at the top or
//            no votes = the network made no pick on it (not graded).
// THE BOARD'S PICK    the option our board had higher: every poll stores its men best first (lib/dash/polls/build.js; `players` are board order).
// WHEN       Sunday from NVB_FROM_PHX (Phoenix), once (homer_feed_posts kind network_vs_board). Fewer than MIN_GRADED graded polls = no post.
// WHERE      X and the free feed channel, with the scoreboard card. Undo: NETWORK_VS_BOARD_OFF=on.
import { BRAND } from '../routes'
import { HARD_LIMIT, postLimit, TAIL_MARGIN } from '../dash/postLimit'
import { xLen } from './slate'
import { kindFor } from '../dash/polls/kinds'
import { admit, logPosted } from '../dash/xGate'
import { recordPost } from '../dash/xPostLog'
import { hasX, getFromX, postToDiscord, postToX, uploadImageToX } from '../dash/xPost'
import { knownTaken, markTaken, unmarkTaken } from '../dash/postClaim'
import { mayRetryPost } from '../dash/xFail'

export const NVB_KIND = 'network_vs_board'
export const NVB_FROM_PHX = 17 * 60          // 5 PM Phoenix Sunday (8 PM ET): after the 1 PM and 4 PM NFL windows, before Sunday night
export const MIN_GRADED = 3
export const FIRST_GAP_S = 180
export const GRADED_SPORTS = Object.freeze(['mlb', 'nfl', 'nhl'])
export const GRADED_FORMATS = Object.freeze(['pick', 'board', 'guess'])
export const nvbOff = () => /^(on|1|true)$/i.test(String(process.env.NETWORK_VS_BOARD_OFF || '').trim())
export const nvbDue = (clock) => Boolean(clock && clock.dow === 0 && clock.min >= NVB_FROM_PHX)

const shiftDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)
/** The week a Sunday grades: the seven poll days before it (Sunday..Saturday). Pure. */
export const nvbWeek = (sunday) => ({ from: shiftDay(sunday, -7), to: shiftDay(sunday, -1) })
const num = (v) => (v == null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v))

// ── THE VOTES ────────────────────────────────────────────────────────────────────────────────────────────────────────────
/** X's GET /2/tweets answer -> Map(tweetId -> { status, options: [{ label, votes }] }). Pure. */
export function votesFrom(json) {
  const polls = new Map((json?.includes?.polls || []).map((p) => [String(p.id), p]))
  const out = new Map()
  for (const t of json?.data || []) {
    const p = polls.get(String(t?.attachments?.poll_ids?.[0] || ''))
    if (!p) continue
    out.set(String(t.id), { status: p.voting_status || null, options: (p.options || []).slice().sort((a, b) => (a.position || 0) - (b.position || 0)).map((o) => ({ label: String(o.label), votes: Number(o.votes) || 0 })) })
  }
  return out
}
/** The network's pick: the one option with the most votes; null when nobody voted or the top is tied. Pure. */
export function networkPick(options) {
  const list = (options || []).filter((o) => o && o.label)
  const total = list.reduce((s, o) => s + (o.votes || 0), 0)
  if (!total) return null
  const top = Math.max(...list.map((o) => o.votes || 0))
  const at = list.filter((o) => (o.votes || 0) === top)
  return at.length === 1 ? { label: at[0].label, votes: top, total, share: top / total } : null
}

// ── THE ANSWER ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const inningKey = (s) => { const m = /^(top|bot)\s+(\d+)/i.exec(String(s || '').trim()); return m ? Number(m[2]) * 2 + (m[1].toLowerCase() === 'bot' ? 1 : 0) : null }
const clockSecs = (t) => { const m = /^(\d+):(\d{2})$/.exec(String(t || '').trim()); return m ? Number(m[1]) * 60 + Number(m[2]) : null }
/**
 * One stored event as the grader reads it: { id, game, order, seen } where `order` sorts inside a game (null = unknown) and `seen` is ms.
 * Rows by sport: MLB homer_feed (player_id, game_pk, inning, seen_at), NFL nfl_td_feed (gsis_id, game_id, td_n, seen_at, yards),
 * NHL lamp_goal_feed (player_id, game_id, period, time_in_period, first_seen_at). Pure.
 */
export function eventOf(sport, r) {
  if (sport === 'mlb') { const k = inningKey(r.inning); return { id: String(r.player_id), game: String(r.game_pk ?? ''), order: k, seen: Date.parse(r.seen_at) } }
  if (sport === 'nfl') return { id: String(r.gsis_id ?? ''), game: String(r.game_id ?? ''), order: num(r.td_n), seen: Date.parse(r.seen_at), yards: num(r.yards) }
  const p = num(r.period), c = clockSecs(r.time_in_period)
  return { id: String(r.player_id), game: String(r.game_id ?? ''), order: p != null && c != null ? p * 10000 + c : null, seen: Date.parse(r.first_seen_at) }
}

/** Who scored first among `ids`: the id, or null when nobody did, or 'close' when it cannot be told honestly. `events` = eventOf() rows. Pure. */
export function firstOf(ids, events) {
  const want = new Set((ids || []).map(String))
  const firsts = new Map()
  for (const e of events || []) {
    if (!want.has(e.id)) continue
    const cur = firsts.get(e.id)
    const earlier = !cur || (e.game === cur.game && e.order != null && cur.order != null ? e.order < cur.order : (Number.isFinite(e.seen) && e.seen < cur.seen))
    if (earlier) firsts.set(e.id, e)
  }
  const list = [...firsts.values()]
  if (!list.length) return null
  if (list.length === 1) return list[0].id
  const cmp = (a, b) => {
    if (a.game && a.game === b.game && a.order != null && b.order != null && a.order !== b.order) return a.order - b.order
    if (!Number.isFinite(a.seen) || !Number.isFinite(b.seen) || Math.abs(a.seen - b.seen) < FIRST_GAP_S * 1000) return 0   // too close to call
    return a.seen - b.seen
  }
  list.sort((a, b) => cmp(a, b) || 0)
  return cmp(list[0], list[1]) === 0 ? 'close' : list[0].id
}

/** The guess poll's answer: the ids that led its metric (counts; NFL the longest touchdown). [] = nobody did it. Pure. */
export function guessLeaders(metric, ids, events) {
  const want = new Set((ids || []).map(String))
  const v = new Map()
  for (const e of events || []) {
    if (!want.has(e.id)) continue
    if (metric === 'td_longest') { if (e.yards != null && e.yards > 0) v.set(e.id, Math.max(v.get(e.id) || 0, e.yards)) } else v.set(e.id, (v.get(e.id) || 0) + 1)
  }
  if (!v.size) return []
  const top = Math.max(...v.values())
  return [...v].filter(([, x]) => x === top).map(([id]) => id)
}

/**
 * ONE POLL GRADED. `poll` = { sport, day, format, payload, x_post_id }, `votes` = { options } (votesFrom), `events` = that sport and day's eventOf() rows.
 * { sport, day, format, question, options, network, board, answer, networkRight, boardRight } or { skip: why }. Pure.
 */
export function gradePoll(poll, votes, events) {
  const { sport, format, payload: pl = {} } = poll || {}
  if (!GRADED_SPORTS.includes(sport) || !GRADED_FORMATS.includes(format)) return { skip: 'format not graded' }
  const men = format === 'guess' ? pl.guess?.players : pl.players
  if (!Array.isArray(men) || men.length < 2) return { skip: 'no players stored' }
  const nameOf = new Map(men.map((m) => [String(m.id), String(m.name)]))
  const net = networkPick(votes?.options)
  if (!net) return { skip: 'no network pick (no votes, or a tie at the top)' }
  const board = String(men[0].name)
  let answers
  if (format === 'guess') {
    const lead = guessLeaders(pl.guess?.metric, men.map((m) => m.id), events)
    if (!lead.length) return { skip: 'nobody did it' }
    answers = lead.map((id) => nameOf.get(id))
  } else {
    const first = firstOf(men.map((m) => m.id), events)
    if (first === 'close') return { skip: 'too close to call' }
    if (first == null) { if (format === 'pick') answers = ['Neither']; else return { skip: 'nobody cashed' } } else answers = [nameOf.get(first)]
  }
  const right = (label) => answers.some((a) => a === label)
  return {
    sport, day: poll.day, format, options: (votes.options || []).map((o) => o.label), network: net.label, networkShare: net.share, board, answer: answers.join(' / '),
    networkRight: right(net.label), boardRight: right(board), names: men.map((m) => String(m.name)),
  }
}

/** The week's tally. Pure. */
export function tally(graded) {
  const g = (graded || []).filter((x) => x && !x.skip)
  return { n: g.length, network: g.filter((x) => x.networkRight).length, board: g.filter((x) => x.boardRight).length, graded: g }
}

// ── THE POST ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const MON3 = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
export const weekWords = (from) => `WEEK OF ${MON3[Number(String(from).slice(5, 7)) - 1]} ${Number(String(from).slice(8, 10))}`
const QUESTION = { pick: 'first to score', board: 'first CALLED man to cash', guess: 'most of three' }
/** One graded poll as a line: "🏒 Matthews or Marner, first to score: you said Matthews ✅, we said Marner ❌". Pure. */
export function pollLine(x) {
  const last = (n) => (n === 'Neither' ? 'Neither' : String(n).split(/\s+/).slice(-1)[0])
  const names = (x.names || []).map(last)
  const who = names.length === 2 ? `${names[0]} or ${names[1]}` : names.join(', ')
  return `${BRAND[x.sport]?.icon || ''} ${who}, ${QUESTION[x.format]}: you said ${last(x.network)} ${x.networkRight ? '✅' : '❌'}, we said ${last(x.board)} ${x.boardRight ? '✅' : '❌'}`
}
/**
 * The Sunday post: head, hook, the scoreboard, the polls (as many as fit), the ask. '' under MIN_GRADED graded polls. Pure.
 */
export function nvbText({ week, t, limit = HARD_LIMIT }) {
  if (!t || t.n < MIN_GRADED) return ''
  const head = `\u{1F5F3}\u{FE0F} THE NETWORK vs THE BOARD · ${weekWords(week.from)}`
  const hook = "We asked. You voted. Here's how it went \u{1F447}"
  const score = [`THE NETWORK  ${t.network} of ${t.n}`, `THE BOARD  ${t.board} of ${t.n}`]
  const ask = t.network > t.board ? "The network's up. Can the board catch you next week?" : t.board > t.network ? "The board's up this week. Who's taking it back, network?" : 'Dead even. Who breaks the tie next week?'
  const lines = t.graded.map(pollLine)
  for (let k = lines.length; k >= 0; k -= 1) for (const withHook of [true, false]) {
    const more = lines.length - k
    const blocks = [[head], ...(withHook ? [[hook]] : []), score, ...(k ? [lines.slice(0, k).concat(more ? [`+${more} more`] : [])] : []), [ask]]
    const text = blocks.map((b) => b.join('\n')).join('\n\n')
    if (xLen(text) <= limit) return text
  }
  return ''
}

// ── THE READS ────────────────────────────────────────────────────────────────────────────────────────────────────────────
const FEED = {
  mlb: { table: 'homer_feed', cols: 'player_id, game_pk, inning, seen_at', idCol: 'player_id', cast: String },
  nfl: { table: 'nfl_td_feed', cols: 'gsis_id, game_id, td_n, seen_at, yards', idCol: 'gsis_id', cast: String },
  nhl: { table: 'lamp_goal_feed', cols: 'player_id, game_id, period, time_in_period, first_seen_at', idCol: 'player_id', cast: Number, confirmed: true },
}
/** The stored events of one sport and day for `ids`, as eventOf() rows; null when the read failed. */
export async function readEvents(db, sport, day, ids) {
  const f = FEED[sport]
  if (!f || !ids.length) return []
  let q = db.from(f.table).select(f.cols).eq('day', day).in(f.idCol, ids.map(f.cast))
  if (f.confirmed) q = q.not('confirmed_at', 'is', null).is('overturned_at', null)
  const { data, error } = await q
  if (error) { console.error(`[nvb] ${f.table} ${day}: ${error.message}`); return null }
  return (data || []).map((r) => eventOf(sport, r))
}
/** The week's graded polls: { graded, skipped } (polls whose events could not be read are skipped, never guessed). */
export async function gradeWeek(db, { week, read = getFromX }) {
  const kinds = GRADED_SPORTS.flatMap((s) => GRADED_FORMATS.map((f) => ({ kind: kindFor(s, f), sport: s, format: f })))
  const byKind = new Map(kinds.map((k) => [k.kind, k]))
  const { data, error } = await db.from('homer_feed_posts').select('day, kind, payload, x_post_id').in('kind', kinds.map((k) => k.kind)).gte('day', week.from).lte('day', week.to)
  if (error) throw new Error(`polls read: ${error.message}`)
  const polls = (data || []).filter((p) => /^\d+$/.test(String(p.x_post_id || ''))).map((p) => ({ ...p, ...byKind.get(p.kind) }))
  if (!polls.length) return { graded: [], skipped: [] }
  // ONE X read for the week (up to 100 ids)
  const r = await read('/2/tweets', { ids: polls.slice(0, 100).map((p) => p.x_post_id).join(','), expansions: 'attachments.poll_ids', 'poll.fields': 'options,voting_status' })
  if (!r?.ok) throw new Error(`X read: ${r?.status} ${r?.error}`)
  const votes = votesFrom(r.json)
  const graded = [], skipped = []
  for (const p of polls) {
    const v = votes.get(String(p.x_post_id))
    if (!v || v.status !== 'closed') { skipped.push({ day: p.day, kind: p.kind, why: 'poll not closed / not found' }); continue }
    const men = (p.format === 'guess' ? p.payload?.guess?.players : p.payload?.players) || []
    const day = p.format === 'guess' ? (p.payload?.guess?.day || p.day) : p.day
    const ev = await readEvents(db, p.sport, day, men.map((m) => String(m.id)))
    if (ev == null) { skipped.push({ day: p.day, kind: p.kind, why: 'events unreadable' }); continue }
    const g = gradePoll(p, v, ev)
    if (g.skip) skipped.push({ day: p.day, kind: p.kind, why: g.skip }); else graded.push(g)
  }
  graded.sort((a, b) => a.day.localeCompare(b.day))
  return { graded, skipped }
}

// ── THE POSTER ───────────────────────────────────────────────────────────────────────────────────────────────────────────
const withTimeout = (p, ms) => { let t; return Promise.race([p, new Promise((res) => { t = setTimeout(() => res(null), ms) })]).finally(() => clearTimeout(t)) }
const _wait = new Map()
const RETRY_MS = 15 * 60e3
export const _resetNvbForTests = () => _wait.clear()

/** One try at a Sunday's post. `read` = getFromX (injectable), `draw` = the card renderer (lazy). @returns {Promise<string>} */
export async function postNvbOnce(db, { day, clock, hooks = '', now = Date.now(), read = getFromX, draw = null } = {}) {
  if (nvbOff()) return 'off'
  if (!nvbDue(clock)) return 'not-due'
  if (knownTaken(day, NVB_KIND)) return 'already-posted'
  if (now - (_wait.get(day) || 0) < RETRY_MS) return 'waiting'
  const done = await db.from('homer_feed_posts').select('day').match({ day, kind: NVB_KIND }).maybeSingle()
  if (done?.data) { markTaken(day, NVB_KIND); return 'already-posted' }
  const week = nvbWeek(day)
  let res
  try { res = await gradeWeek(db, { week, read }) } catch (e) { _wait.set(day, now); return `read-failed: ${e?.message || e}` }
  const t = tally(res.graded)
  const text = nvbText({ week, t, limit: postLimit() + TAIL_MARGIN })
  if (!text) { _wait.set(day, now); recordPost({ day, kind: NVB_KIND, sport: 'mlb', state: 'DROPPED', reason: `${t.n} graded polls (${MIN_GRADED} at least)` }); return `none: ${t.n} graded` }
  let png = null
  try { png = await withTimeout((async () => (draw || (await import('../cards/networkCard')).renderNetworkCard)({ week, t }))(), 20000) } catch (e) { console.error(`[nvb] picture failed: ${e?.message || e}`) }
  const claim = await db.from('homer_feed_posts').upsert([{ day, kind: NVB_KIND, payload: {} }], { onConflict: 'day,kind', ignoreDuplicates: true }).select('day')
  if (claim.error) { _wait.set(day, now); console.error(`[nvb] claim failed: ${claim.error.message}`); return 'claim-failed' }
  markTaken(day, NVB_KIND)
  if (!claim.data?.length) return 'already-posted'
  const patch = { payload: { week, network: t.network, board: t.board, n: t.n, graded: t.graded, skipped: res.skipped, picture: Boolean(png) } }
  const release = async (why) => {
    const del = await db.from('homer_feed_posts').delete().match({ day, kind: NVB_KIND })
    if (del?.error) { console.error(`[nvb] could not release the claim (${why}): ${del.error.message}`); return false }
    unmarkTaken(day, NVB_KIND)
    _wait.set(day, now)
    return true
  }
  if (hasX()) {
    const g = await admit(db, { day, kind: NVB_KIND, repeat: false })
    if (g.state === 'go') {
      const mediaIds = png ? [await uploadImageToX(png)].filter(Boolean) : []
      const x = await postToX(text, { kind: NVB_KIND, ...(mediaIds.length ? { mediaIds } : {}) })
      if (x.ok && x.id) { patch.x_post_id = x.id; logPosted({ day, kind: NVB_KIND, tweetId: x.id, text }) }
      else {
        console.error(`[nvb] refused: ${x.status} ${x.error}`)
        if (mayRetryPost(x, `${NVB_KIND}|${day}`) && await release(`x ${x.status}`)) return `retry: x ${x.status}`
      }
    } else if (await release(g.reason || g.state)) return `retry: x ${g.reason || g.state}`
  }
  const d = await postToDiscord(text, { kind: NVB_KIND, sportKey: 'mlb', ...(png ? { png } : {}) }, hooks)
  if (d.ok) patch.discord_sent = true
  const saved = await db.from('homer_feed_posts').update(patch).match({ day, kind: NVB_KIND })
  if (saved?.error) console.error(`[nvb] posted but the row did not record it: ${saved.error.message}`)
  return patch.x_post_id ? 'posted' : (patch.discord_sent ? 'posted (discord only)' : 'posted (nowhere)')
}
