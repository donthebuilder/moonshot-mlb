// THE NIGHT RECEIPT (X overhaul stage 3, Donovan 2026-10-09: "NIGHT RECEIPT: ONLY when a slate or write-up
// player cashed. Quotes the pregame post. Absorbs recap + accountability. No cash = no post. Weekly/monthly
// stay."). ONE cross-sport post, the morning after, that grades the day's NAMED players.
//
//   🧾 THE RECEIPT · FRI OCT 9
//
//   CALLED · 2 of 4 cashed
//   [Full Name] · home run · cashed
//   [Full Name] · anytime touchdown · cashed
//   [Full Name] · goal scorer · missed
//   +1 more missed
//
//   (a night with misses has no tagline: the record line and the rows say it)
//   Every call, graded → DASH · The Ledger
//
// WHO IS NAMED: the players the day's public posts really named -- THE SLATE (payload.cotn / lines, who it
// stores) and the write-ups (call_<game_pk>, writeup_nfl_<game>, writeup_nhl_<game>: payload.named / the
// players they store). A post that never reached X (a dry run, a skipped write-up, 'backfill') named
// nobody in public, so it names nobody here.
//
// WHAT IT QUOTES: the post that named the man who cashed -- THE SLATE when it named one of them, else the
// write-up that did (never a dry / skipped id; a quote of a post that does not name him is a wrong receipt).
//
// WHEN: event-driven. It is ready when every game of the day that held a named player is FINAL (and has
// been for SETTLE_MS, so the last event row has landed). A game that never ends (postponed forever) gives
// up after STALE_MS: the post goes out with the players that were graded.
//
// HONEST ABOUT MISSES (the lesson of the old accountability post, whose cut flattered its own record): the
// record line counts EVERY named player; rows that do not fit are named as "+N more", and a miss is kept in
// view before a second win. Wins lead. A man who did not play is "did not play (void)", not a miss, and is
// not in the record's denominator. NO CASH = NO POST (logged DROPPED, 'no cash'; the day's counts are kept
// on a 'skipped' row so the weekly and monthly total the nights that did not cash too).
//
// WEEKLY (Monday morning) and MONTHLY (the 1st) are the same receipt over the stored nightly receipts,
// own schedule, own claim -- they used to be claimed inside the retired recap and never ran.
//
// No links, no hashtags, no probability, no "bot". Words come from the registry (lib/routes.js BRAND /
// POST_WORDS / the real nav name of the Ledger) and lib/callStatus.js STATUS_WORD.
import { ALL_SPORT_KEYS, BRAND, MLB_NAV, POST_POINTER, POST_WORDS } from '../routes'
import { STATUS_WORD } from '../callStatus'
import { admit, logPosted } from '../dash/xGate'
import { recordPost } from '../dash/xPostLog'
import { hasX, postToDiscord, postToX } from '../dash/xPost'
import { knownTaken, markTaken, unmarkTaken } from '../dash/postClaim'
import { kindOn } from '../dash/longshotsPost'
import { HARD_LIMIT, postLimit, TAIL_MARGIN } from '../dash/postLimit'
import { isPublicSport, dayLabel, xLen } from './slate'
import { mlbOutcome } from './mlb'
import { nflOutcome } from './nfl'
import { nhlOutcome } from './nhl'

export const KIND = 'receipt'
export const WEEKLY = 'weekly'
export const MONTHLY = 'monthly'
/** After every game is final the post waits this long, so the last event row (a home run, a touchdown) has landed. */
export const SETTLE_MS = 10 * 60e3
/** A game that is still not final this long after the day's first start is given up on; what was graded goes out. */
export const STALE_MS = 30 * 3600e3
/** At most this many rows under the record line (4-8 short lines in all). */
export const MAX_ROWS = 4

