// THE CARD: THE POSTS (X overhaul rules, 2026-10-10; THE MAP, same day). All through the one posting path (lib/dash/longshotsPost
// postOnce: the pause, the daily cap by tier, the repeat guard, the posting log), all tagged in lib/dash/xSchedule.js KIND_TAGS:
//
//   card_<sport>          INFO  X + the sport's free channel, before the first game. Names ONLY the LEAD straight (the highest percentile on its own
//                               board) and, when Donovan entered one before the lock, his Two-Man with his note. The other straights and the bot's
//                               Two-Man are never in it.
//   card_members_<sport>  members  the WHOLE Card and the bot's Two-Man, with each leg's market, stored line and price and one-line why. #members
//                               ONLY, through lib/dash/membersPost.js postMembers (never X, never a free channel; a missing webhook sends nothing).
//   card_result_<sport>   INFO  FREE, after the grade: every leg's outcome, hits and misses alike.
//   card_ls_<sport>       INFO  the LONG SHOT OF THE DAY (a full slate, a stored median price in +160..+500): X + the sport's free channel, plain and
//                               honest. The ONLY plus-money content that is public. card_ls_result_<sport> posts the next day, wins AND misses.
//   card_members_day[_2..4] members  THE DAY: one #members briefing at the first lock (every sport's Card, the units exposure, the Double, the Long
//                               Shots), then a follow-up (never an edit) when a later window locks.
//   card_double_result    INFO  the Double's result only (its ticket is #members only). card_today: the one free X line naming only the lead straight.
// No link, no hashtag, never "lock" / "guaranteed" / "nuke", no "winners"; a model chance is never printed (lib/card/text.js). CARD_POSTS_PAUSE=on stops all of them.
import { postOnce } from '../dash/longshotsPost'
import { postMembers } from '../dash/membersPost'
import { resolveNaming, nflNamingProblem, mlbNamingProblem } from '../dash/namingChecks'
import { easternDate } from '../data'
import { leadStraight } from './core'
import { xCardText, membersCardText, resultText, membersCardEmbed, resultEmbed, cleanPublic, longShotText, longShotEmbed, longShotResultText, longShotResultEmbed, doubleResultText, doubleResultEmbed, dayEmbed, dayText, todayText, dayLead } from './text'
import { currentPrices } from './store'
import { straightFrontCard, membersDayImage } from '../cards/alertCard'

/** The homer_feed_posts kind for each audience and sport (the sport suffix is what lib/dash/xPolicy sportOfKind reads). */
export const CARD_KIND = {
  x: (sport) => `card_${sport}`,
  members: (sport) => `card_members_${sport}`,
  result: (sport) => `card_result_${sport}`,
  longShot: (sport) => `card_ls_${sport}`,                 // the Long Shot of the day: X + the sport's free channel
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
  const s1 = (rows || []).find((r) => r.lane === 'bot' && r.product === 'straight' && r.slot === 1)
  const id = s1 ? String(s1.legs[0].player_id) : null
  if (!(b?.text && id && (b.named || []).includes(id))) return b
  const png = await front({ sport, id, date: day, db })
  return png ? { ...b, png } : b
}

/**
 * THE MEMBERS POST'S BUILD: the text, the embed and (when it draws) the whole day lineup as `membersImage`, which lib/dash/longshotsPost.js
 * sends to the members webhook only (membersOnly) and never to X or a free channel. null when there is no card text.
 */
export async function membersCardBuild({ sport, day, bot, prices, db = null, image = membersDayImage }) {
  const t = membersCardText({ sport, day, rows: bot, prices })
  if (!t.text) return null
  const membersImage = await image({ sport, date: day, db })
  return { text: t.text, payload: t.payload, embed: membersCardEmbed({ sport, day, rows: bot, prices }), ...(membersImage ? { membersImage } : {}) }
}

const hasStarted = (rows, now) => !(rows || []).some((r) => Date.parse(r.start_at) > now)

