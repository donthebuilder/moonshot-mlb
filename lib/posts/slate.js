// THE SLATE (X overhaul stage 3 piece 3, 2026-10-09, Donovan). ONE cross-sport post a day. It REPLACES
// three MOONSHOT kinds -- callofnight (THE BEST LOOK), pregame (THE CALLED SHOTS) and thefour -- which
// are retired for good (lib/dash/xPolicy.js RETIRED_BY_SLATE: their history rows stay, nothing claims
// or posts them again).
//
//   🎯 THE SLATE · FRI OCT 9
//
//   CALL OF THE NIGHT
//   [Full Name] ([Full Team Name])
//   [home run / anytime touchdown / goal scorer]
//   CALLED · [one proof line from his own row]
//
//   MLB  [Full Name] · home run          one line per ACTIVE sport (games that day)
//   NFL  [Full Name] · anytime touchdown
//   NHL  [Full Name] · goal scorer
//
//   Full rankings → DASH · MOONSHOT · TUDDY · LAMP
//
// WHO IS "THE STRONGEST CALL" (the rule, and why it never compares scores across sports):
//   * Each sport names its candidates with ITS OWN word and ITS OWN rank. A candidate is a player the
//     sport calls CALLED -- lib/callStatus.js (MLB), the week's TD ladder (NFL), the board's called
//     skater of each club (lib/nhl/goalModel.js scoreNight, NHL), the points board (NBA). A score is
//     never read here, only `rank` (his place on his own sport's board that day) and `of` (how many
//     are on that board).
//   * A sport's strongest call is its best-ranked CALLED player on today's board.
//   * CALL OF THE NIGHT is the strongest call whose rank is the smaller SHARE of its own board
//     (rank / of: #1 of 400 beats #1 of 80). That is a percentile within the sport, not a score from
//     the sport. A tie goes to the registry order (lib/routes.js ALL_SPORT_KEYS).
//   * The sport line of the sport that owns the Call of the Night shows that sport's NEXT called
//     player, so no name appears twice in one post; with no second player the sport has no line.
//
// BEFORE ANYONE IS NAMED (rule 4; lib/dash/namingChecks.js): on today's slate; NFL not OUT/inactive;
// NHL the opposing starting goalie confirmed; MLB his lineup posted with him in it and the starter
// confirmed. A definite no leaves him out. A PENDING check HOLDS the post (nothing is claimed, the
// next tick asks again) until 30 minutes before the first game it names, then the post goes out
// WITHOUT that name (the next called player takes the seat, or the sport has no line). A sport whose
// board could not be read holds the same way and is then left out.
//
// `named` is stored in the payload: the exact player ids the posted text names, by sport
// (named_by_sport). The live CALLED alert's quote reads it (lib/dash/quoteFor.js), so an alert quotes
// this post only for a man the post names.
//
// No links, no hashtags, no probability words, no "bot". Words come from the registry (lib/routes.js
// BRAND / POST_WORDS / POST_POINTER). Adapters per sport: lib/posts/{mlb,nfl,nhl,nba}.js.
import { ALL_SPORT_KEYS, BRAND, DEFAULT_SPORT, POST_POINTER, POST_WORDS } from '../routes'
import { resolveNaming } from '../dash/namingChecks'
import { X_POLICY } from '../dash/xPolicy'
import { admit, logPosted, recentNamed } from '../dash/xGate'
import { recordPost } from '../dash/xPostLog'
import { hasX, postToDiscord, postToX } from '../dash/xPost'
import { knownTaken, markTaken, unmarkTaken } from '../dash/postClaim'
import { STATUS_WORD } from '../callStatus'
import { kindOn } from '../dash/longshotsPost'
import { HARD_LIMIT, postLimit, TAIL_MARGIN } from '../dash/postLimit'

