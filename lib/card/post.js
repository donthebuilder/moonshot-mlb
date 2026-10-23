// THE CARD: THE POSTS (X overhaul rules, 2026-10-10; THE MAP, same day). All through the one posting path (lib/dash/longshotsPost
// postOnce: the pause, the daily cap by tier, the repeat guard, the posting log), all tagged in lib/dash/xSchedule.js KIND_TAGS:
//
//   card_<sport>          INFO  X + the sport's free channel, before the first game. Names ONLY the LEAD straight (the highest percentile on its own
//                               board) and, when Donovan entered one before the lock, his Two-Man with his note. The other straights and the bot's
//                               Two-Man are never in it.
//   card_members_<sport>  members  the WHOLE Card and the bot's Two-Man, with each leg's market, stored line and price and one-line why. #members
//                               ONLY, through lib/dash/membersPost.js postMembers (never X, never a free channel; a missing webhook sends nothing).
//   card_result_<sport>   INFO  FREE, after the grade: every leg's outcome, hits and misses alike.
//   card_ls_<sport>       INFO  the LONG SHOT OF THE DAY (a full slate, a stored median price of +550 or longer since 2026-10-20, lib/card/rules.js FLOORS.longShot): X + the sport's free channel, plain and
//                               honest. The ONLY plus-money content that is public. card_ls_result_<sport> posts the next day, wins AND misses.
//   card_don_<sport>[_<key>] INFO  HIS entries (2026-10-12): up to 3 a day and sport, a straight .. a 6-man, each its own claim (key = two_man | n_man | straight_<slot>),
//                               oldest saved first; see postDonovanEntries. The bare card_don_<sport> is the old one-a-day kind, used until 202610121700_card_don_multi.sql runs.
//   card_don_<sport>_n_man_<slot>_result INFO  HIS N-man's RESULT (2026-10-13): one post per graded entry, the graded card (each leg HIT / MISS / VOID, the ticket CASHED only when
//                               every leg hit), only for an entry whose pregame post went out; see postDonovanResults.
//   card_members_day[_2..4] members  THE DAY: one #members briefing at the first lock (every sport's Card, the units exposure, the Double, the Long
//                               Shots), then a follow-up (never an edit) when a later window locks.
//   card_double_result    INFO  the Double's result only (its ticket is #members only). card_today: the one free X line naming only the lead straight.
// No link, no hashtag, never "lock" / "guaranteed" / "nuke", no "winners"; a model chance is never printed (lib/card/text.js). CARD_POSTS_PAUSE=on stops all of them.
import { postOnce } from '../dash/longshotsPost'
import { postMembers, membersWebhook } from '../dash/membersPost'
import { resolveNaming, nflNamingProblem, mlbNamingProblem } from '../dash/namingChecks'
import { easternDate } from '../data'
import { leadStraight, DON_MAX_POSTS } from './core'
import { publicCardRows } from './reveal'
import { xCardText, nManXText, nManResultText, nManResultEmbed, donStraightXText, membersCardText, resultText, membersCardEmbed, resultEmbed, cleanPublic, longShotText, longShotEmbed, longShotResultText, longShotResultEmbed, doubleResultText, doubleResultEmbed, dayEmbed, dayText, todayText, dayLead } from './text'
import { currentPrices } from './store'
import { membersFoldsOn } from '../dash/membersFolds'
import { briefingText, briefingEmbed } from './briefing'
import { straightFrontCard, membersDayImage } from '../cards/alertCard'
import { slabForRow, membersDualImage, donovanDualImage, donovanNManImage, donovanNManResultImage } from '../cards/postImages'
import { primeInjuries } from '../injuries/read'
import { hasX, postToX, postToDiscord } from '../dash/xPost'
import { dayPicks, winKind, winsOff, winsEmbed, winsText, gradedParts, gradedEmbed, gradedText, GRADED_KIND, GRADED_HOUR_ET, WIN_FRESH_MS, MIGRATION as WINS_MIGRATION } from './wins'
import { admit, logPosted } from '../dash/xGate'
import { knownTaken, markTaken, unmarkTaken } from '../dash/postClaim'
import { TUESDAY_KIND, TUESDAY_RESULT_KIND, tuesdayOff, tuesdayText, tuesdayResultText } from './longshotTuesday'

/** The homer_feed_posts kind for each audience and sport (the sport suffix is what lib/dash/xPolicy sportOfKind reads). */
export const CARD_KIND = {
  x: (sport) => `card_${sport}`,
  members: (sport) => `card_members_${sport}`,
  result: (sport) => `card_result_${sport}`,
  don: (sport) => `card_don_${sport}`,                    // HIS entry's own post (2026-10-12): the OLD kind, one claim per day + sport (still used until supabase/migrations/202610121700_card_don_multi.sql is run)
  donEntry: (sport, key) => `card_don_${sport}_${key}`,    // HIS entries, up to 3 a day and sport, one claim EACH: key = two_man | n_man | straight_<slot> (the moment kinds' suffix pattern)
  donResult: (sport, key) => `card_don_${sport}_${key}_result`,    // HIS N-man's RESULT, one claim per graded entry: key = n_man_<slot> (2026-10-13)
  longShot: (sport) => `card_ls_${sport}`,                 // the Long Shot of the day: the sport's free channel (X gets LONGSHOT TUESDAY instead, 2026-10-20)
  longShotResult: (sport) => `card_ls_result_${sport}`,    // its result the next day, wins and misses
  doubleResult: 'card_double_result',                      // the Double's result (free); the ticket itself is #members only
  today: 'card_today',                                     // the one free X line naming the lead straight
  day: (n = 1) => (n <= 1 ? 'card_members_day' : `card_members_day_${n}`),   // THE DAY in #members: the first post, then follow-ups
}
/** THE DAY's kinds in order: the first post and up to three follow-ups (windows that lock later in the day). */
export const DAY_KINDS = [1, 2, 3, 4].map((n) => CARD_KIND.day(n))

export const cardPaused = () => /^(on|1|true)$/i.test(String(process.env.CARD_POSTS_PAUSE || '').trim())

const fail = (id, reason, pending) => ({ id: String(id), reason, pending })

// ── WHO MAY BE NAMED ON X ─────────────────────────────────────────────────────
// The same naming rule as every X post (lib/dash/namingChecks): a definite no is left out, a "not yet" HOLDS the post until 30 minutes
// before the game and then leaves him out. `problems` = Map(player_id -> null | { id, reason, pending }) over EVERY player the sport's
// board lists (a hand-picked Donovan player is checked the same way as a called one); a man the board does not list is a definite no.
const _memo = new Map()
async function remembered(key, ttl, read) {
  const hit = _memo.get(key)
  if (hit && Date.now() - hit.at < ttl) return hit.value
  const value = await read()
  if (_memo.size > 20) _memo.clear()
  _memo.set(key, { at: Date.now(), value })
  return value
}
export const _resetCardPostMemo = () => _memo.clear()