export const OUTCOMES = Object.freeze(['cashed', 'missed', 'void'])
const OUTCOME_WORD = { cashed: 'cashed', missed: 'missed', void: 'did not play (void)' }
const VOICE_ALL = 'The signal was there.'
const VOICE_MIXED = ''   // no tagline on a night with misses: the record line says it (Donovan 10-09: "can't be modeled" is a cop-out)
/** "Every call, graded → DASH · The Ledger": the real nav name of the Ledger (lib/routes.js), in words, never a URL. */
export const ledgerPointer = () => `Every call, graded ${POST_POINTER.arrow} ${POST_POINTER.home} · ${MLB_NAV.ledger.label}`

/** A real tweet id: digits. Never 'dry' / 'skipped' / 'backfill' / 'posting' / null. */
export const isRealTweetId = (v) => /^\d+$/.test(String(v == null ? '' : v))
const txt = (v) => String(v == null ? '' : v).trim()
const orderIx = (s) => { const i = ALL_SPORT_KEYS.indexOf(s); return i < 0 ? 99 : i }
const shiftDay = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

// ── 1. WHO WAS NAMED ────────────────────────────────────────────────────────
const WRITEUP_SPORT = [['call_', 'mlb'], ['writeup_nfl_', 'nfl'], ['writeup_nhl_', 'nhl'], ['writeup_mlb_', 'mlb']]
const sportOfWriteup = (kind) => (WRITEUP_SPORT.find(([p]) => String(kind || '').startsWith(p)) || [])[1] || null
/** 'HR' | 'HIT' | ... from a write-up payload's role or its plain bar ("1+ home run"). */
function roleOfCall(payload) {
  const role = txt(payload?.role).toUpperCase().split('/')[0]
  if (['TOP', 'HR', 'HIT', 'HRR', 'CONTACT'].includes(role)) return role
  const bar = txt(payload?.bar).toLowerCase()
  return /home run/.test(bar) ? 'HR' : /total bases/.test(bar) ? 'CONTACT' : /hits, runs/.test(bar) ? 'HRR' : /\bhit\b/.test(bar) ? 'HIT' : 'HR'
}
const marketOfRole = (role) => ({ HR: 'home run', TOP: 'home run', HIT: 'hit', HRR: 'hits, runs and RBI', CONTACT: 'total bases' }[role] || 'home run')

/**
 * The day's named players, from the day's posts. Pure.
 * @param rows the day's homer_feed_posts rows ({ kind, x_post_id, payload }) -- slate / pregame / call_% / writeup_%
 * @returns {{ players: Array<{ sport, id, name, team, market, role, game, inSlate, slateId, writeupId, writeupKind }>, slateId: string|null }}
 */
