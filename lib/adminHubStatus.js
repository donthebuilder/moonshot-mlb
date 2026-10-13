// THE ADMIN HUB'S STATUS LINES (2026-10-12). READ-ONLY: every query here is a select or a count. Server-only; the caller (app/admin/page.js) has
// already passed the admin gate. What comes out is words and numbers only: no email, no id, no URL, no token, no env value.
// A reader that fails is `null` for its line (the hub says "unavailable"), never a throw.
import { CARD_SPORTS, CARD_VERSIONS, LATE_LANE } from './card/core'
import { cardRevealed } from './card/reveal'
import { CARD_KIND } from './card/post'
import { xPostsToday } from './dash/xBudget'
import { X_POLICY } from './dash/xPolicy'
import { easternToday, shiftDay } from './data'
import { safeShaPrefix } from './adminHub.js'
import { bucketsOpen } from './openSwitch.js'
import { nbaOddsCapture } from './odds/snap'
import { NBA_MIN_NIGHTS } from './record/nbaFloor'

const REAL_X_ID = /^\d+$/

/**
 * One sport's Card, in the hub's words. PURE. `rows` = card_calls rows, `posts` = homer_feed_posts rows ({ day, kind, x_post_id }).
 * Picks the newest card_date of that sport that has a row.
 * -> { sport, card_date, locked, posted, reveal, donovan, donovan_posted } with donovan = 'verified' | 'LATE' | 'none'.
 */
export function cardLine(sport, rows, posts) {
  const mine = (rows || []).filter((r) => r && r.sport === sport && r.product !== 'double')
  const date = mine.map((r) => r.card_date).sort().pop() || null
  if (!date) return { sport, card_date: null, locked: false, posted: false, reveal: null, donovan: 'none', donovan_posted: false }
  const day = mine.filter((r) => r.card_date === date)
  const sentX = (kind) => (posts || []).some((p) => p && p.day === date && p.kind === kind && REAL_X_ID.test(String(p.x_post_id || '')))
  const donovan = day.some((r) => r.lane === 'donovan') ? 'verified' : day.some((r) => r.lane === LATE_LANE) ? 'LATE' : 'none'
  return {
    sport, card_date: date,
    locked: day.some((r) => r.lane === 'bot'),
    posted: sentX(CARD_KIND.x(sport)),
    reveal: cardRevealed(day) ? 'revealed' : 'held',
    donovan,
    donovan_posted: sentX(CARD_KIND.don(sport)),
  }
}

/**
 * BUCKETS (NBA) IN THE HUB'S WORDS. PURE. `open` = the public switch, `capture` = NBA_ODDS_CAPTURE, the rest are counts the reader found (null = could not be read).
 * -> { state, capture, nights, floor, lanes, oddsGames } with state 'public' | 'hidden', all words and numbers: no email, no id.
 */
export function bucketsLine({ open = false, capture = false, nights = null, lanes = null, oddsGames = null } = {}) {
  const n = Number.isFinite(nights) ? nights : null
  return {
    state: open ? 'public' : 'hidden', capture: Boolean(capture), nights: n, floor: NBA_MIN_NIGHTS,
    floorWords: n == null ? 'unavailable' : n >= NBA_MIN_NIGHTS ? `${n} graded regular-season nights (the ${NBA_MIN_NIGHTS}-night floor is met)` : `${n} of ${NBA_MIN_NIGHTS} graded regular-season nights (still tracking)`,
    lanes: Number.isFinite(lanes) ? lanes : null, oddsGames: Number.isFinite(oddsGames) ? oddsGames : null,
  }
}

const newest = async (q) => { try { const { data, error } = await q; return error ? null : data?.[0] || null } catch { return null } }

/** { day, cards:[cardLine x3]|null, x:{used,cap}|null, activity:{ x_post, push, card_lock: ISO|null }, build: 7 chars|null } */
export async function readHubStatus(db) {
  const day = easternToday()
  const out = { day, cards: null, x: null, activity: { x_post: null, push: null, card_lock: null }, buckets: bucketsLine({ open: bucketsOpen(), capture: nbaOddsCapture() }), build: safeShaPrefix(process.env.VERCEL_GIT_COMMIT_SHA) }
  if (!db) return out
  const from = shiftDay(day, -2)
  await Promise.all([
    (async () => {
      try {
        const [cr, pr] = await Promise.all([
          db.from('card_calls').select('sport,card_date,lane,product,result').in('model_version', CARD_VERSIONS).gte('card_date', from).limit(400),
          db.from('homer_feed_posts').select('day,kind,x_post_id').gte('day', from).like('kind', 'card_%').limit(400),
        ])
        if (cr.error) return
        out.cards = CARD_SPORTS.map((s) => cardLine(s, cr.data, pr.error ? [] : pr.data))
      } catch { /* the line says unavailable */ }
    })(),
    // BUCKETS: counts only (a count is never a name). Each read is its own try: a missing table (SQL not run) is `unavailable`, never a throw.
    (async () => {
      const count = async (q) => { try { const r = await q; return r.error ? null : r.count } catch { return null } }
      const [games, lanes, odds] = await Promise.all([
        (async () => { try { const r = await db.from('buckets_games').select('game_date').not('graded_at', 'is', null).neq('season_type', 1).limit(5000); return r.error ? null : new Set((r.data || []).map((g) => g.game_date)).size } catch { return null } })(),
        count(db.from('numerology_lane_nights').select('day', { count: 'exact', head: true }).eq('sport', 'nba')),
        count(db.from('odds_events').select('event_id', { count: 'exact', head: true }).eq('sport', 'nba').not('event_id', 'like', 'listed:%')),
      ])
      out.buckets = bucketsLine({ open: bucketsOpen(), capture: nbaOddsCapture(), nights: games, lanes, oddsGames: odds })
    })(),
    (async () => { try { out.x = { used: await xPostsToday(db, day), cap: X_POLICY.dailyCap } } catch { /* unavailable */ } })(),
    (async () => { out.activity.x_post = (await newest(db.from('homer_feed_posts').select('seen_at').not('seen_at', 'is', null).order('seen_at', { ascending: false }).limit(1)))?.seen_at || null })(),
    (async () => { out.activity.push = (await newest(db.from('dash_push_log').select('at').order('at', { ascending: false }).limit(1)))?.at || null })(),
    (async () => { out.activity.card_lock = (await newest(db.from('card_calls').select('locked_at').eq('lane', 'bot').not('locked_at', 'is', null).order('locked_at', { ascending: false }).limit(1)))?.locked_at || null })(),
  ])
  return out
}