/** Map(player_id -> problem|null) for a sport and day, from the boards the site already reads. A source that fails answers an EMPTY map: nobody is named. */
export async function namingProblems(sport, day) {
  try {
    await primeInjuries([sport])
    return await remembered(`${sport}|${day}`, 5 * 60e3, async () => {
      const m = new Map()
      if (sport === 'nhl') {
        const { readBoard } = await import('../nhl/boardRead')
        const { nhlGoalieProblem } = await import('../nhl/oppGoalie')
        const b = await readBoard(day, { market: 'GOAL', net: true })
        for (const g of b.games || []) for (const r of g.rows || []) {
          const id = String(r.playerId)
          const p = nhlGoalieProblem(g, r, id)
          m.set(id, !p && g.game?.state !== 'pre' ? fail(id, 'game already started', false) : p)
        }
      } else if (sport === 'nfl') {
        const { fetchNfl, nflSlatePaths, nflSlateLooksReal } = await import('../nfl/dataSource')
        const week = await fetchNfl(nflSlatePaths(), nflSlateLooksReal)
        for (const p of week?.players || []) m.set(String(p.player_id), nflNamingProblem(p))
      } else if (sport === 'mlb') {
        const { fetchBoardFull } = await import('../dash/board')
        const rows = await fetchBoardFull('today')
        for (const r of rows || []) if (r?.player_id != null) m.set(String(r.player_id), mlbNamingProblem(r))
      }
      return m
    })
  } catch (e) { console.error(`[card] naming ${sport}: ${e?.message || e}`); return new Map() }
}

/**
 * THE X BUILD, pure. rows = the card's rows (bot + Donovan's once locked). Returns { text, payload, named } or, when a name is not
 * confirmed yet, { text:'', pending, startMs } (the post is HELD). `exclude` = ids the repeat guard says were named too recently.
 */
export function xCardBuild({ sport, day, rows, problems = new Map(), exclude = new Set(), now = Date.now() }) {
  const s1 = leadStraight(rows)      // the lead = the highest percentile on its own board (ties: the scorer slot, then the earlier game)
  const don = (rows || []).find((r) => r.lane === 'donovan' && r.product === 'two_man') || null
  const items = []
  if (s1) items.push({ player_id: String(s1.legs[0].player_id), start: Date.parse(s1.legs[0].start_at) })
  if (don) for (const l of don.legs) items.push({ player_id: String(l.player_id), start: Date.parse(l.start_at) })
  if (!items.length) return { text: '', payload: {}, named: [] }
  // a man whose game has started is never named (the lock was made before it, the post must be too); a man the board does not list is a definite no
  const check = (it) => (it.start <= now ? fail(it.player_id, 'game already started', false) : problems.has(it.player_id) ? problems.get(it.player_id) : fail(it.player_id, 'not on the checked board', false))
  const nr = resolveNaming({ rows: items, check, pickFrom: (rs) => rs, startOf: (r) => r.start, trim: true, now })
  if (nr.state === 'held') return { text: '', payload: {}, named: [], pending: nr.pending, startMs: Math.min(...items.map((i) => i.start)) }
  if (nr.state === 'dropped') return { text: '', payload: {}, named: [] }
  const ok = new Set(nr.picks.map((p) => p.player_id))
  const straight = s1 && ok.has(String(s1.legs[0].player_id)) ? s1.legs[0] : null
  const names = don && don.legs.every((l) => ok.has(String(l.player_id)))
  const donovan = don && names ? { legs: don.legs, note: don.note } : null      // his Two-Man goes out whole (both names cleared) or not at all
  const t = xCardText({ sport, day, straight, donovan, exclude })
  if (!t.text) return { text: '', payload: {}, named: [] }
  const legsNamed = [...(straight ? [straight] : []), ...(names ? don.legs : [])].filter((l) => t.named.includes(String(l.player_id)))
  return {
    text: t.text, named: t.named,
    // only the men the PUBLIC text names (the repeat guard and the posting log read this); the other straights and the bot's two-man are not here
    payload: { card_date: day, sport, picks: legsNamed.map((l) => ({ player_id: String(l.player_id), name: l.name })) },
  }
}

/**
 * THE FREE POST'S PICTURE: straight #1's FRONT card, attached only when the post NAMES him (never the other legs, never a Two-Man, never a
 * man the naming rules left out). No render, or a slow one, and the post goes out as the text it always was. Pure given `front`.
 */
export async function attachStraightFront(b, { sport, day, rows, db = null, front = straightFrontCard }) {
  const s1 = leadStraight(rows)      // the free pick: the same lead the post names (lib/card/reveal.js)
  const id = s1 ? String(s1.legs[0].player_id) : null
  if (!(b?.text && id && (b.named || []).includes(id))) return b
  const png = await front({ sport, id, date: day, db })
  return png ? { ...b, png } : b
}

/**
 * DONOVAN'S TWO-MAN ON THE FREE POST: his dual card (labelled DONOVAN'S TWO-MAN; his note stays in the text) rides the free Card post only when the
 * post NAMES both his men (xCardBuild already required both names to clear) and his lock has passed. Donovan's lane only: the bot's Two-Man
 * is never asked for here. A render that fails, is slow or is switched off (DUAL_CARD_OFF) leaves the post exactly as it was.
 */
export async function attachDonovanDual(b, { sport, day, rows, db = null, now = Date.now(), dual = donovanDualImage }) {
  const don = (rows || []).find((r) => r.lane === 'donovan' && r.product === 'two_man')
  if (!(b?.text && don?.legs?.length === 2 && Date.parse(don.locks_at) <= now)) return b
  const named = new Set((b.named || []).map(String))
  if (!don.legs.every((l) => named.has(String(l.player_id)))) return b
  let png = null
  try { png = await dual({ sport, date: day, db, now }) } catch (e) { console.error(`[card post] donovan dual ${sport}/${day}: ${e?.message || e}`) }
  return png ? { ...b, extraPngs: [...(b.extraPngs || []), png] } : b
}

/**
 * THE MEMBERS POST'S BUILD: the text, the embed and (when it draws) the whole day lineup as `membersImage` and the bot's Two-Man DUAL card as
 * `membersExtraPngs`, which lib/dash/longshotsPost.js sends to the members webhook only (membersOnly) and never to X or a free channel.
 * The dual card goes only when the text names the Two-Man's two men. null when there is no card text.
 */
export async function membersCardBuild({ sport, day, bot, prices, db = null, image = membersDayImage, dual = membersDualImage }) {
  const t = membersCardText({ sport, day, rows: bot, prices })
  if (!t.text) return null
  const two = (bot || []).find((r) => r.lane === 'bot' && r.product === 'two_man')
  const namesTwo = two?.legs?.length === 2 && two.legs.every((l) => l.name && t.text.includes(l.name))
  const [membersImage, membersDual] = await Promise.all([image({ sport, date: day, db }), namesTwo ? Promise.resolve().then(() => dual({ sport, date: day, db })).catch((e) => { console.error(`[card members] dual ${sport}/${day}: ${e?.message || e}`); return null }) : null])
  return {
    text: t.text, payload: t.payload, embed: membersCardEmbed({ sport, day, rows: bot, prices }),
    ...(membersImage ? { membersImage } : {}), ...(membersDual ? { membersExtraPngs: [membersDual] } : {}),
  }
}

/**
 * A RESULT POST'S SLAB: the graded card of one row, with its real outcome and the lane's record. Attached only when the post's own text NAMES
 * every man on the card (`named` = the ids the text names), so the picture never shows a name the post does not. `row` = the graded Card row.
 * Null (the post is its text) on any failure, a row not graded yet, a slow render or SLAB_CARD_OFF.
 */
export async function slabFor(row, named, { db = null, slab = slabForRow, sport = row?.sport } = {}) {
  if (!row || row.result == null || !(row.legs || []).length) return null
  const ids = new Set((named || []).map(String))
  if (!row.legs.every((l) => ids.has(String(l.player_id)))) return null
  try { return (await slab({ sport, date: String(row.card_date).slice(0, 10), lane: row.lane, product: row.product, slot: row.slot, db })) || null } catch (e) { console.error(`[card post] slab ${sport}/${row.product}: ${e?.message || e}`); return null }
}