export function namedPlayers(rows) {
  const byKey = new Map()
  let slateId = null
  const add = (sport, p, from) => {
    const id = txt(p.id), name = txt(p.name)
    if (!sport || !id || !name) return                        // a man the payload cannot name is not listed
    const key = `${sport}:${id}`
    const cur = byKey.get(key) || { sport, id, name, team: txt(p.team), market: p.market || POST_WORDS[sport]?.market || '', role: p.role || null, game: p.game ?? null, inSlate: false, slateId: null, writeupId: null, writeupKind: null }
    if (from.slate) { cur.inSlate = true; cur.slateId = from.slate }
    else if (!cur.writeupId) { cur.writeupId = from.writeup; cur.writeupKind = from.kind; if (p.role) cur.role = p.role; if (p.market) cur.market = p.market; if (p.game != null) cur.game = p.game }
    byKey.set(key, cur)
  }
  for (const r of rows || []) {
    if (!isRealTweetId(r?.x_post_id)) continue
    const pl = r.payload && typeof r.payload === 'object' ? r.payload : {}
    if (r.kind === 'slate') {
      slateId = String(r.x_post_id)
      const named = pl.named_by_sport && typeof pl.named_by_sport === 'object' ? pl.named_by_sport : null
      for (const b of [pl.cotn, ...(Array.isArray(pl.lines) ? pl.lines : [])]) {
        if (!b) continue
        // only a man the post really names (named_by_sport is the exact list the text names)
        if (named && !(Array.isArray(named[b.sport]) && named[b.sport].map(String).includes(txt(b.player_id)))) continue
        add(b.sport, { id: b.player_id, name: b.name, team: b.team }, { slate: String(r.x_post_id) })
      }
    } else if (r.kind === 'pregame') {
      // a day from before the Slate: the morning post's picks (MOONSHOT's hitters), the quote the live alerts used
      slateId = slateId || String(r.x_post_id)
      for (const p of Array.isArray(pl.picks) ? pl.picks : []) add('mlb', { id: p.player_id, name: p.name, team: p.team }, { slate: String(r.x_post_id) })
    } else {
      const sport = sportOfWriteup(r.kind)
      if (!sport || pl.mode === 'dry' || pl.mode === 'skipped') continue
      const from = { writeup: String(r.x_post_id), kind: r.kind }
      const named = new Set((Array.isArray(pl.named) ? pl.named : []).map(String))
      if (sport === 'mlb') {
        // call_<game_pk>: the hitter the call is about (payload.player_id / name / role / bar)
        const role = roleOfCall(pl)
        if (pl.player_id != null && (!named.size || named.has(String(pl.player_id)))) add('mlb', { id: pl.player_id, name: pl.name, role, market: marketOfRole(role), game: pl.game_pk }, from)
      } else {
        // writeup_nfl_/writeup_nhl_: the players the write-up stores (payload.writeup.players), limited to who it named
        for (const p of Array.isArray(pl.writeup?.players) ? pl.writeup.players : []) {
          if (named.size && !named.has(String(p.player_id))) continue
          add(sport, { id: p.player_id, name: p.name, team: p.team, game: pl.game_id }, from)
        }
      }
    }
  }
  const players = [...byKey.values()].filter((p) => isPublicSport(p.sport)).sort((a, b) => orderIx(a.sport) - orderIx(b.sport) || a.name.localeCompare(b.name))
  return { players, slateId }
}

// ── 2. HAS THE NIGHT ENDED ──────────────────────────────────────────────────
/**
 * Pure. Every game that held a named player is FINAL.
 * @param players  namedPlayers().players
 * @param games    { [sport]: [{ id, teams: [abbr, ...], final: boolean, startMs }] | null }  null = the sport's games could not be read
 * @returns {{ ready: boolean, waiting: string[], startMs: number }} startMs: the earliest start among the games that count
 */
export function nightSettled(players, games = {}) {
  const waiting = []
  let startMs = NaN
  const note = (g) => { if (Number.isFinite(g.startMs) && !(g.startMs >= startMs)) startMs = g.startMs }
  for (const sport of new Set((players || []).map((p) => p.sport))) {
    const list = games?.[sport]
    if (!Array.isArray(list)) { waiting.push(`${sport}: games not readable`); continue }
    const holding = new Set()
    for (const p of players.filter((x) => x.sport === sport)) {
      const own = list.filter((g) => (p.game != null && String(g.id) === String(p.game)) || (p.team && (g.teams || []).map((t) => txt(t).toUpperCase()).includes(txt(p.team).toUpperCase())))
      // a man whose game cannot be found waits for the whole sport's night (never guessed final)
      for (const g of own.length ? own : list) holding.add(g)
    }
    if (!holding.size) waiting.push(`${sport}: no game found`)
    for (const g of holding) { note(g); if (!g.final) waiting.push(`${sport} ${g.id} not final`) }
  }
  return { ready: waiting.length === 0, waiting, startMs }
}

// ── 3. HOW EACH ONE WENT ────────────────────────────────────────────────────
const GRADERS = { mlb: mlbOutcome, nfl: nflOutcome, nhl: nhlOutcome }
/** 'cashed' | 'missed' | 'void' | 'pending' (not graded yet), from the sport's stored results. A sport with no grader is pending. */
export function outcomeOf(p, results = {}) {
  const grade = GRADERS[p.sport]
  return grade ? grade({ id: p.id, name: p.name, role: p.role }, results[p.sport] || {}) : 'pending'
}
export const emptyCounts = () => ({ cashed: 0, missed: 0, void: 0 })
function tally(graded) {
  const total = emptyCounts()
  const bySport = {}
  for (const g of graded) {
    total[g.outcome] += 1
    bySport[g.sport] = bySport[g.sport] || emptyCounts()
    bySport[g.sport][g.outcome] += 1
  }
  return { total, bySport }
}

