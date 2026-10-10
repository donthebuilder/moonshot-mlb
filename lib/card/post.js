// THE CARD: THE POSTS (X overhaul rules, 2026-10-10). Three kinds per sport, all through the one posting path (lib/dash/longshotsPost
// postOnce: the pause, the daily cap by tier, the repeat guard, the posting log), all tagged in lib/dash/xSchedule.js KIND_TAGS:
//
//   card_<sport>          INFO  X + the sport's free channel, before the first game. Names ONLY the #1 straight and, when Donovan entered one
//                               before the lock, his Two-Man with his note. The #2 / #3 straights and the bot's Two-Man are never in it.
//   card_members_<sport>  members  the WHOLE Card and the bot's Two-Man, with each leg's stored price and one-line why. #members ONLY, through
//                               lib/dash/membersPost.js postMembers (never X, never a free channel; a missing webhook sends nothing).
//   card_result_<sport>   INFO  FREE, after the grade: every leg's outcome, hits and misses alike.
// No link, no hashtag, never "lock" / "guaranteed", no "winners"; a model chance is never printed (lib/card/text.js). CARD_POSTS_PAUSE=on stops all three.
import { postOnce } from '../dash/longshotsPost'
import { postMembers } from '../dash/membersPost'
import { resolveNaming, nflNamingProblem, mlbNamingProblem } from '../dash/namingChecks'
import { xCardText, membersCardText, resultText } from './text'
import { currentPrices } from './store'

/** The homer_feed_posts kind for each audience and sport (the sport suffix is what lib/dash/xPolicy sportOfKind reads). */
export const CARD_KIND = {
  x: (sport) => `card_${sport}`,
  members: (sport) => `card_members_${sport}`,
  result: (sport) => `card_result_${sport}`,
}

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
  const s1 = (rows || []).find((r) => r.lane === 'bot' && r.product === 'straight' && r.slot === 1) || null
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

const hasStarted = (rows, now) => !(rows || []).some((r) => Date.parse(r.start_at) > now)

/** The X pregame post. What happened, as a string for the tick's log. */
export async function postCardX(db, { sport, day, rows, now = Date.now() }) {
  if (cardPaused()) return 'paused'
  if (!(rows || []).length) return 'no-card'
  if (hasStarted(rows, now)) return 'too-late'      // a post after the first game has started would be a recap in a pregame voice
  const problems = await namingProblems(sport, day)
  return postOnce(db, {
    day, kind: CARD_KIND.x(sport), sport, envGate: false,
    build: async ({ exclude } = {}) => xCardBuild({ sport, day, rows, problems, exclude: exclude || new Set(), now: Date.now() }),
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
    build: async () => { const t = membersCardText({ sport, day, rows: bot, prices }); return t.text ? { text: t.text, payload: t.payload } : null },
  })
}

/** The free result post, once every row of the card is graded: hits and misses alike. */
export async function postCardResult(db, { sport, day, rows }) {
  if (cardPaused()) return 'paused'
  if (!(rows || []).length || rows.some((r) => r.result == null)) return 'not-graded-yet'
  return postOnce(db, {
    day, kind: CARD_KIND.result(sport), sport, envGate: false,
    build: async () => {
      const t = resultText({ sport, day, rows })
      if (!t.text) return null
      const byId = new Map(rows.flatMap((r) => r.legs).map((l) => [String(l.player_id), l.name]))
      return { text: t.text, payload: { card_date: day, sport, picks: t.named.map((id) => ({ player_id: id, name: byId.get(id) })) } }
    },
  })
}