const hasStarted = (rows, now) => !(rows || []).some((r) => Date.parse(r.start_at) > now)

/** The X pregame post. What happened, as a string for the tick's log. */
export async function postCardX(db, { sport, day, rows, now = Date.now(), dual = donovanDualImage }) {
  if (cardPaused()) return 'paused'
  if (!(rows || []).length) return 'no-card'
  if (hasStarted(rows, now)) return 'too-late'      // a post after the first game has started would be a recap in a pregame voice
  rows = publicCardRows(rows).rows                  // the free post only ever sees the public view of the Card (the lead straight + Donovan's), whoever called it
  // his entry already went out in its OWN post (postDonovan): the card post must not name him a second time
  if (rows.some((r) => r.lane === 'donovan') && (await donovanPostClaimed(db, sport, day))) rows = rows.filter((r) => r.lane !== 'donovan')
  const problems = await namingProblems(sport, day)
  return postOnce(db, {
    day, kind: CARD_KIND.x(sport), sport, envGate: false,
    build: async ({ exclude } = {}) => attachDonovanDual(
      await attachStraightFront(xCardBuild({ sport, day, rows, problems, exclude: exclude || new Set(), now: Date.now() }), { sport, day, rows, db }),
      { sport, day, rows, db, now: Date.now(), dual },
    ),
  })
}

// ── HIS OWN POST (2026-10-12, Donovan: "when I set them they push everywhere: Discord and X") ──────────────────────────────────────────────────
/** Has his TWO-MAN's own post been claimed for this day (the suffixed card_don_<sport>_two_man, or the older one-a-day card_don_<sport> a Two-Man took)? Then the card post leaves him out. */
export async function donovanPostClaimed(db, sport, day) {
  try {
    const { data } = await db.from('homer_feed_posts').select('day,payload').match({ day, kind: CARD_KIND.don(sport) }).maybeSingle()
    if (data && donKeyOfLegacy(data.payload) === 'two_man') return true      // a claim made by his N-man's post (payload.product 'n_man') is not the Two-Man's: the card post still names him
    const { data: multi } = await db.from('homer_feed_posts').select('day').match({ day, kind: CARD_KIND.donEntry(sport, 'two_man') }).maybeSingle()
    return Boolean(multi)
  } catch { return false }
}

/** Both of his men are named in the card post already sent for this day (its payload lists who it named). 'included' | 'wait' | 'open'. */
export async function donovanPostState(db, { sport, day, don, now = Date.now() }) {
  const { data } = await db.from('homer_feed_posts').select('payload').match({ day, kind: CARD_KIND.x(sport) }).maybeSingle()
  if (!data) return now - Date.parse(don.locks_at) < DON_WAIT_MS ? 'wait' : 'open'     // the card post has not been claimed: it will carry him; if it is stuck for 20 minutes, he goes alone
  const named = new Set((data.payload?.picks || []).map((p) => String(p.player_id)))
  return don.legs.every((l) => named.has(String(l.player_id))) ? 'included' : 'open'
}
const DON_WAIT_MS = 20 * 60e3
const _donBlocked = new Map()      // `${sport}|${day}` -> ms before which the SUFFIXED kinds are not tried again (migration 202610121700 not run: kind not allowed)
const _donLegacyBlocked = new Map()      // the same for the OLD kind card_don_<sport> (202610121100 not run): nothing of his can be claimed, nothing is rebuilt

/**
 * HIS TWO-MAN'S POST (kept as the single-entry door; the engine is postDonovanEntries below): his verified Two-Man (both legs, his note, his dual card) when the
 * day's card post did NOT name him, e.g. he saved after it went out. Claim-before-send through postOnce, never a LATE entry. What happened, as a string.
 */
export async function postDonovan(db, { sport, day, rows, now = Date.now(), dual = donovanDualImage, problems = null }) {
  if (cardPaused()) return 'paused'
  const o = await postDonovanEntries(db, { sport, day, rows, now, dual, problems, only: 'two_man' })
  return o.two_man ?? 'no-entry'
}

// ── HIS N-MAN'S POST (2026-10-12, "do up a 6 man with a card too") ──────────────────────────────────────────────────────────────────────────────
/**
 * THE N-MAN X BUILD, pure. `row` = his VERIFIED n_man row. "ADMIN'S 6-MAN: A + B + C + D + E + F" plus his note, whole or not at all: every name must clear the
 * same naming rule as every X post (a definite no, or a name not confirmed yet that runs out of time, means no post, because five men is not his ticket).
 * Returns { text, payload, named } or, while a name is unconfirmed, { text:'', pending, startMs } (HELD).
 */
export function nManBuild({ sport, day, row, problems = new Map(), exclude = new Set(), now = Date.now() }) {
  const legs = row?.legs || []
  if (!legs.length) return { text: '', payload: {}, named: [] }
  const items = legs.map((l) => ({ player_id: String(l.player_id), start: Date.parse(l.start_at) }))
  const check = (it) => (it.start <= now ? fail(it.player_id, 'game already started', false) : problems.has(it.player_id) ? problems.get(it.player_id) : fail(it.player_id, 'not on the checked board', false))
  const nr = resolveNaming({ rows: items, check, pickFrom: (rs) => rs, startOf: (r) => r.start, trim: true, now })
  if (nr.state === 'held') return { text: '', payload: {}, named: [], pending: nr.pending, startMs: Math.min(...items.map((i) => i.start)) }
  if (nr.state === 'dropped') return { text: '', payload: {}, named: [] }
  const ok = new Set(nr.picks.map((p) => p.player_id))
  if (!legs.every((l) => ok.has(String(l.player_id)))) return { text: '', payload: {}, named: [] }
  const t = nManXText({ sport, day, row, exclude })
  if (!t.text) return { text: '', payload: {}, named: [] }
  return { text: t.text, named: t.named, payload: { card_date: day, sport, product: 'n_man', picks: legs.map((l) => ({ player_id: String(l.player_id), name: l.name })) } }
}

/** His N-man card rides his post as the picture, only when the post NAMES every man on it. A render that fails or is slow (or DUAL_CARD_OFF) leaves the post as text. */
export async function attachNManCard(b, { sport, day, row, db = null, now = Date.now(), image = donovanNManImage }) {
  if (!(b?.text && row?.legs?.length)) return b
  const named = new Set((b.named || []).map(String))
  if (!row.legs.every((l) => named.has(String(l.player_id)))) return b
  let png = null
  try { png = await image({ sport, date: day, db, now, slot: Number(row.slot) || 1 }) } catch (e) { console.error(`[card post] n-man card ${sport}/${day}: ${e?.message || e}`) }
  return png ? { ...b, png } : b
}

/** HIS N-MAN'S POST (the single-entry door; the engine is postDonovanEntries): the verified n_man entry, 2 to 6 men, its card. What happened, as a string. */
export async function postDonovanNMan(db, { sport, day, rows, now = Date.now(), image = donovanNManImage, problems = null }) {
  if (cardPaused()) return 'paused'
  const o = await postDonovanEntries(db, { sport, day, rows, now, image, problems, onlyProduct: 'n_man' })
  return Object.values(o)[0] ?? 'no-entry'
}