// ── 4. THE TEXT ─────────────────────────────────────────────────────────────
const plural = (n, one, many) => (n === 1 ? one : many)
const recordLine = (c) => `${STATUS_WORD.called} · ${c.cashed} of ${c.cashed + c.missed} cashed${c.void ? ` · ${c.void} did not play` : ''}`
const rowLine = (g) => `${g.name} · ${g.market} · ${OUTCOME_WORD[g.outcome]}`
const byOutcome = (g) => OUTCOMES.indexOf(g.outcome)

/**
 * The post, fitted to X's length. Pure.
 * @param graded [{ sport, id, name, market, outcome: cashed|missed|void }] EVERY named player that was graded
 * @returns {{ text: string, shown: string[] }} shown: `${sport}:${id}` of the rows the text names
 */
export function renderReceipt({ day, graded = [], limit = HARD_LIMIT } = {}) {
  const c = tally(graded).total
  if (!c.cashed) return { text: '', shown: [] }
  const head = `\u{1F9FE} THE RECEIPT · ${dayLabel(day)}`
  const ordered = graded.slice().sort((a, b) => byOutcome(a) - byOutcome(b) || orderIx(a.sport) - orderIx(b.sport) || a.name.localeCompare(b.name))
  const cashed = ordered.filter((g) => g.outcome === 'cashed')
  const rest = ordered.filter((g) => g.outcome !== 'cashed')
  const voice = c.missed ? VOICE_MIXED : VOICE_ALL
  const pointer = ledgerPointer()
  // Which rows show: everything when it fits the lines; else the room is split so a miss stays in view
  // beside the wins (a record that only shows its wins is the flattery the old accountability post had).
  const pick = (slots) => {
    if (ordered.length <= slots) return ordered
    const missShown = Math.min(rest.length, Math.floor(slots / 2))
    const winShown = Math.min(cashed.length, Math.max(1, slots - missShown))
    const missFill = Math.min(rest.length, slots - winShown)
    return [...cashed.slice(0, winShown), ...rest.slice(0, missFill)]
  }
  for (let slots = MAX_ROWS; slots >= 1; slots -= 1) {
    const cap = ordered.length > slots ? slots - 1 : slots     // an overflow line takes one of the slots
    const rows = pick(Math.max(1, cap))
    const hiddenWin = cashed.length - rows.filter((g) => g.outcome === 'cashed').length
    const hiddenMiss = rest.filter((g) => g.outcome === 'missed').length - rows.filter((g) => g.outcome === 'missed').length
    const hiddenVoid = rest.filter((g) => g.outcome === 'void').length - rows.filter((g) => g.outcome === 'void').length
    const hidden = [hiddenWin ? `${hiddenWin} more cashed` : '', hiddenMiss ? `${hiddenMiss} more missed` : '', hiddenVoid ? `${hiddenVoid} more did not play` : ''].filter(Boolean)
    const more = hidden.length ? `+${hidden.join(' · ')}` : ''
    const body = [head, '', recordLine(c), ...rows.map(rowLine), ...(more ? [more] : []), '', ...(voice ? [voice] : []), pointer]
    const text = body.join('\n')
    if (xLen(text) <= limit) return { text, shown: rows.map((g) => `${g.sport}:${g.id}`) }
  }
  return { text: '', shown: [] }
}

// ── 5. EVERYTHING BUT THE I/O ───────────────────────────────────────────────
/**
 * From the day's posts and the sports' results to the receipt. Pure.
 * @param rows     the day's homer_feed_posts rows
 * @param results  { mlb: {...}, nfl: {...}, nhl: {...} } what lib/posts/receiptLoad.js read (see lib/posts/{mlb,nfl,nhl}.js *Outcome)
 * @param games    nightSettled's input
 * @returns {{ state: 'go', text, quoteId, payload, graded }
 *          | { state: 'waiting', reason } | { state: 'none', reason, payload? }}
 */