/** The X pregame post. What happened, as a string for the tick's log. */
export async function postCardX(db, { sport, day, rows, now = Date.now() }) {
  if (cardPaused()) return 'paused'
  if (!(rows || []).length) return 'no-card'
  if (hasStarted(rows, now)) return 'too-late'      // a post after the first game has started would be a recap in a pregame voice
  const problems = await namingProblems(sport, day)
  return postOnce(db, {
    day, kind: CARD_KIND.x(sport), sport, envGate: false,
    build: async ({ exclude } = {}) => attachStraightFront(xCardBuild({ sport, day, rows, problems, exclude: exclude || new Set(), now: Date.now() }), { sport, day, rows, db }),
  })
}

/** The #members card: the whole Card, the bot's Two-Man, prices and why. Members webhook only; nothing is claimed without one. */
export async function postCardMembers(db, { sport, day, rows, now = Date.now() }) {
  if (cardPaused()) return 'paused'
  const bot = (rows || []).filter((r) => r.lane === 'bot')
  if (!bot.length) return 'no-card'
  if (hasStarted(bot, now)) return 'too-late'
  const prices = await currentPrices(db, sport, bot.flatMap((r) => r.legs))
  return postMembers(db, {
    day, kind: CARD_KIND.members(sport), envGate: false,
    build: async () => membersCardBuild({ sport, day, bot, prices, db }),
  })
}

/** The free result post, once every row of the card is graded: hits and misses alike. */
export async function postCardResult(db, { sport, day, rows: all }) {
  if (cardPaused()) return 'paused'
  const rows = (all || []).filter((r) => r.product !== 'long_shot' && r.product !== 'double')      // the Long Shot has its own result post
  if (!rows.length || rows.some((r) => r.result == null)) return 'not-graded-yet'
  return postOnce(db, {
    day, kind: CARD_KIND.result(sport), sport, envGate: false,
    build: async () => {
      const t = resultText({ sport, day, rows })
      if (!t.text) return null
      const byId = new Map(rows.flatMap((r) => r.legs).map((l) => [String(l.player_id), l.name]))
      return { text: t.text, embed: resultEmbed({ sport, day, rows }), payload: { card_date: day, sport, picks: t.named.map((id) => ({ player_id: id, name: byId.get(id) })) } }
    },
  })
}

// ── THE LONG SHOT OF THE DAY (the one plus-money post that is public) ───────────────────────────────────────────────────
/**
 * The pregame Long Shot post: X + the sport's free channel, once, before the first game. The same naming rule as every X post (a man whose
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
export async function postLongShotResult(db, { sport, day, row, rec = null, now = Date.now() }) {
  if (cardPaused()) return 'paused'
  if (!row || row.result == null) return 'not-graded-yet'
  if (!(easternDate(now) > String(row.card_date).slice(0, 10))) return 'waiting-for-tomorrow'
  return postOnce(db, {
    day, kind: CARD_KIND.longShotResult(sport), sport, envGate: false,
    build: async () => {
      const t = longShotResultText({ sport, day, row, rec })
      if (!t.text || !cleanPublic(t.text)) return null
      return { text: t.text, embed: longShotResultEmbed({ sport, day, row, rec }), payload: { card_date: day, sport, picks: [{ player_id: String(row.legs[0].player_id), name: row.legs[0].name }] } }
    },
  })
}

// ── THE DOUBLE: the ticket is members only (inside THE DAY); only its RESULT is public ──────────────────────────────────
export async function postDoubleResult(db, { day, row }) {
  if (cardPaused()) return 'paused'
  if (!row || row.result == null) return 'not-graded-yet'
  return postOnce(db, {
    day, kind: CARD_KIND.doubleResult, sport: 'mlb', envGate: false,
    build: async () => {
      const t = doubleResultText({ day, row })
      if (!t.text || !cleanPublic(t.text)) return null
      return { text: t.text, embed: doubleResultEmbed({ day, row }), payload: { card_date: day, sport: 'all', picks: row.legs.map((l) => ({ player_id: String(l.player_id), name: l.name })) } }
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
      const text = dayText({ day, rows: fresh, all: bot, prices, update })
      if (!text) return null
      return { text, payload: { day, keys: fresh.map(rowKeyOf), sports: [...new Set(fresh.map((r) => r.sport))] }, embed: dayEmbed({ day, rows: fresh, all: bot, prices, update }) }
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