export const KIND = 'slate'
/** The kinds the Slate replaced. A real X post under one of them on a day means "the list is already out today". */
const RETIRED_LIST_KINDS = ['pregame', 'callofnight', 'thefour']
/** The post is ready this long before the first game it covers (the old Called Shots hour). A later piece (the scheduler) moves it into the posting windows. */
export const SLATE_LEAD_MS = 60 * 60e3
/** The repeat window (days) a player is kept out of the next Slate: 3, football 7 (lib/dash/xPolicy.js X_POLICY.repeatDays). */
const REPEAT_DAYS = { nfl: X_POLICY.repeatDays.nfl }   // a table keyed by sport, not a branch
export const repeatWindowFor = (sport) => REPEAT_DAYS[sport] ?? X_POLICY.repeatDays.default

// ── TEXT ────────────────────────────────────────────────────────────────────
/** X's weighted length: most of the Latin and punctuation range counts 1, emoji and arrows count 2. */
export function xLen(text) {
  let n = 0
  for (const ch of String(text == null ? '' : text)) {
    const c = ch.codePointAt(0)
    n += (c <= 0x10ff || (c >= 0x2000 && c <= 0x200d) || (c >= 0x2010 && c <= 0x201f) || (c >= 0x2032 && c <= 0x2037)) ? 1 : 2
  }
  return n
}
const WEEKDAY = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONTH = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
/** 'FRI OCT 9' from the slate's own date (the game's date, never the clock). */
export function dayLabel(day) {
  const d = new Date(`${day}T12:00:00Z`)
  return Number.isFinite(d.getTime()) ? `${WEEKDAY[d.getUTCDay()]} ${MONTH[d.getUTCMonth()]} ${d.getUTCDate()}` : String(day || '')
}

// A product that is hidden (BRAND.x.hidden) is public only when its own switch is on. One table, no sport branches.
const OPEN_SWITCH = { nba: () => /^on$/i.test(String(process.env.BUCKETS_PUBLIC || process.env.NEXT_PUBLIC_BUCKETS_PUBLIC || '').trim()) }
export const isPublicSport = (s) => !BRAND[s]?.hidden || Boolean(OPEN_SWITCH[s]?.())

/** The pointer in words: the front door, then the products that played, by their real names. '' when none of them is public. */
export function pointerLine(activeSports) {
  const names = ALL_SPORT_KEYS.filter((s) => activeSports.includes(s) && isPublicSport(s)).map((s) => BRAND[s].name)
  return names.length ? `${POST_POINTER.lead} ${POST_POINTER.arrow} ${[POST_POINTER.home, ...names].join(' · ')}` : ''
}

const callLines = (c) => [
  'CALL OF THE NIGHT',
  `${c.name}${c.teamName ? ` (${c.teamName})` : ''}`,
  POST_WORDS[c.sport].market,
  `${STATUS_WORD.called} · ${c.proof}`,
]
const sportLine = (c) => `${BRAND[c.sport].league}  ${c.name} · ${POST_WORDS[c.sport].market}`

/**
 * The post, fitted to X's length. Sport lines come off the bottom first (the last sport in the registry
 * order), then the pointer; the Call of the Night never does.
 * @returns {{ text, picks }} the text and the picks whose names are really in it
 */
export function renderSlate({ day, cotn, lines = [], activeSports = [], limit = HARD_LIMIT } = {}) {
  if (!cotn) return { text: '', picks: [] }
  const head = `\u{1F3AF} THE SLATE · ${dayLabel(day)}`
  const pointer = pointerLine(activeSports)
  for (let n = lines.length; n >= 0; n -= 1) {
    for (const withPointer of pointer ? [true, false] : [false]) {
      const body = [head, '', ...callLines(cotn)]
      if (n) body.push('', ...lines.slice(0, n).map(sportLine))
      if (withPointer) body.push('', pointer)
      const text = body.join('\n')
      if (xLen(text) <= limit) return { text, picks: [cotn, ...lines.slice(0, n)] }
    }
  }
  return { text: '', picks: [] }
}