// ── UP TO 3 POSTS A DAY PER SPORT (2026-10-12, Donovan: "give me 3 post max, ranging from straight to 6man") ──────────────────────────────────────
// Each of his verified entries (a straight, the Two-Man, an N-man of 2 to 6 men) is its OWN post with its OWN claim, because homer_feed_posts is keyed (day, kind):
//   card_don_<sport>_<key>   key = two_man | n_man_<slot> | straight_<slot>   (slots 1..3; one entry per key per sport and day, so the key is stable and unique)
// At most DON_MAX_POSTS a day and sport, the OLDEST saved first (row id); an entry beyond the cap is saved and public on the site, never posted. Before
// supabase/migrations/202610121700_card_don_multi.sql is run the suffixed claim is refused by the kind check: the code then keeps TODAY's behaviour (one post a day and
// sport under the old kind card_don_<sport>, the first entry that gets there) and skips the others with a log line, never rebuilding them every tick.
export { DON_MAX_POSTS }
export const _resetDonovanBlocksForTests = () => { _donBlocked.clear(); _donLegacyBlocked.clear() }
export const MULTI_MIGRATION = 'supabase/migrations/202610121700_card_don_multi.sql'
const DON_PRODUCTS = ['two_man', 'n_man', 'straight']
/** The key of one of his entries inside a kind: two_man | n_man | straight_<slot>. */
export const donKey = (r) => (r?.product === 'straight' ? `straight_${Number(r.slot) || 1}` : r?.product === 'n_man' ? `n_man_${Number(r.slot) || 1}` : r?.product)
/** Which entry an OLD-kind claim (card_don_<sport>) belongs to: its payload says (don_key, or product 'n_man'); anything else is the Two-Man's, as it always was. */
export const donKeyOfLegacy = (payload) => payload?.don_key || (payload?.product === 'n_man' ? 'n_man_1' : 'two_man')
/** His verified entries for the sport-day, OLDEST SAVED FIRST (the row id; else the save time; else Two-Man, N-man, straight). Only lane 'donovan' (never the LATE lane). */
export function donovanEntries(rows) {
  const list = (rows || []).filter((r) => r?.lane === 'donovan' && DON_PRODUCTS.includes(r.product) && (r.legs || []).length)
  const num = (v) => (v == null || v === '' ? NaN : Number(v))
  const t = (v) => Date.parse(v)
  return list.slice().sort((a, b) => {
    if (Number.isFinite(num(a.id)) && Number.isFinite(num(b.id)) && num(a.id) !== num(b.id)) return num(a.id) - num(b.id)
    if (Number.isFinite(t(a.locked_at)) && Number.isFinite(t(b.locked_at)) && t(a.locked_at) !== t(b.locked_at)) return t(a.locked_at) - t(b.locked_at)
    return DON_PRODUCTS.indexOf(a.product) - DON_PRODUCTS.indexOf(b.product) || (Number(a.slot) || 1) - (Number(b.slot) || 1)
  })
}
const claimRow = async (db, day, kind) => {
  try { const { data } = await db.from('homer_feed_posts').select('day,payload').match({ day, kind }).maybeSingle(); return data || null } catch { return null }
}
/** The claims his posts hold for the sport-day: Map(key -> payload), from the suffixed kinds and the old one. */
export async function donovanClaims(db, sport, day, keys) {
  const out = new Map()
  const legacy = await claimRow(db, day, CARD_KIND.don(sport))
  if (legacy) out.set(donKeyOfLegacy(legacy.payload), legacy.payload || {})
  for (const key of keys) { const c = await claimRow(db, day, CARD_KIND.donEntry(sport, key)); if (c) out.set(key, c.payload || {}) }
  return out
}

/** Naming for a whole ticket: every man must clear. -> { ok } | { pending, startMs } (HELD) | { drop } */
function wholeNaming(legs, problems, now) {
  const items = legs.map((l) => ({ player_id: String(l.player_id), start: Date.parse(l.start_at) }))
  const check = (it) => (it.start <= now ? fail(it.player_id, 'game already started', false) : problems.has(it.player_id) ? problems.get(it.player_id) : fail(it.player_id, 'not on the checked board', false))
  const nr = resolveNaming({ rows: items, check, pickFrom: (rs) => rs, startOf: (r) => r.start, trim: true, now })
  if (nr.state === 'held') return { pending: nr.pending, startMs: Math.min(...items.map((i) => i.start)) }
  if (nr.state === 'dropped') return { drop: true }
  const ok = new Set(nr.picks.map((p) => p.player_id))
  return legs.every((l) => ok.has(String(l.player_id))) ? { ok: true } : { drop: true }
}
/** HIS STRAIGHT'S X BUILD, pure: "Straight: A · TEAM vs OPP (market) · CALLED" and his note, whole or not at all. Returns { text, payload, named } or, while a name is unconfirmed, { text:'', pending, startMs } (HELD). */
export function donStraightBuild({ sport, day, row, problems = new Map(), exclude = new Set(), now = Date.now() }) {
  const legs = row?.legs || []
  if (legs.length !== 1) return { text: '', payload: {}, named: [] }
  const n = wholeNaming(legs, problems, now)
  if (n.pending) return { text: '', payload: {}, named: [], pending: n.pending, startMs: n.startMs }
  if (!n.ok) return { text: '', payload: {}, named: [] }
  const t = donStraightXText({ sport, day, row, exclude })
  if (!t.text) return { text: '', payload: {}, named: [] }
  return { text: t.text, named: t.named, payload: { card_date: day, sport, product: 'straight', picks: legs.map((l) => ({ player_id: String(l.player_id), name: l.name })) } }
}
/** His straight's FRONT card rides his post, only when the post names him. A render that fails or is slow leaves the post as text. */
export async function attachDonStraightFront(b, { sport, day, row, db = null, front = straightFrontCard }) {
  const id = row?.legs?.[0] ? String(row.legs[0].player_id) : null
  if (!(b?.text && id && (b.named || []).includes(id))) return b
  let png = null
  try { png = await front({ sport, id, date: day, db }) } catch (e) { console.error(`[card post] donovan straight front ${sport}/${day}: ${e?.message || e}`) }
  return png ? { ...b, png } : b
}

/**
 * ALL OF HIS POSTS FOR ONE SPORT-DAY. `rows` = the VERIFIED rows (the tick passes the card's rows; a LATE row is refused by name). Returns { <key>: what happened }
 * for each of his entries (only one key when `only` names it). The rules, per entry, oldest saved first:
 *   rank >= 3                 over-cap: saved and public on the site, not posted
 *   already claimed           already-posted (a second tick never posts it again)
 *   game started / not locked 'too-late' / 'not-locked-yet'
 *   Two-Man named in the day's card post   'in-card-post' (not posted again); a card post not out yet: 'waits-for-card-post' (20 minutes, then he goes alone)
 *   else postOnce on card_don_<sport>_<key> (claim-before-send; the X cap and the repeat guard are postOnce's, and never suppress his kinds); an X refusal keeps the claim
 */
