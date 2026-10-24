// #MEMBERS LIVE CHECK (2026-10-23, Donovan: "once an event happens and it was ... on today's picks, add like a little checker ... the player
// name with a check mark ... just some like a confirmation"). The moment a player on THE DAY's members picks does the thing his leg needs (a
// homer, a touchdown, a goal), #members gets one short line: "✅ Junior Caminero homered · The Double, 1 of 2 in". It reads the events the live
// ticks already store (no new feed, no new poll: one select per sport per card tick, only while a pick is open):
//   MLB homer_feed (player_id + game_pk) · NFL nfl_td_feed (gsis_id = the scorer + game_id) · NHL lamp_goal_feed (confirmed, not overturned,
//   not a shootout goal: shootout goals are not goals for props)
// Only yes/no legs (anytime HR / TD / goal). A volume leg (yards, points: a stored `line`) waits for the final box, which the WINS post covers.
// A straight or long shot that hits here claims its WINS kind (lib/card/wins.js winKind), so the graded WINS post never repeats it; a Two-Man /
// Double leg claims its own kind (card_members_leg_<sport>_<product>_<slot>_<leg>, supabase/migrations/202610240100_members_leg_kinds.sql).
// Plain words, members only, no units, no status tags (CLAUDE.md #members rule). MEMBERS_WINS_OFF=on turns it off with the wins.
import { dayPicks, winKind } from './wins.js'
import { who } from './plain.js'

export const LEG_FRESH_MS = 6 * 3600e3          // an event older than this is not announced (no backlog on a first deploy)
export const MIGRATION = 'supabase/migrations/202610240100_members_leg_kinds.sql'
const fin = (v) => v != null && v !== '' && Number.isFinite(Number(v))

/** Each sport's stored events: which table, which columns are the player and the game, when it was seen, and its words. */
export const EVENT_SOURCE = {
  mlb: { table: 'homer_feed', pid: 'player_id', gid: 'game_pk', seen: 'seen_at', cols: 'player_id, game_pk, seen_at, inning', word: 'homered', ok: () => true },
  nfl: { table: 'nfl_td_feed', pid: 'gsis_id', gid: 'game_id', seen: 'seen_at', cols: 'gsis_id, game_id, seen_at, quarter, clock', word: 'scored a TD', ok: () => true },
  nhl: {
    table: 'lamp_goal_feed', pid: 'player_id', gid: 'game_id', seen: 'first_seen_at',
    cols: 'player_id, game_id, first_seen_at, confirmed_at, overturned_at, period_type', word: 'scored',
    ok: (e) => Boolean(e.confirmed_at) && !e.overturned_at && String(e.period_type || '').toUpperCase() !== 'SO',
  },
}

const legSport = (row, leg) => (row.sport === 'all' ? leg.sport : row.sport)
/** A leg the live feed can settle: a yes/no leg (no stored line) in a sport whose events are stored. */
export const liveLeg = (row, leg) => Boolean(leg?.player_id) && !fin(leg.line) && Boolean(EVENT_SOURCE[legSport(row, leg)])
export const legKind = (row, i) => `card_members_leg_${row.sport}_${row.product}_${row.slot}_${i + 1}`
/** The claim for one leg's line: a one-leg pick's line IS its win (so the graded WINS post skips it); a two-leg pick's leg has its own. */
export const claimKind = (row, i) => (row.legs.length === 1 ? winKind(row) : legKind(row, i))

const PRODUCT_WORD = { straight: 'today’s pick', long_shot: 'the Long Shot', two_man: 'the Two-Man', double: 'The Double' }

/** One line: "✅ Junior Caminero homered · The Double, 1 of 2 in". `done` = how many of the pick's legs are in, this one included. */
export function legLine(row, leg, done) {
  const word = EVENT_SOURCE[legSport(row, leg)]?.word || 'hit'
  const tail = row.legs.length > 1 ? `${PRODUCT_WORD[row.product] || 'a pick'}, ${done === row.legs.length ? 'both in ✅' : `${done} of ${row.legs.length} in`}` : PRODUCT_WORD[row.product] || 'a pick'
  return `✅ **${who(leg)}** ${word} · ${tail}`
}

/** The day's open members legs the feed can settle: [{ row, leg, i, sport }]. */
export function openLegs(rows) {
  const out = []
  for (const r of dayPicks(rows)) {
    if (r.result != null) continue
    r.legs.forEach((leg, i) => { if (liveLeg(r, leg)) out.push({ row: r, leg, i, sport: legSport(r, leg) }) })
  }
  return out
}

/** Which of those legs have their event in the stored feed: a Set of `${sport}|${player}|${game}` keys, plus each event's seen time. */
export async function eventsFor(db, legs) {
  const hit = new Map()
  for (const [sport, src] of Object.entries(EVENT_SOURCE)) {
    const mine = legs.filter((x) => x.sport === sport)
    if (!mine.length) continue
    const pids = [...new Set(mine.map((x) => String(x.leg.player_id)))]
    const gids = [...new Set(mine.map((x) => String(x.leg.game_id)).filter(Boolean))]
    let q = db.from(src.table).select(src.cols).in(src.pid, pids)
    if (gids.length) q = q.in(src.gid, gids)
    const { data, error } = await q
    if (error) { console.error(`[members legs] ${src.table}: ${error.message}`); continue }
    for (const e of data || []) {
      if (!src.ok(e)) continue
      const k = `${sport}|${e[src.pid]}|${e[src.gid]}`
      const t = Date.parse(e[src.seen] || '') || 0
      if (!hit.has(k) || t < hit.get(k)) hit.set(k, t)       // his FIRST event in that game
    }
  }
  return hit
}
export const legKey = (x) => `${x.sport}|${x.leg.player_id}|${x.leg.game_id}`

/** The text of one pass: one line per newly-in leg. */
export function legsText(items) {
  return items.map((x) => legLine(x.row, x.leg, x.done)).join('\n')
}