// ── CHOOSING ────────────────────────────────────────────────────────────────
const byRank = (a, b) => (a.rank - b.rank) || String(a.name).localeCompare(String(b.name))
const orderIx = (s) => { const i = ALL_SPORT_KEYS.indexOf(s); return i < 0 ? 99 : i }

/**
 * The Call of the Night and the sport lines from candidate rows. Pure.
 * `rows` are candidates (lib/posts/{sport}.js) with `sport`, `rank`, `of`. Never reads a score.
 * @returns {{ cotn, lines }} lines: one per sport that has a called player other than the cotn
 */
export function pickSlate(rows) {
  const by = new Map()
  for (const r of rows || []) {
    if (!(r.rank > 0) || !(r.of > 0)) continue
    if (!by.has(r.sport)) by.set(r.sport, [])
    by.get(r.sport).push(r)
  }
  for (const list of by.values()) list.sort(byRank)
  const sports = [...by.keys()].sort((a, b) => orderIx(a) - orderIx(b))
  let cotn = null
  for (const s of sports) {
    const head = by.get(s)[0]
    // the SHARE of his own board: #1 of 400 is a smaller share than #1 of 80. Never a score.
    if (!cotn || head.rank / head.of < cotn.rank / cotn.of - 1e-12) cotn = head
  }
  if (!cotn) return { cotn: null, lines: [] }
  const lines = []
  for (const s of sports) {
    const next = by.get(s).find((r) => r !== cotn)
    if (next) lines.push(next)
  }
  return { cotn, lines }
}

const keyOf = (c) => `${c.sport}:${c.id}`

/**
 * Everything but the I/O: from the sports' adapter outputs to the post. Pure.
 * @param sports   [{ sport, hasGames, firstStartMs, hold, cands }] (lib/posts adapters)
 * @param repeated Set of `${sport}:${id}` named by a Slate too recently (left out; the next player takes the seat)
 * @returns {{ state: 'go', text, named, namedBySport, payload }
 *          | { state: 'held', reason, pending } | { state: 'waiting' } | { state: 'none', reason }}
 */
export function assembleSlate({ day, sports: all = [], repeated = new Set(), now = Date.now(), limit = null } = {}) {
  // a product that is not public yet (BUCKETS until BUCKETS_PUBLIC=on) is not on the Slate at all: no line, no pointer
  const sports = all.filter((s) => isPublicSport(s.sport))
  const active = sports.filter((s) => s.hasGames)
  if (!active.length) return { state: 'none', reason: 'no games today' }
  const starts = active.map((s) => s.firstStartMs).filter(Number.isFinite)
  const firstStart = starts.length ? Math.min(...starts) : NaN
  if (Number.isFinite(firstStart) && now < firstStart - SLATE_LEAD_MS) return { state: 'waiting' }
  const dropAt = Number.isFinite(firstStart) ? firstStart - X_POLICY.holdUntilBeforeStartMin * 60e3 : NaN

  // a sport that could not be read yet (stale board, failed read): held, then left out
  const holds = sports.filter((s) => s.hold)
  if (holds.length && !(now >= dropAt)) return { state: 'held', reason: holds.map((s) => `${s.sport}: ${s.hold}`).join('; '), pending: holds.map((s) => ({ id: s.sport, reason: s.hold })) }

  const rows = []
  for (const s of active) {
    for (const c of s.cands || []) {
      if (repeated.has(keyOf(c))) continue
      rows.push({ ...c, player_id: keyOf(c) })
    }
  }
  const nr = resolveNaming({
    rows,
    check: (r) => (r.problem ? { id: r.player_id, reason: `${r.sport} ${r.name}: ${r.problem.reason}`, pending: Boolean(r.problem.pending) } : null),
    pickFrom: (rs) => { const { cotn, lines } = pickSlate(rs); return cotn ? [cotn, ...lines] : [] },
    startOf: (r) => r.startMs,
    trim: true,
    now,
  })
  if (nr.state === 'held') return { state: 'held', reason: nr.reason, pending: nr.pending }
  if (nr.state === 'dropped') return { state: 'none', reason: nr.reason }
  // resolveNaming's picks are [cotn, ...lines] (pickSlate's order), already trimmed of anyone not confirmed
  const [cotn, ...lines] = nr.picks
  if (!cotn) return { state: 'none', reason: 'no called player is confirmed' }
  const activeSports = active.map((s) => s.sport)
  const out = renderSlate({ day, cotn, lines, activeSports, limit: limit || postLimit() + TAIL_MARGIN })
  if (!out.text) return { state: 'none', reason: 'does not fit' }
  const named = out.picks.map((p) => String(p.id))
  const namedBySport = Object.fromEntries(ALL_SPORT_KEYS.map((k) => [k, []]))   // every sport has a key: a quote reads "none named", never "unknown"
  for (const p of out.picks) namedBySport[p.sport].push(String(p.id))
  const brief = (p) => ({ sport: p.sport, player_id: String(p.id), name: p.name, team: p.team || null, rank: p.rank, of: p.of })
  const payload = {
    v: 1, day, named, named_by_sport: namedBySport, sports: activeSports,
    // the MOONSHOT names, in the shape the old pregame payload had (the receipt, /called and the morning grade read it)
    picks: out.picks.filter((p) => p.sport === DEFAULT_SPORT).map((p) => ({ player_id: String(p.id), name: p.name, team: p.team || null })),
    cotn: brief(cotn), lines: out.picks.slice(1).map(brief),
    left_out: nr.trimmed || [],
  }
  return { state: 'go', text: out.text, named, namedBySport, payload, trimmed: nr.trimmed || [], reason: nr.reason, firstStartMs: firstStart }
}