export function assembleReceipt({ day, rows = [], results = {}, games = {}, now = Date.now(), limit = null } = {}) {
  const { players, slateId } = namedPlayers(rows)
  if (!players.length) return { state: 'none', reason: 'no one was named' }
  const settled = nightSettled(players, games)
  const t0 = Number.isFinite(settled.startMs) ? settled.startMs : Date.parse(`${day}T12:00:00Z`)   // no start known: the day's noon UTC
  const gaveUp = !settled.ready && now - t0 > STALE_MS
  if (!settled.ready && !gaveUp) return { state: 'waiting', reason: settled.waiting.slice(0, 3).join('; ') }
  const graded = []
  const pending = []
  for (const p of players) {
    const outcome = outcomeOf(p, results)
    if (outcome === 'pending') { pending.push(p); continue }
    graded.push({ ...p, outcome })
  }
  // not graded yet and the games are not given up on: wait. After the give-up, they are left out (and say so in the payload).
  if (pending.length && !gaveUp) return { state: 'waiting', reason: `not graded yet: ${pending.slice(0, 3).map((p) => p.name).join(', ')}` }
  const counts = tally(graded)
  const payload = {
    v: 1, day, counts: counts.total, by_sport: counts.bySport,
    results: graded.map((g) => ({ sport: g.sport, player_id: g.id, name: g.name, market: g.market, outcome: g.outcome, in_slate: g.inSlate })),
    left_out: pending.map((p) => ({ sport: p.sport, player_id: p.id, name: p.name })),
    slate_id: slateId,
  }
  if (!counts.total.cashed) return { state: 'none', reason: 'no cash', payload }
  const out = renderReceipt({ day, graded, limit: limit || postLimit() + TAIL_MARGIN })
  if (!out.text) return { state: 'none', reason: 'does not fit', payload }
  // QUOTE the post that named a man who cashed: THE SLATE when it named one of them, else his write-up
  const winners = graded.filter((g) => g.outcome === 'cashed')
  const viaSlate = winners.find((g) => g.inSlate && isRealTweetId(g.slateId))
  const viaWriteup = winners.find((g) => isRealTweetId(g.writeupId))
  const quoteId = viaSlate ? viaSlate.slateId : viaWriteup ? viaWriteup.writeupId : null
  const shown = new Set(out.shown)
  const shownIds = graded.filter((g) => shown.has(`${g.sport}:${g.id}`)).map((g) => String(g.id))
  payload.named = shownIds
  payload.named_by_sport = Object.fromEntries(ALL_SPORT_KEYS.map((s) => [s, graded.filter((g) => g.sport === s && shown.has(`${g.sport}:${g.id}`)).map((g) => String(g.id))]))
  payload.quote_id = quoteId
  return { state: 'go', text: out.text, quoteId, payload, graded, named: shownIds }
}

// ── 6. POSTING (the night) ──────────────────────────────────────────────────
/** On when its own name is, or the kind it replaced (accountability) is: someone who listed 'accountability' meant "post the grade". */
export const receiptKindOn = () => kindOn(KIND) || kindOn('accountability')

const _wait = new Map()    // day -> ms of the last answer that needs time (waiting / none)
const _readySince = new Map()   // day -> ms the night was first seen settled on this instance
const RETRY_MS = 5 * 60e3
export const _resetReceiptForTests = () => { _wait.clear(); _readySince.clear() }

/**
 * One try at a day's receipt. Cheap when there is nothing to do: a taken slot costs no request, an early or
 * empty answer is not asked again for five minutes on this instance.
 * @param load   async (players, rows) => ({ results, games }) (lib/posts/receiptLoad.js)
 * @param hooks  the Discord webhooks the old accountability mirrored to (the free feed channels)
 * @returns {Promise<string>} what happened, for the tick's own log
 */