export async function postDonovanEntries(db, { sport, day, rows, now = Date.now(), dual = donovanDualImage, image = donovanNManImage, front = straightFrontCard, problems: given = null, only = null, onlyProduct = null }) {
  const out = {}
  if (cardPaused()) { for (const e of donovanEntries(rows)) out[donKey(e)] = 'paused'; return out }
  const entries = donovanEntries(rows)
  if (!entries.length) return out
  const claims = await donovanClaims(db, sport, day, entries.map(donKey))
  let problems = given
  const bk = `${sport}|${day}`
  for (let rank = 0; rank < entries.length; rank += 1) {
    const e = entries[rank]
    const key = donKey(e)
    if ((only && key !== only) || (onlyProduct && e.product !== onlyProduct)) continue
    const legsN = (e.legs || []).length
    if (e.product === 'two_man' && legsN !== 2) { out[key] = 'no-entry'; continue }
    if (e.product === 'straight' && legsN !== 1) { out[key] = 'no-entry'; continue }
    if (e.product === 'n_man' && (legsN < 2 || legsN > 6)) { out[key] = 'no-entry'; continue }
    if (rank >= DON_MAX_POSTS) { out[key] = `over-cap (${DON_MAX_POSTS} posts max a day: saved and public, not posted)`; continue }
    if (claims.has(key)) { out[key] = 'already-posted'; continue }
    if (!(Date.parse(e.start_at) > now)) { out[key] = 'too-late'; continue }      // a post after his first game started would be a recap in a pregame voice
    if (Date.parse(e.locks_at) > now) { out[key] = 'not-locked-yet'; continue }
    if (now < (_donLegacyBlocked.get(bk) || 0)) { out[key] = 'waiting (post kind not allowed yet)'; continue }
    if (e.product === 'two_man') {
      const st = await donovanPostState(db, { sport, day, don: e, now })
      if (st === 'included') { out[key] = 'in-card-post'; continue }
      if (st === 'wait') { out[key] = 'waits-for-card-post'; continue }
    }
    // BEFORE the multi migration only one post a day and sport can exist (the old kind): the extra entries wait, with a plain log line, without being rebuilt every tick
    const multiBlocked = now < (_donBlocked.get(bk) || 0)
    if (multiBlocked && (claims.size > 0 || e.product === 'straight')) { out[key] = `skipped: run ${MULTI_MIGRATION} (one post a day and sport until then)`; continue }
    problems ||= await namingProblems(sport, day)
    const only1 = [e]
    const builder = e.product === 'n_man'
      ? async ({ exclude }) => attachNManCard(nManBuild({ sport, day, row: e, problems, exclude, now: Date.now() }), { sport, day, row: e, db, now: Date.now(), image })
      : e.product === 'straight'
        ? async ({ exclude }) => attachDonStraightFront(donStraightBuild({ sport, day, row: e, problems, exclude, now: Date.now() }), { sport, day, row: e, db, front })
        : async ({ exclude }) => attachDonovanDual(xCardBuild({ sport, day, rows: only1, problems, exclude, now: Date.now() }), { sport, day, rows: only1, db, now: Date.now(), dual })
    const memo = new Map()      // a claim refused by the kind check must not render the card a second time for the old kind
    const build = async ({ exclude } = {}) => {
      const ex = exclude || new Set()
      const mk = [...ex].sort().join(',')
      if (!memo.has(mk)) { const b = await builder({ exclude: ex }); memo.set(mk, b?.text ? { ...b, payload: { ...(b.payload || {}), don_key: key } } : b) }
      return memo.get(mk)
    }
    let res = null
    if (!multiBlocked) {
      res = await postOnce(db, { day, kind: CARD_KIND.donEntry(sport, key), sport, envGate: false, build })
      if (res === 'claim-failed') {
        _donBlocked.set(bk, now + 30 * 60e3)
        console.error(`[card post] ${CARD_KIND.donEntry(sport, key)} skipped: the kind is not allowed yet (run ${MULTI_MIGRATION}); until then one post a day and sport goes out under ${CARD_KIND.don(sport)}`)
      }
    }
    if (multiBlocked || res === 'claim-failed') {
      if (claims.size > 0 || e.product === 'straight') { out[key] = `skipped: run ${MULTI_MIGRATION} (one post a day and sport until then)`; continue }
      res = await postOnce(db, { day, kind: CARD_KIND.don(sport), sport, envGate: false, build })
      if (res === 'claim-failed') {
        _donLegacyBlocked.set(bk, now + 30 * 60e3)
        console.error(`[card post] ${CARD_KIND.don(sport)} skipped: the kind is not allowed yet (run supabase/migrations/202610121100_card_calls_late.sql)`)
        out[key] = 'skipped: run the update (kind not allowed yet)'; continue
      }
    }
    out[key] = res
    if (/^(posted|dropped)/.test(res)) claims.set(key, {})      // the next entry of this tick sees the slot as taken
  }
  return out
}

// ── HIS N-MAN'S RESULT (2026-10-13, "post the graded result through the same claim-before-send machinery") ─────────────────────────────────────
/**
 * THE N-MAN RESULT BUILD, pure. `row` = his graded n_man row. { text, named, payload } or { text: '' }. No naming check: the men were named in the entry's own pregame
 * post (postDonovanResults only runs for an entry whose pregame post went out). A row whose legs do not add up to its ticket word, or a leg with no word, says nothing.
 */
export function nManResultBuild({ sport, day, row, key = donKey(row) }) {
  const t = nManResultText({ sport, day, row })
  if (!t.text) return { text: '', payload: {}, named: [] }
  return {
    text: t.text, named: t.named, embed: nManResultEmbed({ sport, day, row }),
    payload: { card_date: day, sport, product: 'n_man', don_key: key, result: row.result, picks: t.named.map((id) => ({ player_id: id, name: row.legs.find((l) => String(l.player_id) === id)?.name })) },
  }
}
/** The graded card rides the result post only when the text NAMES every man on it (so the picture never shows a name the post does not). A render that fails, is slow, or is not graded on file leaves the post as text. */
export async function attachNManResultCard(b, { sport, day, row, db = null, now = Date.now(), image = donovanNManResultImage }) {
  if (!(b?.text && row?.legs?.length)) return b
  const named = new Set((b.named || []).map(String))
  if (!row.legs.every((l) => named.has(String(l.player_id)))) return b
  let png = null
  try { png = await image({ sport, date: day, db, now, slot: Number(row.slot) || 1 }) } catch (e) { console.error(`[card post] n-man result card ${sport}/${day}: ${e?.message || e}`) }
  return png ? { ...b, png } : b
}
/**
 * HIS N-MAN RESULTS FOR ONE SPORT-DAY: for each of his GRADED n_man entries, ONE post on card_don_<sport>_n_man_<slot>_result through postOnce (claim-before-send: a second
 * tick, or a second instance, never posts it again; the pause, the daily cap by tier (the card_don_ write-up tier: counted, never exempt) and the X rules are postOnce's).
 * Only an entry whose own pregame post went out (a claim that is not a drop): an entry the cap left unposted, or a drop, has no result post either (it was never announced).
 * `rows` = the card's rows. Returns { <key>: what happened } for each n_man entry.
 *   not graded yet           'not-graded-yet'     no pregame post  'no-pregame-post'     a result that cannot be said honestly  'not-enough-yet'
 */
export async function postDonovanResults(db, { sport, day, rows, now = Date.now(), image = donovanNManResultImage }) {
  const out = {}
  const entries = donovanEntries(rows).filter((e) => e.product === 'n_man')
  if (!entries.length) return out
  if (cardPaused()) { for (const e of entries) out[donKey(e)] = 'paused'; return out }
  const claims = await donovanClaims(db, sport, day, donovanEntries(rows).map(donKey))
  for (const e of entries) {
    const key = donKey(e)
    if (e.result == null) { out[key] = 'not-graded-yet'; continue }
    const c = claims.get(key)
    if (!c || c.dropped) { out[key] = 'no-pregame-post'; continue }
    const res = await postOnce(db, {
      day, kind: CARD_KIND.donResult(sport, key), sport, envGate: false,
      build: async () => attachNManResultCard(nManResultBuild({ sport, day, row: e, key }), { sport, day, row: e, db, now: Date.now(), image }),
    })
    out[key] = res === 'claim-failed' ? `skipped: run ${MULTI_MIGRATION} (the kind is not allowed yet)` : res
  }
  return out
}