// ── POSTING ─────────────────────────────────────────────────────────────────
// POST_KINDS_ON (Vercel env) switches kinds. The Slate is on when its own name is, or when the kind it
// replaced (pregame) is: someone who listed 'pregame' meant "post the day's call".
export const slateKindOn = () => kindOn(KIND) || kindOn('pregame')

const _wait = new Map()   // `${day}` -> ms of the last answer that needs time (waiting / none)
const RETRY_MS = 5 * 60e3
export const _resetSlateForTests = () => _wait.clear()

/**
 * One try at the day's Slate. Cheap when there is nothing to do: a taken slot costs no request, an
 * early or empty answer is not asked again for five minutes on this instance.
 * @param load   async () => the sports' adapter outputs (lib/posts/slateLoad.js)
 * @param hooks  the Discord webhooks the old pregame mirrored to (the free feed channels)
 * @returns {Promise<string>} what happened, for the tick's own log
 */
export async function postSlateOnce(db, { day, load, hooks = '', now = Date.now() } = {}) {
  if (!slateKindOn()) return 'off'
  if (knownTaken(day, KIND)) return 'already-posted'
  if (now - (_wait.get(day) || 0) < RETRY_MS) return 'waiting'
  // One read: the day's Slate row, and the rows of the three kinds the Slate replaced. A deploy day can have
  // the OLD list already out (pregame / callofnight / thefour with a real X id): the day's list is posted, so the
  // Slate stays out of it (never two "today's calls" posts in one day).
  const { data: rowsToday } = await db.from('homer_feed_posts').select('kind, x_post_id').eq('day', day).in('kind', [KIND, ...RETIRED_LIST_KINDS])
  const today = Array.isArray(rowsToday) ? rowsToday : []
  if (today.some((r) => r.kind === KIND)) { markTaken(day, KIND); return 'already-posted' }
  const old = today.find((r) => /^\d+$/.test(String(r.x_post_id ?? '')))
  if (old) { markTaken(day, KIND); console.log(`[slate] ${day}: the ${old.kind} list already went out today -- no Slate`); return `already-posted (${old.kind} list)` }

  const sports = await load()
  // who a Slate named too recently: 3 days, football 7 (the same rule as every other kind, lib/dash/xGate.js).
  // Read PER SPORT (named_by_sport), so ids from different sports never hold each other out.
  const repeated = new Set()
  for (const sport of ALL_SPORT_KEYS) {
    for (const id of await recentNamed(db, { kind: KIND, day, windowDays: repeatWindowFor(sport), sport })) repeated.add(`${sport}:${id}`)
  }
  const a = assembleSlate({ day, sports, repeated, now })
  if (a.state === 'waiting') { _wait.set(day, now); return 'waiting' }
  if (a.state === 'held') {
    recordPost({ day, kind: KIND, sport: 'mlb', state: 'HELD', reason: a.reason, ids: (a.pending || []).map((p) => p.id) })
    return `held: ${a.reason}`
  }
  if (a.state === 'none') { _wait.set(day, now); return `none: ${a.reason}` }
  if (a.trimmed?.length) recordPost({ day, kind: KIND, sport: 'mlb', state: 'DROPPED', reason: `left out, ${a.reason || 'not confirmed'} 30 min before the first game: ${a.trimmed.join(', ')}`, ids: a.trimmed })

  // THE SCHEDULER does not gate this post on purpose (M1): the Slate is ready one hour before the first game it
  // covers (SLATE_LEAD_MS), which is its own timing, and the claim below is its only lock.
  const { data: claimed, error } = await db.from('homer_feed_posts')
    .upsert([{ day, kind: KIND, payload: {} }], { onConflict: 'day,kind', ignoreDuplicates: true }).select('day')
  if (error) { console.error(`[slate] claim failed: ${error.message}`); return 'claim-failed' }
  markTaken(day, KIND)
  if (!claimed?.length) return 'already-posted'

  const patch = { payload: a.payload }
  // the payload goes in first: the receipt reads `named` the moment the post exists
  const first = await db.from('homer_feed_posts').update({ payload: a.payload }).match({ day, kind: KIND })
  if (first?.error) console.error(`[slate] payload not saved: ${first.error.message}`)

  // X first, Discord after: the claim only HOLDS once X has answered for good. A pause, a cap hold or a
  // transient X error (429 / 5xx / network) before the first game RELEASES the claim so the next tick tries
  // again -- and Discord has not been told yet, so a retry cannot post it twice. After a successful X post,
  // or once the first game has started (a late Slate is no use on X), the claim stays.
  const retryable = !(Number.isFinite(a.firstStartMs) && now >= a.firstStartMs)
  const release = async (why) => {
    const del = await db.from('homer_feed_posts').delete().match({ day, kind: KIND })
    if (del?.error) { console.error(`[slate] could not release the claim (${why}): ${del.error.message}`); return false }
    unmarkTaken(day, KIND)
    _wait.set(day, now)
    return true
  }
  if (hasX()) {
    // the pause and the daily cap (slate tier); the repeat guard was applied above, per player
    const g = await admit(db, { day, kind: KIND, ids: a.named, repeat: false })
    if (g.state === 'go') {
      const r = await postToX(a.text, { kind: KIND })
      if (r.ok && r.id) { patch.x_post_id = r.id; logPosted({ day, kind: KIND, ids: a.named, tweetId: r.id, text: a.text }) }
      else {
        console.error(`[slate] refused: ${r.status} ${r.error}`)
        const transient = r.status === 429 || r.status >= 500 || r.status === 0
        if (transient && retryable && await release(`x ${r.status}`)) return `retry: x ${r.status}`
      }
    } else if (retryable && await release(g.reason || g.state)) return `retry: x ${g.reason || g.state}`
  }
  const d = await postToDiscord(a.text, { kind: KIND, sportKey: 'mlb' }, hooks)
  if (d.ok) patch.discord_sent = true
  const saved = await db.from('homer_feed_posts').update(patch).match({ day, kind: KIND })
  if (saved?.error) console.error(`[slate] posted but the row did not record it: ${saved.error.message}`)
  return patch.x_post_id ? 'posted' : (patch.discord_sent ? 'posted (discord only)' : 'posted (nowhere)')
}