export async function postReceiptOnce(db, { day, load, hooks = '', now = Date.now() } = {}) {
  if (!receiptKindOn()) return 'off'
  if (knownTaken(day, KIND)) return 'already-posted'
  if (now - (_wait.get(day) || 0) < RETRY_MS) return 'waiting'
  // One read: the day's receipt row and every post that could have named someone.
  const { data, error: readError } = await db.from('homer_feed_posts').select('kind, x_post_id, payload').eq('day', day)
    .or('kind.in.(receipt,slate,pregame),kind.like.call_*,kind.like.writeup_*')
  if (readError) { console.error(`[receipt] read failed: ${readError.message}`); return 'read-failed' }
  const rows = Array.isArray(data) ? data : []
  if (rows.some((r) => r.kind === KIND)) { markTaken(day, KIND); return 'already-posted' }
  const named = namedPlayers(rows)
  if (!named.players.length) { _wait.set(day, now); return 'none: no one was named' }

  const read = await load(named.players, rows)
  const a = assembleReceipt({ day, rows, results: read.results, games: read.games, now })
  if (a.state === 'waiting') { _wait.set(day, now); _readySince.delete(day); return `waiting: ${a.reason}` }
  // settled: wait SETTLE_MS from when this instance first saw it so, for the last row to land
  if (!_readySince.has(day)) _readySince.set(day, now)
  if (now - _readySince.get(day) < SETTLE_MS) { _wait.set(day, now); return 'settling' }

  if (a.state === 'none') {
    if (a.reason === 'no cash') {
      // NO CASH = NO POST. The row is kept (counts and all) so the weekly and monthly total this night too.
      recordPost({ day, kind: KIND, sport: 'mlb', state: 'DROPPED', reason: 'no cash', ids: (a.payload?.results || []).map((r) => r.player_id) })
      const ins = await db.from('homer_feed_posts').upsert([{ day, kind: KIND, x_post_id: 'skipped', payload: { ...a.payload, mode: 'skipped', reason: 'no cash' } }], { onConflict: 'day,kind', ignoreDuplicates: true })
      if (ins?.error) { console.error(`[receipt] could not record the no-cash night: ${ins.error.message}`); _wait.set(day, now); return 'none: no cash (not recorded)' }
      markTaken(day, KIND)
      return 'dropped: no cash'
    }
    _wait.set(day, now)
    return `none: ${a.reason}`
  }

  const claim = await db.from('homer_feed_posts').upsert([{ day, kind: KIND, payload: {} }], { onConflict: 'day,kind', ignoreDuplicates: true }).select('day')
  if (claim.error) { console.error(`[receipt] claim failed: ${claim.error.message}`); return 'claim-failed' }
  markTaken(day, KIND)
  if (!claim.data?.length) return 'already-posted'

  const patch = { payload: a.payload }
  const first = await db.from('homer_feed_posts').update({ payload: a.payload }).match({ day, kind: KIND })
  if (first?.error) console.error(`[receipt] payload not saved: ${first.error.message}`)
  const release = async (why) => {
    const del = await db.from('homer_feed_posts').delete().match({ day, kind: KIND })
    if (del?.error) { console.error(`[receipt] could not release the claim (${why}): ${del.error.message}`); return false }
    unmarkTaken(day, KIND)
    _wait.set(day, now)
    return true
  }
  if (hasX()) {
    // the pause and the daily cap (writeup tier: stops at 18); the repeat guard does not apply to a receipt
    const g = await admit(db, { day, kind: KIND, ids: a.named, repeat: false })
    if (g.state === 'go') {
      const r = await postToX(a.text, { kind: KIND, ...(a.quoteId ? { quoteId: a.quoteId } : {}) })
      if (r.ok && r.id) { patch.x_post_id = r.id; logPosted({ day, kind: KIND, ids: a.named, tweetId: r.id, text: a.text }) }
      else {
        console.error(`[receipt] refused: ${r.status} ${r.error}`)
        const transient = r.status === 429 || r.status >= 500 || r.status === 0
        if (transient && await release(`x ${r.status}`)) return `retry: x ${r.status}`
      }
    } else if (await release(g.reason || g.state)) return `retry: x ${g.reason || g.state}`
  }
  const d = await postToDiscord(a.text, { kind: KIND, sportKey: 'mlb' }, hooks)
  if (d.ok) patch.discord_sent = true
  const saved = await db.from('homer_feed_posts').update(patch).match({ day, kind: KIND })
  if (saved?.error) console.error(`[receipt] posted but the row did not record it: ${saved.error.message}`)
  return patch.x_post_id ? 'posted' : (patch.discord_sent ? 'posted (discord only)' : 'posted (nowhere)')
}