/**
 * WHAT THE ADMIN FORM SHOWS: "Posts today: n of 3" for the sport-day and, per entry, whether it posted. `rows` = his entries (raw card_calls rows; the form passes
 * the on-time ones). Read only. { max, used, entries:[{ key, product, state }] } with state posted | dropped | in-card-post | over-cap | not-yet.
 */
export async function donovanPostsToday(db, { sport, day, rows }) {
  const entries = donovanEntries(rows)
  const claims = await donovanClaims(db, sport, day, entries.map(donKey))
  let cardPicks = null
  const list = []
  for (let rank = 0; rank < entries.length; rank += 1) {
    const e = entries[rank]; const key = donKey(e)
    let state = 'not-yet'
    if (rank >= DON_MAX_POSTS) state = 'over-cap'
    else if (claims.has(key)) state = claims.get(key)?.dropped ? 'dropped' : 'posted'
    else if (e.product === 'two_man') {
      cardPicks ||= new Set(((await claimRow(db, day, CARD_KIND.x(sport)))?.payload?.picks || []).map((p) => String(p.player_id)))
      if (e.legs.every((l) => cardPicks.has(String(l.player_id)))) state = 'in-card-post'
    }
    list.push({ key, product: e.product, state })
  }
  return { max: DON_MAX_POSTS, used: list.filter((x) => x.state === 'posted' || x.state === 'dropped').length, entries: list }
}

/** The #members card: the whole Card, the bot's Two-Man, prices and why. Members webhook only; nothing is claimed without one. */
export async function postCardMembers(db, { sport, day, rows, now = Date.now(), dual = membersDualImage, image = membersDayImage }) {
  if (cardPaused()) return 'paused'
  const bot = (rows || []).filter((r) => r.lane === 'bot')
  if (!bot.length) return 'no-card'
  if (hasStarted(bot, now)) return 'too-late'
  const prices = await currentPrices(db, sport, bot.flatMap((r) => r.legs))
  // MEMBERS_FOLDS_ON (lib/dash/membersFolds.js): the sport's card_members_<sport> row is still claimed and stored, but NOT delivered: its legs, prices and whys are in THE DAY (postDay)
  if (membersFoldsOn()) {
    const res = await postMembers(db, {
      day, kind: CARD_KIND.members(sport), envGate: false,
      build: async () => { const t = membersCardText({ sport, day, rows: bot, prices }); return t.text ? { text: t.text, payload: t.payload, skipDiscord: true } : null },
    })
    return res === 'posted' ? 'posted (folded into THE DAY: recorded, not sent)' : res
  }
  return postMembers(db, {
    day, kind: CARD_KIND.members(sport), envGate: false,
    build: async () => membersCardBuild({ sport, day, bot, prices, db, dual, image }),
  })
}

/** The free result post, once every row of the card is graded: hits and misses alike. */
export async function postCardResult(db, { sport, day, rows: all, slab = slabForRow }) {
  if (cardPaused()) return 'paused'
  const rows = (all || []).filter((r) => r.product !== 'long_shot' && r.product !== 'double' && !(r.lane === 'donovan' && r.product === 'straight'))      // the Long Shot has its own result post; his straights are their own record, not the Card's result
  if (!rows.length || rows.some((r) => r.result == null)) return 'not-graded-yet'
  return postOnce(db, {
    day, kind: CARD_KIND.result(sport), sport, envGate: false,
    build: async () => {
      const t = resultText({ sport, day, rows })
      if (!t.text) return null
      const byId = new Map(rows.flatMap((r) => r.legs).map((l) => [String(l.player_id), l.name]))
      // the slab of the LEAD straight (straight #1, the man the pregame post led with), only when this text names him; no picture otherwise
      const png = await slabFor(rows.find((r) => r.lane === 'bot' && r.product === 'straight' && Number(r.slot) === 1), t.named, { db, sport, slab })
      return { text: t.text, embed: resultEmbed({ sport, day, rows }), ...(png ? { png } : {}), payload: { card_date: day, sport, picks: t.named.map((id) => ({ player_id: id, name: byId.get(id) })) } }
    },
  })
}

// ── THE LONG SHOT OF THE DAY (the one plus-money post that is public) ───────────────────────────────────────────────────
/**
 * The pregame Long Shot post: the sport's free channel (not X since 2026-10-20, see LONGSHOT TUESDAY below), once, before the first game. The same naming rule as every X post (a man whose
 * name is not confirmed HOLDS the post, then leaves it out). Plain and honest: the market, the stored median price, "most of these miss".
 * `row` = the sport's long_shot row. The #members copy rides inside THE DAY, not a post of its own.
 */
export async function postLongShot(db, { sport, day, row, now = Date.now() }) {
  if (cardPaused()) return 'paused'
  if (!row?.legs?.[0]) return 'no-long-shot'
  if (!(Date.parse(row.start_at) > now)) return 'too-late'
  const problems = await namingProblems(sport, day)
  const leg = row.legs[0]
  return postOnce(db, {
    day, kind: CARD_KIND.longShot(sport), sport, envGate: false,
    toX: false,      // LONGSHOT TUESDAY (Donovan, 2026-10-20): the daily long shot is no longer an X post; X gets the one Tuesday post (lib/card/longshotTuesday.js)
    build: async ({ exclude } = {}) => {
      const id = String(leg.player_id)
      const start = Date.parse(leg.start_at)
      if (start <= Date.now()) return { text: '', payload: {}, named: [] }
      const check = () => (problems.has(id) ? problems.get(id) : fail(id, 'not on the checked board', false))
      const nr = resolveNaming({ rows: [{ player_id: id, start }], check, pickFrom: (rs) => rs, startOf: (r) => r.start, trim: true, now: Date.now() })
      if (nr.state === 'held') return { text: '', payload: {}, named: [], pending: nr.pending, startMs: start }
      if (nr.state === 'dropped' || !nr.picks.length) return { text: '', payload: {}, named: [] }
      if ((exclude || new Set()).has(id)) return { text: '', payload: {}, named: [] }
      const t = longShotText({ sport, day, leg })
      if (!t.text || !cleanPublic(t.text)) return { text: '', payload: {}, named: [] }
      return { text: t.text, embed: longShotEmbed({ sport, day, leg }), named: t.named, payload: { card_date: day, sport, picks: [{ player_id: id, name: leg.name }] } }
    },
  })
}

/** The Long Shot's result: the next game day or later (the ET date after its card date), wins AND misses. `rec` = recordOf for the long_shot product. */
export async function postLongShotResult(db, { sport, day, row, rec = null, now = Date.now(), slab = slabForRow }) {
  if (cardPaused()) return 'paused'
  if (!row || row.result == null) return 'not-graded-yet'
  if (!(easternDate(now) > String(row.card_date).slice(0, 10))) return 'waiting-for-tomorrow'
  return postOnce(db, {
    day, kind: CARD_KIND.longShotResult(sport), sport, envGate: false,
    toX: false,      // its X post is gone (LONGSHOT TUESDAY), so its result is not an X post either: the Tuesday result is a reply under the Tuesday post
    build: async () => {
      const t = longShotResultText({ sport, day, row, rec })
      if (!t.text || !cleanPublic(t.text)) return null
      const png = await slabFor(row, [row.legs[0].player_id], { db, sport, slab })      // the Long Shot's slab: its real outcome, and a COUNT (no hit rate, no units) until 300 are graded
      return { text: t.text, embed: longShotResultEmbed({ sport, day, row, rec }), ...(png ? { png } : {}), payload: { card_date: day, sport, picks: [{ player_id: String(row.legs[0].player_id), name: row.legs[0].name }] } }
    },
  })
}