// ── 7. WEEKLY AND MONTHLY: the same receipt over the stored nights ───────────
const MONTH = ['JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY', 'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER', 'NOVEMBER', 'DECEMBER']
const MON3 = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
/** The first morning hour (Phoenix, the approved posting day) a period receipt may go out. */
export const PERIOD_HOUR_PHX = 7

/**
 * Which period receipt is due on a Phoenix wall clock: Monday -> the week just ended (Mon..Sun), the 1st -> the month just
 * ended. `clock` is lib/dash/xSchedule.js phxClock(now): { day, hour, dow }. Pure. [] on any other morning.
 */
export function periodsDue(clock) {
  if (!clock || !(clock.hour >= PERIOD_HOUR_PHX)) return []
  const out = []
  if (clock.dow === 1) out.push({ kind: WEEKLY, key: clock.day, from: shiftDay(clock.day, -7), to: shiftDay(clock.day, -1) })
  if (Number(String(clock.day).slice(8, 10)) === 1) {
    const to = shiftDay(clock.day, -1)
    out.push({ kind: MONTHLY, key: clock.day, from: `${to.slice(0, 7)}-01`, to })
  }
  return out
}

/** The period's totals from the stored nightly receipt rows ({ day, payload: { counts, by_sport } }). A night with no row had no one named. Pure. */
export function periodTotals(rows) {
  const total = emptyCounts()
  const bySport = {}
  let nights = 0
  for (const r of rows || []) {
    const c = r?.payload?.counts
    if (!c) continue
    nights += 1
    for (const k of OUTCOMES) total[k] += Number(c[k]) || 0
    for (const [s, sc] of Object.entries(r.payload.by_sport || {})) {
      bySport[s] = bySport[s] || emptyCounts()
      for (const k of OUTCOMES) bySport[s][k] += Number(sc?.[k]) || 0
    }
  }
  return { total, bySport, nights }
}

/**
 * THE WEEKLY RECORD LINE (2026-10-10, Donovan approved): the week's named calls in plain counts -- made, landed,
 * missed, and the ones who did not play -- every figure a sum of the stored nightly receipt rows (the no-cash nights'
 * misses included), nothing typed. Made = landed + missed + did not play, so the three always add up.
 * The night receipt keeps its own rule: no cash = no post. This line rides only the weekly.
 */
export const weeklyRecordLine = (c, nights) => {
  const made = c.cashed + c.missed + c.void
  return `${STATUS_WORD.called} · ${made} ${plural(made, 'call', 'calls')} made · ${c.cashed} landed · ${c.missed} missed${c.void ? ` · ${c.void} did not play` : ''}${nights ? ` · ${nights}` : ''}`
}

/** The week's or month's text. Pure. '' when nothing cashed (no cash = no post). */
export function renderPeriod({ kind, from, to, totals, limit = HARD_LIMIT } = {}) {
  const c = totals?.total
  if (!c || !c.cashed) return ''
  const d = new Date(`${from}T12:00:00Z`)
  const label = kind === MONTHLY ? MONTH[d.getUTCMonth()] : `WEEK OF ${MON3[d.getUTCMonth()]} ${d.getUTCDate()}`
  const head = `\u{1F9FE} THE RECEIPT · ${label}`
  const sportLines = ALL_SPORT_KEYS.filter((s) => isPublicSport(s) && totals.bySport[s] && (totals.bySport[s].cashed + totals.bySport[s].missed) > 0)
    .map((s) => {
      const sc = totals.bySport[s]
      return `${BRAND[s].league}  ${sc.cashed} of ${sc.cashed + sc.missed} cashed · ${POST_WORDS[s].market}`
    })
  const nights = totals.nights ? `${totals.nights} ${plural(totals.nights, 'night', 'nights')}` : ''
  const voice = c.missed ? VOICE_MIXED : VOICE_ALL
  for (let n = sportLines.length; n >= 0; n -= 1) {
    const line = kind === WEEKLY ? weeklyRecordLine(c, nights) : `${recordLine(c)}${nights ? ` · ${nights}` : ''}`
    const text = [head, '', line, ...sportLines.slice(0, n), '', ...(voice ? [voice] : []), ledgerPointer()].join('\n')
    if (xLen(text) <= limit) return text
  }
  return ''
}