// ── THE DOUBLE: the ticket is members only (inside THE DAY); only its RESULT is public ──────────────────────────────────
export async function postDoubleResult(db, { day, row, slab = slabForRow }) {
  if (cardPaused()) return 'paused'
  if (!row || row.result == null) return 'not-graded-yet'
  return postOnce(db, {
    day, kind: CARD_KIND.doubleResult, sport: 'mlb', envGate: false,
    build: async () => {
      const t = doubleResultText({ day, row })
      if (!t.text || !cleanPublic(t.text)) return null
      const png = await slabFor({ ...row, sport: 'all' }, row.legs.map((l) => l.player_id), { db, slab })
      return { text: t.text, embed: doubleResultEmbed({ day, row }), ...(png ? { png } : {}), payload: { card_date: day, sport: 'all', picks: row.legs.map((l) => ({ player_id: String(l.player_id), name: l.name })) } }
    },
  })
}

// ── THE DAY (#members) ─────────────────────────────────────────────────────────────────────────────────────────────────────
/** The cards of a day already in a posted DAY message: Set('<sport>|<product>|<slot>|<lane>') over the posts' stored payloads. */
export const rowKeyOf = (r) => `${r.sport}|${r.product}|${r.slot}|${r.lane}`

/**
 * THE DAY: one combined #members briefing per game day, at the first lock; a FOLLOW-UP post (never an edit of the first) when a later window
 * locks, showing only the new cards and the running exposure. `rows` = every bot row of the day (cards, long shots, the Double).
 * `posted` = the day posts already out: [{ kind, payload }] (their payload.keys name the rows they showed).
 * Each call posts at most one message and returns what happened.
 */
export async function postDay(db, { day, rows, posted = [], prices = new Map(), now = Date.now() }) {
  if (cardPaused()) return 'paused'
  const bot = (rows || []).filter((r) => Date.parse(r.locks_at) <= now)      // the bot's rows, and Donovan's Double once ITS lock has passed
  if (!bot.some((r) => r.lane === 'bot')) return 'no-card'
  const seen = new Set(posted.flatMap((p) => p.payload?.keys || []))
  const fresh = bot.filter((r) => !seen.has(rowKeyOf(r)))
  if (!fresh.length) return 'nothing-new'
  const n = posted.length + 1
  if (n > DAY_KINDS.length) return 'follow-up-limit'
  const kind = DAY_KINDS[n - 1]
  const update = n > 1
  return postMembers(db, {
    day, kind, envGate: false,
    build: async () => {
      // MEMBERS_FOLDS_ON: THE DAY is the one briefing (every leg with market, line, price and its one-line why, the best looks); a later window is a short "(added)" post of the new legs only
      const folded = membersFoldsOn()
      const text = folded ? briefingText({ day, rows: fresh, all: bot, prices, update }) : dayText({ day, rows: fresh, all: bot, prices, update })
      if (!text) return null
      return { text, payload: { day, keys: fresh.map(rowKeyOf), sports: [...new Set(fresh.map((r) => r.sport))] }, embed: folded ? briefingEmbed({ day, rows: fresh, all: bot, prices, update }) : dayEmbed({ day, rows: fresh, all: bot, prices, update }) }
    },
  })
}

/**
 * The one free X line of the day: "Today's Card: <lead straight>", at the first lock. It names ONLY the day's lead straight (the highest
 * percentile among the sports' leads): no price, no why, no other leg. The same naming rule as every X post.
 * `rowsBySport` = { nhl: [bot rows], ... } of the Cards locked so far.
 */
export async function postToday(db, { day, rowsBySport, now = Date.now() }) {
  if (cardPaused()) return 'paused'
  const leads = dayLead(rowsBySport)
  if (!leads.length) return 'no-card'
  if (!leads.some((l) => Date.parse(l.leg.start_at) > now)) return 'too-late'
  const problemsBy = {}
  for (const l of leads) problemsBy[l.sport] ||= await namingProblems(l.sport, day)
  return postOnce(db, {
    day, kind: CARD_KIND.today, sport: leads[0].sport, envGate: false,
    build: async ({ exclude } = {}) => {
      const ex = exclude || new Set()
      const items = leads.map((l) => ({ player_id: String(l.leg.player_id), start: Date.parse(l.leg.start_at), lead: l }))
      const check = (it) => (it.start <= Date.now() ? fail(it.player_id, 'game already started', false) : problemsBy[it.lead.sport]?.has(it.player_id) ? problemsBy[it.lead.sport].get(it.player_id) : fail(it.player_id, 'not on the checked board', false))
      // the first lead that is cleared, in order; a lead whose name is not confirmed yet HOLDS the post (then is left out), never swapped silently
      const nr = resolveNaming({ rows: items, check, pickFrom: (rs) => rs.slice(0, 1), startOf: (r) => r.start, trim: true, now: Date.now() })
      if (nr.state === 'held') return { text: '', payload: {}, named: [], pending: nr.pending, startMs: Math.min(...items.map((i) => i.start)) }
      if (nr.state === 'dropped' || !nr.picks.length) return { text: '', payload: {}, named: [] }
      const pick = nr.picks[0]
      if (ex.has(pick.player_id)) return { text: '', payload: {}, named: [] }
      const t = todayText({ day, lead: pick.lead })
      if (!t.text || !cleanPublic(t.text)) return { text: '', payload: {}, named: [] }
      return { text: t.text, named: t.named, payload: { card_date: day, picks: [{ player_id: pick.player_id, name: pick.lead.leg.name }] } }
    },
  })
}

// ── LONGSHOT TUESDAY (2026-10-20, lib/card/longshotTuesday.js) ─────────────────────────────────────────────────────────────
/**
 * THE TUESDAY POST: one X post naming each sport's long shot (`legs` = [{ sport, leg }], from tuesdayTiming). The same naming rule as every
 * X post: a man not confirmed HOLDS the post until 30 minutes before his game, then is left out. Each named man's front card rides as a
 * picture (four at most). X only: each sport's free channel already had its long shot.
 */
export async function postLongshotTuesday(db, { day, legs, now = Date.now(), front = straightFrontCard }) {
  if (cardPaused() || tuesdayOff()) return 'paused'
  if (!(legs || []).length) return 'no-long-shot'
  const problemsBy = {}
  for (const l of legs) problemsBy[l.sport] ||= await namingProblems(l.sport, day)
  return postOnce(db, {
    day, kind: TUESDAY_KIND, sport: legs[0].sport, envGate: false,
    build: async ({ exclude } = {}) => {
      const ex = exclude || new Set()
      const items = legs.map((l) => ({ player_id: String(l.leg.player_id), start: Date.parse(l.leg.start_at), l }))
      const check = (it) => (it.start <= Date.now() ? fail(it.player_id, 'game already started', false) : problemsBy[it.l.sport]?.has(it.player_id) ? problemsBy[it.l.sport].get(it.player_id) : fail(it.player_id, 'not on the checked board', false))
      const nr = resolveNaming({ rows: items, check, pickFrom: (rs) => rs, startOf: (r) => r.start, trim: true, now: Date.now() })
      if (nr.state === 'held') return { text: '', payload: {}, named: [], pending: nr.pending, startMs: Math.min(...items.map((i) => i.start)) }
      const picks = nr.state === 'dropped' ? [] : nr.picks.filter((p) => !ex.has(p.player_id))
      if (!picks.length) return { text: '', payload: {}, named: [] }
      const t = tuesdayText({ day, items: picks.map((p) => p.l) })
      if (!t.text) return { text: '', payload: {}, named: [] }
      const named = picks.filter((p) => t.named.includes(p.player_id))
      const pngs = (await Promise.all(named.slice(0, 4).map((p) => front({ sport: p.l.sport, id: p.player_id, date: day, db }).catch(() => null)))).filter(Boolean)
      return {
        text: t.text, named: t.named, skipDiscord: true,
        ...(pngs.length ? { png: pngs[0], extraPngs: pngs.slice(1) } : {}),
        payload: { card_date: day, sport: 'all', picks: named.map((p) => ({ sport: p.l.sport, player_id: p.player_id, name: p.l.leg.name })) },
      }
    },
  })
}