const _periodWait = new Map()   // `${kind}|${key}` -> ms
/**
 * One try at a period receipt (weekly / monthly). Their own claim, their own schedule: not inside any other post.
 * @param period periodsDue()[i]
 * @returns {Promise<string>}
 */
export async function postPeriodOnce(db, { period, hooks = '', now = Date.now() } = {}) {
  const { kind, key, from, to } = period
  if (!kindOn(kind) && !kindOn(KIND)) return 'off'
  if (knownTaken(key, kind)) return 'already-posted'
  if (now - (_periodWait.get(`${kind}|${key}`) || 0) < RETRY_MS) return 'waiting'
  const { data, error } = await db.from('homer_feed_posts').select('day, payload').eq('kind', KIND).gte('day', from).lte('day', to)
  if (error) { console.error(`[receipt] ${kind} read failed: ${error.message}`); return 'read-failed' }
  const text = renderPeriod({ kind, from, to, totals: periodTotals(data), limit: postLimit() + TAIL_MARGIN })
  if (!text) {
    _periodWait.set(`${kind}|${key}`, now)
    recordPost({ day: key, kind, sport: 'mlb', state: 'DROPPED', reason: 'no cash' })
    return 'none: no cash'
  }
  const claim = await db.from('homer_feed_posts').upsert([{ day: key, kind, payload: {} }], { onConflict: 'day,kind', ignoreDuplicates: true }).select('day')
  if (claim.error) { console.error(`[receipt] ${kind} claim failed: ${claim.error.message}`); return 'claim-failed' }
  markTaken(key, kind)
  if (!claim.data?.length) return 'already-posted'
  const totals = periodTotals(data)
  const patch = { payload: { v: 1, from, to, counts: totals.total, by_sport: totals.bySport, nights: totals.nights } }
  const release = async (why) => {
    const del = await db.from('homer_feed_posts').delete().match({ day: key, kind })
    if (del?.error) { console.error(`[receipt] could not release the ${kind} claim (${why}): ${del.error.message}`); return false }
    unmarkTaken(key, kind)
    _periodWait.set(`${kind}|${key}`, now)
    return true
  }
  if (hasX()) {
    const g = await admit(db, { day: key, kind, repeat: false })
    if (g.state === 'go') {
      const r = await postToX(text, { kind })
      if (r.ok && r.id) { patch.x_post_id = r.id; logPosted({ day: key, kind, tweetId: r.id, text }) }
      else {
        console.error(`[receipt] ${kind} refused: ${r.status} ${r.error}`)
        const transient = r.status === 429 || r.status >= 500 || r.status === 0
        if (transient && await release(`x ${r.status}`)) return `retry: x ${r.status}`
      }
    } else if (await release(g.reason || g.state)) return `retry: x ${g.reason || g.state}`
  }
  const d = await postToDiscord(text, { kind, sportKey: 'mlb' }, hooks)
  if (d.ok) patch.discord_sent = true
  const saved = await db.from('homer_feed_posts').update(patch).match({ day: key, kind })
  if (saved?.error) console.error(`[receipt] ${kind} posted but the row did not record it: ${saved.error.message}`)
  return patch.x_post_id ? 'posted' : (patch.discord_sent ? 'posted (discord only)' : 'posted (nowhere)')
}
export const _resetPeriodForTests = () => _periodWait.clear()