/**
 * THE TUESDAY RESULT: one reply under the Tuesday post, the next ET day or later, once every man it named is graded. `post` = the Tuesday
 * claim row ({ x_post_id, payload.picks }), `rows` = that day's Card rows (every sport). X only; claimed once (homer_feed_posts).
 */
const _tueTries = new Map()   // day -> X refusals of its result reply on this instance (the claim is released at most 3 times)
export async function postLongshotTuesdayResult(db, { day, post, rows, now = Date.now() }) {
  if (cardPaused() || tuesdayOff()) return 'paused'
  if (!post?.x_post_id) return 'no-tuesday-post'
  if (!(easternDate(now) > day)) return 'waiting-for-tomorrow'
  if (!hasX()) return 'no-x'
  if (knownTaken(day, TUESDAY_RESULT_KIND)) return 'already-posted'
  const picks = post.payload?.picks || []
  const items = picks.map((p) => {
    const r = (rows || []).find((x) => x.lane === 'bot' && x.product === 'long_shot' && x.sport === p.sport && String(x.legs?.[0]?.player_id) === String(p.player_id))
    return { sport: p.sport, name: p.name, result: r?.result ?? null }
  })
  if (!items.length || items.some((i) => i.result == null)) return 'not-graded-yet'
  const t = tuesdayResultText({ day, items })
  if (!t.text) return 'no-text'
  const ids = picks.map((p) => String(p.player_id))
  if ((await admit(db, { day, kind: TUESDAY_RESULT_KIND, ids, sport: picks[0].sport, repeat: false })).state !== 'go') return 'held: x gate'
  const { data: claimed, error } = await db.from('homer_feed_posts').upsert([{ day, kind: TUESDAY_RESULT_KIND, payload: {} }], { onConflict: 'day,kind', ignoreDuplicates: true }).select('day')
  if (error) return `claim-failed: ${error.message}`
  markTaken(day, TUESDAY_RESULT_KIND)
  if (!claimed?.length) return 'already-posted'
  const x = await postToX(t.text, { replyTo: String(post.x_post_id), kind: TUESDAY_RESULT_KIND }).catch((e) => ({ ok: false, error: e?.message }))
  if (!(x?.ok && x.id)) {
    // nothing went out: release the claim so the next tick tries again (nothing was sent, so this cannot duplicate)
    const tries = (_tueTries.get(day) || 0) + 1
    _tueTries.set(day, tries)
    if (tries <= 3 && !(await db.from('homer_feed_posts').delete().match({ day, kind: TUESDAY_RESULT_KIND }))?.error) unmarkTaken(day, TUESDAY_RESULT_KIND)
    return `refused: ${x?.status} ${x?.error}`
  }
  logPosted({ day, kind: TUESDAY_RESULT_KIND, ids, tweetId: x.id, text: t.text })
  const saved = await db.from('homer_feed_posts').update({ x_post_id: String(x.id), payload: { card_date: day, picks, results: items } }).match({ day, kind: TUESDAY_RESULT_KIND })
  if (saved?.error) console.error(`[card] tuesday result posted but not recorded: ${saved.error.message}`)
  return 'posted'
}

// ── #MEMBERS WINS AND THE MORNING GRADE (2026-10-23, lib/card/wins.js) ─────────────────────────────────────────────────────────
/**
 * The picks of a day that just graded as hits, in one members post. Each pick is claimed on its own kind first (a pick is never announced twice);
 * a send Discord did not take releases the claims so the next tick tries again, while the pick is still fresh. `rows` = the day's rows (dayRows).
 */
export async function postMembersWins(db, { day, rows, now = Date.now() }) {
  if (winsOff() || cardPaused()) return 'off'
  const hooks = membersWebhook()
  if (!hooks) return 'no-members-webhook'
  const fresh = dayPicks(rows).filter((r) => r.result === 'hit' && now - Date.parse(r.graded_at || '') < WIN_FRESH_MS)
  if (!fresh.length) return 'no-new-hits'
  const kinds = fresh.map(winKind)
  const { data: have, error: readErr } = await db.from('homer_feed_posts').select('kind').eq('day', day).in('kind', kinds)
  if (readErr) return `read-failed: ${readErr.message}`
  const seen = new Set((have || []).map((r) => r.kind))
  const todo = fresh.filter((r) => !seen.has(winKind(r)))
  if (!todo.length) return 'already-posted'
  const claimed = []
  for (const r of todo) {
    const c = await db.from('homer_feed_posts').upsert([{ day, kind: winKind(r), payload: { row: r.id, sport: r.sport, product: r.product } }], { onConflict: 'day,kind', ignoreDuplicates: true }).select('kind')
    if (c.error) { console.error(`[members wins] claim refused (${c.error.message}); run ${WINS_MIGRATION}`); return 'claim-failed' }
    if (c.data?.length) claimed.push(r)
  }
  if (!claimed.length) return 'already-posted'
  const embed = winsEmbed({ day, rows: claimed, at: now })
  const d = await postToDiscord(winsText({ day, rows: claimed }), { embed, kind: winKind(claimed[0]), sportKey: claimed[0].sport === 'all' ? null : claimed[0].sport }, hooks)
  if (!d.ok) {
    await db.from('homer_feed_posts').delete().eq('day', day).in('kind', claimed.map(winKind))
    return `retry: discord ${d.status || 0}`
  }
  await db.from('homer_feed_posts').update({ discord_sent: true }).eq('day', day).in('kind', claimed.map(winKind))
  return `posted ${claimed.length}`
}

/** The morning grade of a game day: every pick, once all are graded, after 8 AM ET, never for a day graded long ago (no backlog on a first deploy). */
export async function postMembersGraded(db, { day, rows, now = Date.now() }) {
  if (winsOff() || cardPaused()) return 'off'
  const picks = dayPicks(rows)
  if (!picks.length) return 'no-card'
  if (picks.some((r) => r.result == null)) return 'not-graded-yet'
  if (!(easternDate(now) > day) || etHourOf(now) < GRADED_HOUR_ET) return 'waiting-for-morning'
  const last = Math.max(...picks.map((r) => Date.parse(r.graded_at || '') || 0))
  if (now - last > 36 * 3600e3) return 'too-old'
  return postMembers(db, {
    day, kind: GRADED_KIND, envGate: false,
    build: async () => { const g = gradedParts(rows); return g ? { text: gradedText({ day, rows }), embed: gradedEmbed({ day, rows, at: now }), payload: { hit: g.hit, of: g.of } } : null },
  })
}
const etHourOf = (ms) => Number(new Date(ms).toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', hour12: false })) % 24
