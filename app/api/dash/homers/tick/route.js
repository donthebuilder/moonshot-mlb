// THE HOMER FEED CRON — every home run, on the record, within a minute.
//
// 2026-09-05. Donovan: "the X account will help with getting the site out
// there — people keep telling me to drop the site." This is the public half
// of the push sender: the same live slate, the same board, the same
// insert-and-see-what-stuck dedupe — but it keeps EVERY homer instead of only
// the followed ones, writes each to homer_feed, and posts it with a card.
//
// The rules it inherits from app/api/dash/push/tick, unchanged:
//
//   1. NEW EVENTS ONLY, ATOMICALLY. The insert into homer_feed is ON CONFLICT
//      DO NOTHING; the rows that stick are the new homers. Two overlapping
//      runs cannot both post the same ball.
//   2. EVERYTHING ON THE ROW IS FROZEN AT FIRST SIGHT. Role, rank, price,
//      stats, hook lines — all copied when the homer is seen. A later slate
//      rebuild, odds move or pair-file refresh changes nothing about what was
//      said. The card can be re-rendered from the row alone, forever.
//   3. IT NEVER FAILS LOUDLY. No config → counted no-op. X refuses → the row
//      stays unposted and the next tick retries it. A cron that throws is a
//      cron that stops running.
//
// WHAT IT POSTS, AND WHERE. Every homer goes to Discord and to X (Donovan:
// "all HRs go on X, we are making a tracker"). X_POST_MODE=flagged narrows X
// to the bot's own homers if the quota ever bites. At the end of the night,
// once every game is settled, one recap post with its own card.
//
// THE THREE PUBLISHED FILES are read at most once per ten minutes per
// instance: the FULL board (the slimmed sender copy drops the stats the card
// prints), the odds file, and the pair-history summary.

import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'

import { easternToday } from '../../../../../lib/data'
import { fetchLiveSlate, liveSlateStatus } from '../../../../../lib/liveSlate'
import { fetchBoardFull, fetchRunMeta } from '../../../../../lib/dash/board'
import { oddsPaths, pairSummaryPaths } from '../../../../../lib/dataSource'
import { accountabilityText, boardIndexFrom, boardRolePicks, boardRoleResultsText, boardRoleText, botPollText, boxLinesForDate, captureFrom, communityPickText, roleWord, homersFrom, hooksFor, longshotPick, longshotText, monthlyText, numerologyMoment, numerologyText, pairsToWatch, pairsToWatchText, partnerFor, postText, pregameCalled, pregamePicks, pregameText, topStreakFrom, weeklyText } from '../../../../../lib/dash/homerFeed'
import { homerCard, longshotCard, numerologyCard, pairsCard, pregameCard, recapCard, statCard } from '../../../../../lib/dash/homerCard'
import {
  backToBackPicks, backToBackText, bestAirPicks, bestAirText, callOfTheNightPick, callOfTheNightText,
  careerVsStarterPicks, careerVsStarterText, dangerComboPicks, dangerComboText, fetchWeekdayHrLeaders, funFactsPicks, funFactsText,
  hottestContactPicks, hottestContactText, hrLeadersByDowText, hrVsStarterPicks, hrVsStarterText, liveIndexFrom, matchupLinesPicks, matchupLinesText,
  milestonePicks, milestoneText, playableRows, revengeGiveawayPicks, revengeGiveawayText, storylinesPicks, storylinesText, storylineWatchPicks, storylineWatchText,
  streaksPick, streaksText, theFourPicks, theFourText, vsPitcherCareerLines,
} from '../../../../../lib/dash/tweetFeed'
import { discordFailuresSnapshot, hasX, postToDiscord, postToX, uploadImageToX, xProblem } from '../../../../../lib/dash/xPost'
import { isMaintenanceMode } from '../../../../../lib/edgeConfig'
import { backfillOneNight } from '../../../../../lib/dash/homerBackfill'
import { logXBudget } from '../../../../../lib/dash/xBudget'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
const CALLED_URL = SITE ? `${SITE}/called` : ''
const SITE_HOST = SITE.replace(/^https?:\/\//, '') || 'dashnetwork.vercel.app'
const HANDLE = String(process.env.X_HANDLE || '').trim()          // e.g. "@dashnetwork" — optional
// NO URL IN THE POST TEXT (2026-09-05). X's pay-per-use pricing: a post is
// $0.015, a post CONTAINING A URL is $0.200 — thirteen times the price for a
// link that already sits in the account's bio. The card and Discord embeds
// still carry the page; the tweet text does not. `site` is passed empty to
// every text builder for that reason. Set X_POST_LINK=1 to put it back if X
// ever changes the rule.
const TAIL = process.env.X_POST_LINK === '1' ? { site: CALLED_URL, handle: HANDLE } : { site: '', handle: '' }
const MODE = /^flagged$/i.test(String(process.env.X_POST_MODE || '')) ? 'flagged' : 'all'
// X's Basic tier is ~1,100 posts a month. Override with X_MONTHLY_CAP if the
// plan changes; this number is only ever used to decide when to shout.
const X_MONTHLY_CAP = Number(process.env.X_MONTHLY_CAP || 1100) || 1100
// Discord is optional — Donovan hasn't webhooked it yet. Without this gate,
// EVERY row ever seen sits at discord_sent=false forever (postToDiscord
// no-ops with no webhook and never sets it true), so "pending" — ordered
// oldest-first, LIMIT 12 — fills up on the same permanently-Discord-pending
// rows every single tick and never reaches a real new homer once a night
// has more than 12. Found 2026-09-05: 12 old rows jammed the queue and the
// night's 13th+ homers (Stowers, De La Cruz, Schwarber, Caminero) never got
// an X post despite already having x_post_id null and wanting one.
const DISCORD_ON = Boolean(process.env.DISCORD_HOMER_WEBHOOK)
const cardUrl = (row) => (SITE ? `${SITE}/api/dash/homers/card?day=${row.day}&pid=${row.player_id}&n=${row.hr_n}` : null)
const recapUrl = (day) => (SITE ? `${SITE}/api/dash/homers/card?day=${day}&recap=1` : null)
const pregameUrl = (day) => (SITE ? `${SITE}/api/dash/homers/card?day=${day}&pregame=1` : null)

// STAT-FEED CLAIM + POST (2026-09-07). Same claim-then-post shape as the
// pairswatch/longshot blocks below -- claim (day, kind) in homer_feed_posts
// ONLY once there is real text to post (the lesson from the pregame-post
// bug documented further down: claiming before validating burns the day's
// slot on one bad minute with nothing to show for it) -- factored out
// because five stat-feed posts would otherwise repeat it five times.
// EVERY SCHEDULED POST GOES TO THE DISCORDS (2026-09-07, Donovan: "those new
// tweets can go to the discords too" -> then "those last two need to be wider
// and same with those other tweets"). The homer feed's own webhook plus the
// general MLB channels lib/dash/discordAlerts.js already posts to, deduped so
// a URL that appears in both env vars gets one message and not two.
//
// Used by every ONCE-A-DAY post: pregame, pairswatch, longshot, the five stat
// slots, numerology, recap, weekly, monthly. The one call site left on the
// bare homer webhook is the PER-HOMER alert at the bottom of this file -- 30+
// messages a night is a firehose people opt into, and dropping it into a
// general channel would drown everything else posted there. Change that one
// line if the wide channels should carry it too.
const FEED_WEBHOOKS = () => {
  const seen = new Set()
  return [process.env.DISCORD_HOMER_WEBHOOK, process.env.DISCORD_MLB_WEBHOOKS]
    .flatMap((v) => String(v || '').split(/[,\n]/))
    .map((x) => x.trim())
    .filter((x) => x && !seen.has(x) && seen.add(x))
    .join(',')
}

// ── THE ONE CLAIM SITE ──────────────────────────────────────────────────────
//
// Every once-a-day post claims its (day, kind) row the same way: upsert with
// ignoreDuplicates, and if the row came back it is yours to post. This used to
// be written out longhand at six call sites, and five of them read only `data`
// and threw `error` away.
//
// That silence is not theoretical. homer_feed_posts_kind_check allowed only
// pregame/recap/weekly until 2026-09-07, while the code posted under monthly,
// pairswatch, longshot and numerology too. Every claim under those four kinds
// failed the constraint, returned `error`, inserted nothing, and nobody heard
// about it -- for a full day, across four post types, with the route still
// answering 200. Only when the table was read directly did it surface.
//
// So there is one function now, and it checks the error. A claim that cannot
// be written says so in the log and returns false; a kind the database refuses
// can never again look identical to a slow news night.
async function claimSlot(db, day, kind) {
  const { data, error } = await db
    .from('homer_feed_posts')
    .upsert([{ day, kind, payload: {} }], { onConflict: 'day,kind', ignoreDuplicates: true })
    .select('day')
  if (error) { console.error(`[homers] ${kind} claim failed: ${error.message}`); return false }
  return Boolean(data?.length)
}

// `payload` (2026-09-15, matchup-history posts): every other caller leaves
// this at the default `{}` -- claimAndPostStat has never persisted anything
// beyond the claim itself. The two new matchup-history kinds are the first
// that need a later tick to read back WHO got named (the late wave's
// exclude-set, see matchupHistorySeenIds below), so this is now a real
// parameter instead of a hardcoded literal. Optional and additive: every
// existing call site is unaffected.
async function claimAndPostStat(db, day, kind, hourGate, text, card, payload = {}) {
  if (!text || etHoursSinceNoon() < hourGate) return false
  if (!(await claimSlot(db, day, kind))) return false
  const patch = { payload }
  // ONE RENDER, BOTH PLACES (2026-09-07). The card used to be built inside the
  // `hasX()` branch, below Discord, so Discord got bare text while a finished
  // PNG existed a few lines later -- and on a night with X off it was never
  // built at all. Now it is rendered once, up front, and both take it.
  const png = card ? await bytesOf(() => statCard(day, card, { site: SITE_HOST })) : null
  const d = await postToDiscord(text, { png }, FEED_WEBHOOKS())
  if (d.ok) patch.discord_sent = true
  if (hasX()) {
    const mediaId = png ? await uploadImageToX(png) : null
    const r = await postToX(text, { mediaId })
    if (r.ok && r.id) patch.x_post_id = r.id
    else console.error(`[homers] ${kind} refused: ${r.status} ${r.error}`)
  }
  await db.from('homer_feed_posts').update(patch).match({ day, kind })
  return true
}

// WHO THE DAY WAVE ALREADY NAMED (2026-09-15). Reads both matchup-history
// kinds' payloads back -- claimAndPostStat now writes { picks } for these two
// (see the `payload` param above) -- so the late wave can exclude them and
// surface different names for the later games instead of repeating the same
// handful. Best-effort: a read failure just means the late wave doesn't
// exclude anyone, never that it fails to post.
async function matchupHistorySeenIds(db, day) {
  try {
    const { data } = await db.from('homer_feed_posts').select('payload').eq('day', day).in('kind', ['matchup_hr', 'matchup_career'])
    const out = new Set()
    for (const row of data || []) {
      for (const p of row?.payload?.picks || []) {
        const id = String(p?.player_id || '').trim()
        if (id) out.add(id)
      }
    }
    return out
  } catch {
    return new Set()
  }
}

// WHO THE AM MILESTONE POST ALREADY NAMED (2026-09-15). Same shape as
// matchupHistorySeenIds just above, one kind instead of two -- lets the
// mid-day milestone post surface a different set of players instead of
// repeating the morning's names.
async function milestoneSeenIds(db, day) {
  try {
    const { data } = await db.from('homer_feed_posts').select('payload').eq('day', day).eq('kind', 'milestone_am')
    const out = new Set()
    for (const row of data || []) {
      for (const p of row?.payload?.picks || []) {
        const id = String(p?.player_id || '').trim()
        if (id) out.add(id)
      }
    }
    return out
  } catch {
    return new Set()
  }
}

// EVERY LINE SAID SO FAR TODAY (2026-09-15, Donovan: "makesure not srepat
// info,ations" -- the "never repeat information" rule spanning funfacts,
// matchuplines and all four Storyline Watch slots). Unlike the two exclude
// helpers above, this one keys on exact posted TEXT rather than a player id,
// because a matchup-line or fun fact is the sentence itself, not a player --
// two different sentences about the same player are fine, the same sentence
// twice is the thing being guarded against. funfacts/matchuplines now store
// { texts } (see the claimAndPostStat calls above); each storyline-watch slot
// stores its own texts too, so slot 4 excludes everything slots 1-3 said as
// well as the noon posts, without needing its own separate kind list to grow
// by hand each time a slot is added.
async function storylineSeenTexts(db, day) {
  try {
    const { data } = await db.from('homer_feed_posts').select('payload')
      .eq('day', day)
      .in('kind', ['funfacts', 'matchuplines', 'storyline_watch_1', 'storyline_watch_2', 'storyline_watch_3', 'storyline_watch_4'])
    const out = new Set()
    for (const row of data || []) {
      for (const t of row?.payload?.texts || []) {
        const s = String(t || '').trim()
        if (s) out.add(s)
      }
    }
    return out
  } catch {
    return new Set()
  }
}

function authorized(request) {
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (!supplied) return false
  // CALLEDIT_SECRET is the manual-fire key (scripts/fire-homer-tick.sh).
  // CRON_SECRET is a Sensitive variable on Vercel — write-only, so a person
  // can never copy it out to test with; this one is a plain Config value.
  return [process.env.CRON_SECRET, process.env.FRANCHISE_CRON_SECRET, process.env.CALLEDIT_SECRET].filter(Boolean).some((expected) => {
    const a = Buffer.from(expected)
    const b = Buffer.from(supplied)
    return a.length === b.length && timingSafeEqual(a, b)
  })
}

const service = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

// ── the published files, cached per instance ───────────────────────────────
const TTL_MS = 10 * 60 * 1000
const _cache = { board: { at: 0, day: '', index: null }, odds: { at: 0, data: null }, pairs: { at: 0, data: null } }

async function boardIndex(day) {
  const c = _cache.board
  if (c.index && c.day === day && Date.now() - c.at < TTL_MS) return c.index
  const rows = await fetchBoardFull('today').catch(() => null)
  const index = boardIndexFrom(rows)
  // An empty board is not cached: a bot that has not published yet should be
  // asked again next minute, not remembered as "nobody is on it" for ten.
  if (index.size) _cache.board = { at: Date.now(), day, index, rows }
  return index
}
const boardRows = () => _cache.board.rows || []

// 2026-09-10 (Donovan: "this should be posted first thing when the new
// slate is posted"). Used to wait for a lineup to post, or for the
// one-hour-before-first-pitch deadline, or a fallback hour with no
// game-time data at all -- three different ways of guessing "is it close
// enough to game time yet." None of that is the question anymore: the
// board being published IS the slate existing, and that's the only gate
// now (`ready`, below). PREGAME_LEAD_MS survives for one job only --
// `overdue`, the catch-up path that lets a late cron tick still post once
// something has already started, rather than losing the night entirely.
const PREGAME_LEAD_MS = 60 * 60 * 1000

// STAT-FEED POST TIMES (2026-09-07, Donovan: "3-5 posts minimum a day...
// mostly pregame, then a couple mid-slate"). Expressed as hours after noon
// ET so a late-evening threshold (9pm) compares correctly even once the UTC
// clock has rolled to the next calendar date -- see etHoursSinceNoon below.
// Hardcoded for EDT (the offset in effect for the whole regular season) --
// same assumption the old pregame-hour fallback made, accepted there too.
// 2026-09-07, second pass (Donovan: "earlier in the day for all of these").
// Every slot moved up; negative values are morning ET. The three pregame
// slots no longer sit behind the posted-lineup gate, so these thresholds are
// now the only thing holding them (plus board.size).
const HOTTEST_CONTACT_HOUR = -3    // 9am ET
const HR_LEADERS_DOW_HOUR = -2     // 10am ET
const DANGER_COMBOS_HOUR = -1      // 11am ET
const HOTTEST_CONTACT_MID_HOUR = 4 // 4pm ET
const DANGER_COMBOS_MID_HOUR = 7   // 7pm ET
// 2026-09-08 (Donovan: "wire those up for automated tweets"). Same board-only
// shape as the three above -- gated on the hour, claimed per (day, kind), no
// live snapshot involved.
const BIRTHDAY_HOUR = -2      // 10am ET
const BACK_TO_BACK_HOUR = -1  // 11am ET
const FUN_FACTS_HOUR = 1      // 1pm ET
// 2026-09-08 (Donovan: "build them because I want them"). Same board-only
// shape, spread through the morning/midday window alongside the four above --
// see claude/ project docs for why each of these six has a real data source
// behind it (no invented numbers) and why Revenge Game Watch is NOT here yet.
const MATCHUP_LINES_HOUR = -4   // 8am ET
const CALL_OF_NIGHT_HOUR = -3   // 9am ET (own slot, separate from hotcontact)
const STREAKS_HOUR = -3         // 9am ET
const STORYLINES_HOUR = 0       // noon ET
const THE_FOUR_HOUR = 0         // noon ET
const BEST_AIR_HOUR = 2         // 2pm ET
const ACCOUNTABILITY_HOUR = -4  // 8am ET -- grades YESTERDAY's picks
const BOARD_RESULTS_HOUR = -4   // 8am ET -- grades YESTERDAY's Tonight's Board
const COMMUNITY_PICK_HOUR = -4  // 8am ET
// 2026-09-15 (Donovan: pairswatch/longshot "get posted... almost at
// midnight"). Traced, not guessed: the bot's day-rollover cron
// (today.yml, bot repo) fires at 12:05am Phoenix -- explicitly ON PURPOSE,
// Donovan's own 2026-08-28 call, so the SITE turns over at midnight. But
// `ready` above only checks the board's slate_date, not how much of the
// day has actually run through it, and pairswatch/longshot had no hour
// floor of their own -- so they were firing within minutes of that bare
// midnight rollover, off the same unconfirmed-lineup board Called Shots
// used to. Unlike the six board-only stat posts above (openly projections,
// never claimed otherwise), pairswatch and longshot both READ the real
// TOP/HR designations -- the same accuracy-sensitive data Called Shots is
// built from. Noon/1pm ET lines them up with the start of the bot's own
// declared lineup-drop window (9am-2:30pm Phoenix, today.yml) instead of
// its opening bell, while still landing well ahead of Called Shots' new
// closer-to-first-pitch slot -- keeping the "spread through the day"
// cadence Donovan asked for on 2026-09-07 rather than clumping every
// pregame post into one window.
const PAIRSWATCH_HOUR = 0       // noon ET
const LONGSHOT_HOUR = 1         // 1pm ET
const BOTPOLL_DURATION_MIN = 600 // 10 hours -- covers most of a night slate
// MATCHUP HISTORY (2026-09-15, Donovan: someone requested a fan account's
// "has a HR vs tonight's starter" list; confirmed he wants BOTH that and the
// best-batting-line "who owns him" trivia, as a pool that fires again later
// for the later slate rather than one single snapshot -- "this can fire
// later in the day or middle slate for a liter game just an idea"). Unlike
// every hour above, this is a floor, not a promise: vsPitcherCareerLines()
// only counts a hitter once his lineup spot is CONFIRMED, which most of the
// board doesn't have yet at 2pm -- but claimAndPostStat never spends the
// day's claim on empty text (the same rule the pregame call relies on), so
// an early tick with nothing confirmed yet just retries next minute for
// free until real lineups land.
const MATCHUP_HOUR = 2          // 2pm ET -- first wave of confirmed lineups
const MATCHUP_LATE_HOUR = 6     // 6pm ET -- evening/West-Coast games locking
// 2026-09-15 (Donovan: "milestones do 2 different sets of players two
// different times a day," spread out to fill the account's two dead
// windows -- nothing posts 4-7am ET today, and 6am is the middle of it;
// 3pm sits in an otherwise-empty hour between Longshot/Fun Facts (1pm) and
// Hottest Contact's mid repost (4pm).
const MILESTONE_AM_HOUR = -6    // 6am ET
const MILESTONE_MID_HOUR = 3    // 3pm ET
// 2026-09-15 (Donovan, real site "Storylines" panel: "please can you just
// post like some of these throught the day, people love them" -- then:
// "storylies post 4 a day once slate starts for games that havent started"
// and "thing else post in a combined tweet. makesure not srepat
// info,ations"). ORIGINALLY placed at 5/8/9/10pm; Donovan corrected same day
// -- "those storylines need to be earlier than that... later storyline
// tweets seem dumb and not helpful" -- because storylineWatchPicks only
// draws from pregameRows(), and by 8/9/10pm ET most of the night's games
// have already thrown a first pitch (the 6:35pm+ wave), so the "hasn't
// started" pool it's allowed to talk about is nearly empty and thin by
// then. Compressed into the actual pregame window instead -- 11am/1pm/2pm/
// 4pm ET -- so every slot still has most (usually all) of the day's slate
// to draw real, un-posted lines from; 4pm is the last stop before the
// night's first pitches start clearing that pool out. The evening/live
// window (6:35pm ET on) is intentionally left to the real event-driven
// tracker tweets and the existing "mid" reposts below (HOTTEST_CONTACT_MID,
// MATCHUP_LATE, DANGER_COMBOS_MID), which read midRows() rather than
// pregameRows() and so stay accurate deep into the night -- a pregame-only
// format was never going to be the right fit for that window regardless of
// what hour it fired at. Revenge & Giveaways is its own single combined
// post -- 7am ET, the other half of the 4-7am dead window MILESTONE_AM was
// placed to fill, an hour ahead of it so the account isn't silent from 4am
// to 6am.
const STORYLINE_WATCH_1_HOUR = -1  // 11am ET
const STORYLINE_WATCH_2_HOUR = 1   // 1pm ET
const STORYLINE_WATCH_3_HOUR = 2   // 2pm ET
const STORYLINE_WATCH_4_HOUR = 4   // 4pm ET
const REVENGE_GIVEAWAY_HOUR = -5   // 7am ET

function etHoursSinceNoon() {
  const h = new Date().getUTCHours()
  // Fold the early-UTC hours (late ET the previous day) forward. The cut used
  // to be h < 12, which made 8am ET the earliest threshold that worked at all
  // -- 7am ET (11:00 UTC) folded to +19 and would have read as late evening.
  // Cut at 4 instead: the representable window is now midnight ET (-12)
  // through 11pm ET (+11), which covers every hour anything posts.
  const rel = h < 4 ? h + 24 : h
  return rel - 16                  // 16:00 UTC = noon ET (EDT)
}

/** The earliest game_time on tonight's board, in ms, or null if none parse. */
function firstPitchOf(rows) {
  const times = (Array.isArray(rows) ? rows : [])
    .map((r) => Date.parse(r?.game_time || ''))
    .filter((t) => Number.isFinite(t))
  return times.length ? Math.min(...times) : null
}

async function published(slot, paths, ok) {
  const c = _cache[slot]
  if (c.data && Date.now() - c.at < TTL_MS) return c.data
  for (const url of paths) {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) continue
      const json = await res.json()
      if (ok(json)) { _cache[slot] = { at: Date.now(), data: json }; return json }
    } catch { /* next candidate */ }
  }
  return c.data
}
const oddsFile = () => published('odds', oddsPaths(), (j) => Boolean(j?.by_player_id))
const pairsFile = () => published('pairs', pairSummaryPaths(), (j) => Array.isArray(j?.top_pairs))

/** His jersey number off the league, or null. One small call per new homer. */
// Jersey number and birthDate now ride the SAME batched statsapi call — the
// Ledger's own established pattern (lib/ledgerArchive.js), because neither
// value ever changes, so re-asking the league for one and not the other is
// pure waste. birthDate feeds the fallback numerology hook in hooksFor() for
// a call-up with no homer history yet (lib/dash/homerFeed.js).
async function personInfoOf(id) {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${encodeURIComponent(id)}&fields=people,id,primaryNumber,birthDate`, { cache: 'no-store' })
    if (!res.ok) return { jersey: null, birthDate: null }
    const j = await res.json()
    const person = j?.people?.[0] || {}
    const raw = String(person.primaryNumber ?? '').trim()
    const jersey = raw && Number.isFinite(Number(raw)) ? Number(raw) : null
    const birthDate = person.birthDate || null
    return { jersey, birthDate }
  } catch {
    return { jersey: null, birthDate: null }
  }
}

// BIRTHDAY WATCH (2026-09-08, Donovan: "wire those up for automated tweets").
// One batched statsapi call for the whole slate (same endpoint and shape as
// the per-homer lookup above, just many ids at once -- statsapi's own limit
// is comfortably above what one night's board ever holds, batched at 100 to
// stay well under it), filtered to whoever's birthday is today. Same source
// components/Storylines.js already uses live for the site's own Birthdays
// panel -- this does not invent a new feed, it posts the one that exists.
async function birthdaysToday(rows, day) {
  const list = Array.isArray(rows) ? rows : []
  const byId = new Map()
  for (const r of list) {
    const pid = String(r?.player_id || '').trim()
    if (pid && !byId.has(pid)) byId.set(pid, r)
  }
  const ids = [...byId.keys()]
  if (!ids.length) return []
  const mmdd = day.slice(5)
  const out = []
  for (let i = 0; i < ids.length; i += 100) {
    const batch = ids.slice(i, i + 100)
    try {
      const res = await fetch(`https://statsapi.mlb.com/api/v1/people?personIds=${batch.join(',')}&fields=people,id,birthDate`, { cache: 'no-store' })
      if (!res.ok) continue
      const j = await res.json()
      for (const person of j?.people || []) {
        const bd = String(person?.birthDate || '')
        if (bd.length < 10 || bd.slice(5) !== mmdd) continue
        const row = byId.get(String(person.id))
        if (!row) continue
        const born = Number(bd.slice(0, 4))
        const age = Number.isFinite(born) ? new Date(`${day}T12:00:00Z`).getUTCFullYear() - born : null
        out.push({
          name: String(row.name || '').trim(), team: String(row.team || '').trim() || null, age,
          last5_avg: row.last5_avg, last5_hr: row.last5_hr, last5_rbi: row.last5_rbi, last5_status: row.last5_status,
        })
      }
    } catch (err) {
      console.error('[homers] birthday lookup failed', err)
    }
  }
  return out
}

// 2026-09-08 (Donovan: "add recent stats to help ... anything that doesn't
// really have any stats with it"). Same last5_avg/hr/rbi already on every
// board row, no extra pull -- '.297 last 5, 2 HR' turns "turns 25" into
// something worth reading. Blank on last5_status !== 'ok' (a call-up with no
// games yet) rather than printing a fabricated .000.
function l5Line(row) {
  if (!row || row.last5_status !== 'ok') return ''
  const avg = Number(row.last5_avg)
  if (!Number.isFinite(avg)) return ''
  const avgStr = avg.toFixed(3).replace(/^0\./, '.').replace(/^-0\./, '-.')
  const hr = Number(row.last5_hr) || 0
  const rbi = Number(row.last5_rbi) || 0
  const bits = [`${avgStr} last 5`]
  if (hr > 0) bits.push(`${hr} HR`)
  if (rbi > 0) bits.push(`${rbi} RBI`)
  return bits.join(', ')
}

function birthdayText(people, { day = '', site = '', handle = '' } = {}) {
  if (!Array.isArray(people) || !people.length) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = `🎂 BIRTHDAY WATCH${day ? ` — ${day.slice(5).replace('-', '/')}` : ''}`
  const lines = people.map((p) => {
    const l5 = l5Line(p)
    return `${p.name}${p.team ? ` (${p.team})` : ''}${p.age != null ? ` — turns ${p.age}` : ''}${l5 ? `, ${l5}` : ''}`
  })
  const fits = (arr) => arr.filter(Boolean).join('\n').length <= 270
  for (let n = lines.length; n >= 0; n -= 1) {
    const body = [head, ...lines.slice(0, n), tail]
    if (fits(body)) return body.filter(Boolean).join('\n')
  }
  return [head, tail].filter(Boolean).join('\n')
}

// PNG bytes, or null. Never throws: the image is the garnish.
async function bytesOf(make) {
  try {
    const img = await make()
    return Buffer.from(await img.arrayBuffer())
  } catch (err) {
    console.error(`[homers] card failed: ${String(err?.message || err)}`)
    return null
  }
}

const strip = (row) => {
  const out = {}
  for (const [k, v] of Object.entries(row)) if (!k.startsWith('_')) out[k] = v
  return out
}

const shiftDay = (iso, n) => {
  const d = new Date(`${iso}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/**
 * The slate's own day, off the live snapshot rather than the wall clock.
 * Live games win and the earliest of them decides, so a game running past
 * midnight ET keeps its homers on the day it started. With nothing live,
 * the most common scheduled gameDate wins, ties breaking to the earlier
 * date. Returns '' when there is nothing to go on, so the caller can fall
 * back to easternToday().
 */
const slateDayOf = (snap) => {
  const games = Array.isArray(snap?.games) ? snap.games : []
  const dayOf = (g) => (/^\d{4}-\d{2}-\d{2}$/.test(String(g?.gameDate || '')) ? String(g.gameDate) : '')
  // A suspended or postponed game can sit in 'Live' indefinitely. Letting one
  // count would pin the day backwards forever and silently freeze every dated
  // post behind it, so both are excluded everywhere below.
  const stuck = (g) => Boolean(g?.suspended || g?.postponed)
  const live = games.filter((g) => g?.state === 'Live' && !stuck(g)).map(dayOf).filter(Boolean).sort()
  if (live.length) return live[0]
  // Nothing in progress. The snapshot still holds last night's finished games
  // beside tonight's scheduled ones, and on a light slate that is a 1-1 tie --
  // which an earlier-date tie-break would resolve BACKWARDS, sticking the feed
  // on yesterday all day. So the vote is among games still to be settled, and
  // only if every one is done does it fall back to counting them all.
  const modal = (list) => {
    const counts = new Map()
    for (const g of list) {
      const d = dayOf(g)
      if (d) counts.set(d, (counts.get(d) || 0) + 1)
    }
    let best = ''
    let bestN = -1
    // Ties break to the EARLIER date -- a slate straddling a midnight belongs
    // to the day it started. Same rule slateDateFromRows() documents.
    for (const d of [...counts.keys()].sort()) {
      const n = counts.get(d)
      if (n > bestN) { bestN = n; best = d }
    }
    return best
  }
  return modal(games.filter((g) => g?.state !== 'Final' && !stuck(g))) || modal(games)
}


/**
 * The night's recap — text + card to Discord and X, and on a Sunday the week.
 * Claimed on `homerfeed:recap:<day>` so it goes out once; `force` re-posts
 * (a test, or a night whose post failed) without touching the claim.
 */
async function postRecap(db, day, { force = false } = {}) {
  const xOn = hasX()
  const out = { recap: xOn ? 'posted' : 'x-not-configured', ...(xOn ? {} : { x_problem: xProblem() }) }
  const key = `homerfeed:recap:${day}`
  // Same read-the-error rule as claimSlot above, on the other claim table.
  // This one is the worst place to be silent: an errored upsert returns no
  // rows, which reads as "already posted", so a broken claim would retire the
  // night's recap for good and answer 'already' every minute after.
  const { data: claim, error: claimError } = await db
    .from('dash_push_seen')
    .upsert([{ event_key: key }], { onConflict: 'event_key', ignoreDuplicates: true })
    .select('event_key')
  if (claimError) {
    console.error(`[homers] recap claim failed for ${day}: ${claimError.message}`)
    if (!force) return { recap: 'claim-failed', error: claimError.message }
  }
  if (!claim?.length && !force) return { recap: 'already' }
  {
    const { data: rows } = await db.from('homer_feed').select('name,team,role,on_board,board_rank').eq('day', day)
    const c = captureFrom(rows)
    if (c.total) {
      // Rewritten 2026-09-13 (Donovan's stacked-format pass): scoreboard feel,
      // categories vertically stacked in a fixed order with their own emoji,
      // streak last.
      const ROLE_EMOJI = { HR: '🤖', TOP: '🌙', TOP15: '🌙', HRR: '📊', CONTACT: '📊', HIT: '📊', WATCH: '👀' }
      const ROLE_ORDER = ['HR', 'TOP', 'TOP15', 'HRR', 'CONTACT', 'HIT', 'WATCH']
      const roleLines = ROLE_ORDER.filter((r) => c.byRole[r]).map((r) => `${ROLE_EMOJI[r] || '🤖'} ${r}: ${c.byRole[r]}`)
      const { data: hist } = await db.from('homer_feed').select('day,role,name,odds_over,odds_book').gte('day', shiftDay(day, -12)).lte('day', day)
      const straight = topStreakFrom(hist || [], day, false)
      const tailLine = [TAIL.site, TAIL.handle].filter(Boolean).join(' · ')
      const blocks = [
        ['📋 NIGHTLY MOONSHOT'],
        [`${c.called} / ${c.total} HR called`, `${c.pct}% of tonight's homers`],
      ]
      if (roleLines.length) blocks.push(roleLines)
      if (c.rated) blocks.push([`${c.rated} more were on the board.`])
      if (straight >= 2) blocks.push([`🔥 TOP pick streak: ${straight} nights`])
      if (tailLine) blocks.push([tailLine])
      const text = blocks.map((b) => b.join('\n')).join('\n\n')
      await postToDiscord(text, { imageUrl: recapUrl(day) }, FEED_WEBHOOKS())
      if (xOn) {
        const png = await bytesOf(() => recapCard(day, rows || [], hist || [], { site: SITE_HOST }))
        const mediaId = png ? await uploadImageToX(png) : null
        const r = await postToX(text, { mediaId })
        if (r.ok) out.recap = r.id
        else { out.recap = 'x-refused'; out.x_error = `${r.status} ${r.error}`; console.error(`[homers] recap refused: ${r.status} ${r.error}`) }
        out.card = png ? 'attached' : 'failed'
      }
      // SUNDAY: the week. Claimed on its own key so a recap that failed
      // halfway cannot skip it, and a week is never posted twice.
      if (new Date(`${day}T12:00:00Z`).getUTCDay() === 0) {
        const wk = await claimSlot(db, day, 'weekly')
        if (wk) {
          const from = shiftDay(day, -6)
          const week = (hist || []).filter((r) => r.day >= from && r.day <= day)
          const wtext = weeklyText(week, { from, to: day, ...TAIL })
          const wc = captureFrom(week)
          const patch = { payload: { from, to: day, called: wc.called, total: wc.total } }
          // WEEKLY STAYS TEXT-ONLY (2026-09-07). A card was built for it and
          // Donovan took it back out -- the weekly post is a number and a
          // sentence, and it is the one kind where a poster adds nothing the
          // text does not already say. Deliberate, not the oversight it looks
          // like next to the other twelve.
          const d = await postToDiscord(wtext, {}, FEED_WEBHOOKS())
          if (d.ok) patch.discord_sent = true
          if (xOn) {
            const r = await postToX(wtext)
            if (r.ok && r.id) patch.x_post_id = r.id
            else console.error(`[homers] weekly refused: ${r.status} ${r.error}`)
          }
          await db.from('homer_feed_posts').update(patch).match({ day, kind: 'weekly' })
        }
      }
      // THE 1ST OF THE MONTH: the month just finished, TOP/HR/HR Watch
      // broken out (Donovan: "all three vs homerun on the month"). Same
      // claim-first shape as weekly/pregame -- a failed half never blocks a
      // retry, and this can never double-post for the same month.
      if (new Date(`${day}T12:00:00Z`).getUTCDate() === 1) {
        const mo = await claimSlot(db, day, 'monthly')
        if (mo) {
          const prevLastDay = shiftDay(day, -1)
          const monthFrom = `${prevLastDay.slice(0, 7)}-01`
          const { data: monthRows } = await db.from('homer_feed').select('day,role').gte('day', monthFrom).lte('day', prevLastDay)
          const monthLabel = new Date(`${monthFrom}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
          const mtext = monthlyText(monthRows || [], { month: monthLabel, ...TAIL })
          const mc = captureFrom(monthRows || [])
          const patch = { payload: { from: monthFrom, to: prevLastDay, called: mc.called, total: mc.total } }
          // EVERY ROLE, NOT THREE OF THEM (2026-09-07). Donovan: "the hr
          // percentage should show watch players too not just top picks and
          // hr ... all the different picks vs the hrs tonight."
          //
          // captureFrom's headline number was never the problem -- it counts
          // any role, so WATCH and HRR and HIT have always been inside the
          // percentage. The BREAKDOWN under it was the problem: this line
          // hardcoded TOP, HR and WATCH, so a month's HRR, HIT, CONTACT and
          // TOP15 calls were captured in the total and then invisible in the
          // split. Over the last two weeks that is 20 HRR, 17 HIT, 7 CONTACT
          // and 2 TOP15 -- 46 of 128 calls, a third of them, unaccounted for
          // on the card that exists to account for them.
          //
          // Now it reads byRole itself, ordered by count, so a role the bot
          // starts issuing tomorrow appears without anyone editing this line.
          const mRoles = Object.entries(mc.byRole).sort((a, b) => b[1] - a[1])
          const mpng = await bytesOf(() => statCard(day, {
            pill: 'MONTHLY', label: monthLabel.toUpperCase(),
            headline: `${mc.called} of ${mc.total} home runs on the bot (${mc.pct ?? 0}%)`,
            lines: [
              mRoles.length ? mRoles.map(([r, c]) => `${roleWord(r).toUpperCase()} ${c}`).join('   ·   ') : '',
              mc.rated ? `${mc.rated} more on the board, no call` : '',
            ].filter(Boolean),
          }, { site: SITE_HOST }))
          const d = await postToDiscord(mtext, { png: mpng }, FEED_WEBHOOKS())
          if (d.ok) patch.discord_sent = true
          if (xOn) {
            const mediaId = mpng ? await uploadImageToX(mpng) : null
            const r = await postToX(mtext, { mediaId })
            if (r.ok && r.id) patch.x_post_id = r.id
            else console.error(`[homers] monthly refused: ${r.status} ${r.error}`)
          }
          await db.from('homer_feed_posts').update(patch).match({ day, kind: 'monthly' })
        }
      }
    }
  }
  return out
}

export async function GET(request) {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (await isMaintenanceMode()) return Response.json({ skipped: 'maintenance_mode' })
  const db = service()
  if (!db) return Response.json({ skipped: 'supabase-service-key-missing' })

  // A RECAP ON DEMAND: ?recap=YYYY-MM-DD posts that night's recap from
  // whatever homer_feed holds for it (live rows or backfill). &force=1
  // re-posts one that already went out. This is how the first recap gets
  // tested at 1am without waiting for a night to end.
  const u = new URL(request.url)
  const want = String(u.searchParams.get('recap') || '')
  if (/^\d{4}-\d{2}-\d{2}$/.test(want)) {
    const { count } = await db.from('homer_feed').select('player_id', { count: 'exact', head: true }).eq('day', want)
    if (!count) return Response.json({ day: want, recap: 'no-rows', hint: 'nothing recorded for that night yet — the backfill fills one past night per tick' })
    return Response.json({ day: want, rows: count, ...(await postRecap(db, want, { force: u.searchParams.get('force') === '1' })) })
  }

  // WHICH DAY IS IT (2026-09-07). This used to be a bare easternToday(), and
  // that is a wall clock -- it rolls at midnight ET whether or not a ball is
  // still in the air in Los Angeles. Four homers between 08-25 and 09-07 were
  // filed under TWO days because of it: the tick that ran at 04:01 UTC saw a
  // game still in the 6th, computed tomorrow's date, and re-filed a homer it
  // had already posted an hour earlier. The freshness key is (player_id,
  // hr_n) scoped per day, so hr_n=1 read as brand new on the new date and
  // went out a second time. Worse, yesterdayIds is shiftDay(day,-1) -- which
  // was now the day the SAME homer already sat in -- so the duplicate stamped
  // itself "Back-to-back nights" against its own earlier copy. CJ Abrams,
  // game 823903, 09-06 + 09-07: same game_pk, same hr_n, two tweets.
  //
  // The snapshot's games already carry MLB's own `gameDate`, the North-
  // American baseball calendar day (see lib/liveSlate.js:213), and the
  // snapshot deliberately keeps a previous day's game while it is still Live
  // (liveSlate.js:308). So: if anything is still being played, the slate day
  // is the EARLIEST still-live game's own date. That is the same tie-break
  // rule slateDateFromRows() documents -- a slate straddling a midnight
  // belongs to the day it started. Only once every one of those is Final does
  // the day roll to the modal scheduled date.
  //
  // Deliberately safe on rollover: while last night's game is still live the
  // day stays back, so the new morning's stat slots gate on the old day, find
  // its (day, kind) rows already claimed, and post nothing. They fire on the
  // next tick after the day rolls, well before 9am ET.
  const snap = await fetchLiveSlate({ force: true }).catch(() => null)
  const day = slateDayOf(snap) || easternToday()

  // RESULTS / ACCOUNTABILITY (2026-09-13, Donovan's engagement-tweet pass).
  // Grades YESTERDAY's ten pregame picks against what actually went deep.
  // The pregame post already persists those ten names on its own row
  // (homer_feed_posts.payload.picks) -- no new table, just a read-back one
  // day later. Deliberately placed before the no-games early return below:
  // an off day for TODAY is not a reason to skip grading YESTERDAY.
  if (etHoursSinceNoon() >= ACCOUNTABILITY_HOUR) {
    const yday = shiftDay(day, -1)
    const acctClaim = await claimSlot(db, yday, 'accountability')
    if (acctClaim) {
      const { data: pre } = await db.from('homer_feed_posts').select('payload').match({ day: yday, kind: 'pregame' }).maybeSingle()
      const yPicks = pre?.payload?.picks || []
      if (yPicks.length) {
        const { data: yHits } = await db.from('homer_feed').select('player_id').eq('day', yday)
        const hitIds = new Set((yHits || []).map((r) => String(r.player_id)))
        const text = accountabilityText(yPicks, hitIds, { day: yday, ...TAIL })
        const patch = { payload: { picks: yPicks, hit: [...hitIds] } }
        const d = await postToDiscord(text, {}, FEED_WEBHOOKS())
        if (d.ok) patch.discord_sent = true
        if (hasX()) {
          const r = await postToX(text)
          if (r.ok && r.id) patch.x_post_id = r.id
          else console.error(`[homers] accountability refused: ${r.status} ${r.error}`)
        }
        await db.from('homer_feed_posts').update(patch).match({ day: yday, kind: 'accountability' })
      }
    }
  }

  // TONIGHT'S BOARD, GRADED (2026-09-15, Donovan: "do the recemmomdend but
  // maks sure its graded"). Same read-back shape as RESULTS/ACCOUNTABILITY
  // just above -- yesterday's 'board' post already persisted its picks
  // (homer_feed_posts.payload.picks) -- but HIT and HRR can clear without a
  // home run, so this cannot reuse homer_feed (HR-only) the way accountability
  // does. boxLinesForDate re-pulls yesterday's real box scores instead, and
  // pickCleared (lib/liveSlate.js) settles each pick against them -- the same
  // bars the live in-card badges use.
  if (etHoursSinceNoon() >= BOARD_RESULTS_HOUR) {
    const yday = shiftDay(day, -1)
    const boardResultsClaim = await claimSlot(db, yday, 'board_results')
    if (boardResultsClaim) {
      const { data: yBoard } = await db.from('homer_feed_posts').select('payload').match({ day: yday, kind: 'board' }).maybeSingle()
      const yBoardPicks = yBoard?.payload?.picks || []
      if (yBoardPicks.length) {
        const lines = await boxLinesForDate(yday)
        const text = boardRoleResultsText(yBoardPicks, lines, { day: yday, ...TAIL })
        const patch = { payload: { picks: yBoardPicks } }
        const d = await postToDiscord(text, {}, FEED_WEBHOOKS())
        if (d.ok) patch.discord_sent = true
        if (hasX()) {
          const r = await postToX(text)
          if (r.ok && r.id) patch.x_post_id = r.id
          else console.error(`[homers] board_results refused: ${r.status} ${r.error}`)
        }
        await db.from('homer_feed_posts').update(patch).match({ day: yday, kind: 'board_results' })
      }
    }
  }

  // The nights before the feed existed, one per tick until the /called window
  // is full (lib/dash/homerBackfill). Runs before the no-games exits on
  // purpose: an off day is exactly when there is time for it.
  const backfill = await backfillOneNight(db, day)
  const [board, odds, pairs] = await Promise.all([boardIndex(day), oddsFile(), pairsFile()])
  // 2026-09-08 (Donovan: "USE WHATEVER IS ON THE SITE -- nothing should come
  // back as nothing when the site has already pulled the data, the API is
  // the cushion"). fetchLiveSlate hits a separate, flakier pipeline than the
  // board (today_slim.json, via boardIndex() just above) -- today's
  // SCHED_FIELDS bug made it report zero games on a real 15-game night, and
  // any future hiccup in it (timeout, rate limit, schema change) looks
  // identical. The board is the same data the site itself is already
  // showing, so it -- not the live snapshot -- gets the final say on whether
  // tonight is a real off day. Skip only when BOTH sources agree there is
  // nothing.
  const gamesLive = Array.isArray(snap?.games) ? snap.games : []
  if (!gamesLive.length && !board.size) {
    // 2026-09-08: a missing SCHED_FIELDS entry made every pregame-hour tick
    // report this exact shape on a night with 15 real games, and nothing in
    // the response said why. liveSlateStatus().reason now carries whatever
    // pullLiveSlate logged, so a future regression shows up in the tick's own
    // JSON instead of needing a manual repro to find.
    return Response.json({ day, skipped: 'no-games', backfill, liveSlate: liveSlateStatus() })
  }
  // From here down, `snap` may still be null or empty (fetchLiveSlate down,
  // or genuinely nothing live yet) while `board` carries tonight's games.
  // Every read of the live snapshot goes through `gamesLive`, never raw
  // `snap.games` -- and the board-only posts below (hotcontact, dangercombos,
  // hrleadersdow) never touch the snapshot at all, so a live-API outage no
  // longer blocks them.
  const started = gamesLive.some((g) => g?.state === 'Live' || g?.state === 'Final')
  // 2026-09-06 (Donovan: "at least a hour before first pitch"). Computed off
  // whatever the board holds right now -- boardIndex() only just resolved
  // above, so this always sees the freshest cached rows.
  const firstPitch = firstPitchOf(boardRows())
  const overdue = firstPitch != null && Date.now() >= firstPitch - PREGAME_LEAD_MS
  // 2026-09-15 (Donovan: "the top ten needs to be updated before first
  // pitch"). Reverses part of the 2026-09-10 change for ONE post only --
  // see the note above the pregame claim below for which one and why.
  // firstPitch can be null (no parseable game_time on the board at all);
  // waiting forever in that case would be worse than the thing being
  // reverted, so it falls open rather than blocking the call permanently.
  const pregameLockReady = firstPitch == null ? true : overdue
  // WHO IS STILL PLAYABLE (2026-09-07, Donovan: "it should not be tweeting
  // things about the slate that's already gone off or players that are not
  // playing anymore"). One index over tonight's snapshot; every board-derived
  // post below reads the board THROUGH it instead of raw. Fails open on an
  // unknown game -- see lib/dash/tweetFeed.js playableRows.
  const live = liveIndexFrom(snap)
  const pregameRows = () => playableRows(boardRows(), live, 'pregame')
  const midRows = () => playableRows(boardRows(), live, 'mid')

  // ── 0. THE PREGAME CALL — before anything starts ──────────────────────────
  //
  // CLAIM-BEFORE-VALIDATE (2026-09-06). Donovan: "I don't see the pregame
  // reads posting on the twitter" -- and a full scroll of @CalledItHR's
  // history confirmed it: homer alerts and the nightly recap both post fine,
  // the pregame call never has, not once.
  //
  // The claim row used to go in BEFORE checking whether pregamePicks() found
  // anything. `ready` flips true the moment ANY game's lineup posts, or at
  // 4pm ET -- which on a slate with an early getaway game can be well before
  // fetchBoardFull('today') has the day's TOP/HR picks cached yet (boardIndex
  // only replaces the cache once `index.size` is non-empty, so a cold or
  // not-yet-published board just leaves it holding whatever the last
  // non-empty fetch was, possibly nothing for today at all). On whichever
  // tick `ready` first flips true, if the board happened to still be empty
  // that minute, `picks` came back `[]` -- but the upsert above it had
  // ALREADY inserted the `(day, 'pregame')` claim row with
  // `ignoreDuplicates: true`. Every tick for the rest of the day then hit
  // that same row on the upsert, got zero rows back, and returned
  // `pregame: 'already'` -- burned on one bad minute, no retry, no error
  // anywhere Donovan would see it.
  //
  // Fix: compute `picks` first -- pure, in-memory, touches no table -- and
  // only claim the day's slot once there is something to post. A tick that
  // finds nothing yet costs nothing and simply tries again next minute, same
  // as the picks/odds fetch above it already does.
  // `overdue` is allowed through even once `started` is true: the one-hour
  // deadline is the promise that actually matters (Donovan asked for it
  // explicitly), and posting late beats never posting at all if a cron gap
  // let an early game go Live before this ran. On a normal night `overdue`
  // never flips true before `!started` already let this block run, because
  // the earliest game cannot go Live before its own first pitch, and the
  // deadline sits a full hour before that.
  // 2026-09-08 INCIDENT: the six new picks below (2287698) took the WHOLE
  // route down with an uncaught exception the moment the block after
  // birthday ran -- every post after it, same tick AND every tick since,
  // silently 500'd, discovered only by manually firing and checking
  // homer_feed_posts for what never landed. This directly violates this
  // file's own rule #3 (top of file: "IT NEVER FAILS LOUDLY... A cron that
  // throws is a cron that stops running") -- these nine new blocks were
  // added without it. safeStat() is the fix: one block throwing gets
  // logged and skipped, the tick keeps going, and the failure shows up in
  // the response instead of taking homer alerts down with it.
  const statErrors = {}
  async function safeStat(kind, fn) {
    try {
      await fn()
    } catch (err) {
      console.error(`[homers] ${kind} block threw`, err)
      statErrors[kind] = String(err?.message || err)
    }
  }
  if (board.size) {
    // ── HOTTEST CONTACT / DANGER COMBOS / MLB HR LEADERS — [DAY] ───────────
    // 2026-09-07 (Donovan: "earlier in the day for all of these"). Moved OUT
    // of the `!started || overdue` / `ready` gate these used to sit inside:
    // that gate waits on a POSTED LINEUP, which on a normal night lands 4-5pm
    // ET, so an earlier hour threshold alone would have changed nothing. These
    // three rank the published board (and, for leaders, the graded archive) --
    // none of them needs a lineup. Gated now on board.size plus the hour only.
    // Independently claimed per (day, kind), so this cannot double-post.
    {
      const hc = hottestContactPicks(pregameRows())
      await claimAndPostStat(db, day, 'hotcontact', HOTTEST_CONTACT_HOUR,
        hottestContactText(hc, { day, ...TAIL }),
        hc.length ? {
          pill: 'HOT', label: 'THE HOT ZONE',
          headline: "Tonight's hottest recent blast rates",
          lines: hc.map((p) => `${p.name} (${p.team || '?'}) — ${p.blastPct}% blast vs ${p.pitcher}${p.pitcherTeam ? ` (${p.pitcherTeam})` : ''}`),
        } : null)
    }
    {
      const dc = dangerComboPicks(pregameRows())
      await claimAndPostStat(db, day, 'dangercombos', DANGER_COMBOS_HOUR,
        dangerComboText(dc, { day, ...TAIL }),
        dc.length ? {
          pill: 'KILL', label: 'THE KILL LIST',
          headline: 'Hot bats vs pitchers getting hit hard lately',
          lines: dc.map((p) => `${p.name} (${p.blastPct}% blast) vs ${p.pitcher} (${p.pitcherHrBbePct}% HR/BBE)`),
        } : null)
    }
    // The hour is checked BEFORE the fetch here, unlike the two pure
    // formatters above: fetchWeekdayHrLeaders walks up to 5 graded_results
    // files off the network (plus a second 5-file fetch for L5), and this
    // block now runs on every tick all day rather than only inside the old
    // pregame gate.
    if (etHoursSinceNoon() >= HR_LEADERS_DOW_HOUR) {
      const { leaders, dow } = await fetchWeekdayHrLeaders(day)
      await claimAndPostStat(db, day, 'hrleadersdow', HR_LEADERS_DOW_HOUR,
        hrLeadersByDowText(leaders, dow, { day, ...TAIL }),
        leaders.length ? {
          pill: 'LEADERS', label: `MLB HR LEADERS — ${String(dow || '').toUpperCase()}S`,
          headline: `Most home runs on a ${dow || 'this weekday'} this season`,
          lines: leaders.map((p) => `${p.name} (${p.team || '?'}) — ${p.hr} HR, ${p.hr ? Math.round((p.hh / p.hr) * 100) : 0}% Hard Hit, L5: ${p.l5} HR`),
        } : null)
    }
    // ── BIRTHDAY WATCH / BACK-TO-BACK WATCH / FUN FACTS (2026-09-08) ──────
    // Donovan: "wire those up for automated tweets ... add them to the
    // notifications for the discords that is link to called hr or homers".
    // Same infra as the three posts above -- claimAndPostStat already posts
    // to X AND to FEED_WEBHOOKS(), the same Discord webhook(s) every other
    // homer/CalledItHR post goes to, so nothing new to wire there. The hour
    // is checked before the network calls for the two that make one
    // (birthday, funFacts), same reasoning as HR LEADERS above.
    if (etHoursSinceNoon() >= BIRTHDAY_HOUR) {
      await safeStat('birthday', async () => {
        const bdays = await birthdaysToday(pregameRows(), day)
        await claimAndPostStat(db, day, 'birthday', BIRTHDAY_HOUR,
          birthdayText(bdays, { day, ...TAIL }),
          bdays.length ? {
            pill: 'BDAY', label: 'BIRTHDAY WATCH',
            headline: bdays.length === 1 ? bdays[0].name : `${bdays.length} on the slate celebrating tonight`,
            lines: bdays.map((p) => `${p.name}${p.team ? ` (${p.team})` : ''}${p.age != null ? ` — turns ${p.age}` : ''}`),
          } : null)
      })
    }
    await safeStat('backtoback', async () => {
      const b2b = backToBackPicks(pregameRows(), day)
      await claimAndPostStat(db, day, 'backtoback', BACK_TO_BACK_HOUR,
        backToBackText(b2b, { day, ...TAIL }),
        b2b.length ? {
          pill: 'B2B', label: 'BACK-TO-BACK WATCH',
          headline: b2b.length === 1 ? b2b[0].name : `${b2b.length} hitters chasing an encore`,
          lines: b2b.map((p) => `${p.name}${p.team ? ` (${p.team})` : ''}`),
        } : null)
    })
    if (etHoursSinceNoon() >= FUN_FACTS_HOUR) {
      await safeStat('funfacts', async () => {
        const facts = await funFactsPicks(pregameRows(), day)
        await claimAndPostStat(db, day, 'funfacts', FUN_FACTS_HOUR,
          funFactsText(facts, { day, ...TAIL }),
          facts.length ? {
            pill: 'FACTS', label: 'FUN FACTS',
            headline: facts[0]?.player ? String(facts[0].player.name || facts[0].player) : 'Tonight\'s whimsical stat line',
            lines: facts.map((f) => `${f?.icon || ''} ${f?.text || ''}`.trim()).filter(Boolean),
          } : null,
          // texts stored (2026-09-15) so the afternoon/evening Storyline
          // Watch posts (storylineSeenTexts below) never repeat one of
          // these facts verbatim.
          { texts: facts.map((f) => `${f?.icon || ''} ${f?.text || ''}`.trim()).filter(Boolean) })
      })
    }
    // ── MATCHUP LINES / THE CALL OF THE NIGHT / STREAKS / STORYLINES /
    //    THE FOUR / BEST AIR TONIGHT (2026-09-08, "build them because I want
    //    them") ─────────────────────────────────────────────────────────────
    // All six below are still board-only + one existing odds fetch -- no new
    // network dependency beyond what matchupStories()/funFactsPicks() already
    // needed for the four posts above. Same claimAndPostStat pipe, same
    // Discord webhook, same X path.
    if (etHoursSinceNoon() >= MATCHUP_LINES_HOUR) {
      await safeStat('matchuplines', async () => {
        const stories = await matchupLinesPicks(pregameRows())
        await claimAndPostStat(db, day, 'matchuplines', MATCHUP_LINES_HOUR,
          matchupLinesText(stories, { day, ...TAIL }),
          stories.length ? {
            pill: 'MATCHUP', label: 'MATCHUP LINES',
            headline: stories[0]?.player ? String(stories[0].player.name || '') : 'Tonight\'s park history',
            lines: stories.map((s) => s?.text).filter(Boolean),
          } : null,
          // texts stored (2026-09-15) for the same reason as funfacts above --
          // storylineSeenTexts below reads this back so Storyline Watch never
          // repeats one of these lines verbatim.
          { texts: stories.map((s) => s?.text).filter(Boolean) })
      })
    }
    if (etHoursSinceNoon() >= CALL_OF_NIGHT_HOUR) {
      await safeStat('callofnight', async () => {
        const call = callOfTheNightPick(pregameRows(), odds, day)
        await claimAndPostStat(db, day, 'callofnight', CALL_OF_NIGHT_HOUR,
          callOfTheNightText(call, { day, ...TAIL }),
          call ? {
            pill: 'CALL', label: 'THE CALL OF THE NIGHT',
            headline: `${call.name}${call.pitcher ? ` vs ${call.pitcher}` : ''}`,
            lines: [
              call.edgeSd != null ? `EDGE ${call.edgeSd} SD` : '',
              call.pct != null ? `PARK+WEATHER ${call.pct >= 50 ? 'top' : 'bottom'} ${call.pct >= 50 ? 100 - call.pct : call.pct}%` : '',
              call.price ? `PRICE ${call.price.odds} · ${call.price.book}` : '',
            ].filter(Boolean),
          } : null)
      })
    }
    if (etHoursSinceNoon() >= STREAKS_HOUR) {
      await safeStat('streaks', async () => {
        const streak = await streaksPick(pregameRows(), day)
        await claimAndPostStat(db, day, 'streaks', STREAKS_HOUR,
          streaksText(streak, { day, ...TAIL }),
          streak ? {
            pill: 'STREAK', label: 'STREAK WATCH',
            headline: streak.player?.name ? String(streak.player.name) : 'Tonight\'s hit streak',
            lines: [streak.text].filter(Boolean),
          } : null)
      })
    }
    if (etHoursSinceNoon() >= STORYLINES_HOUR) {
      await safeStat('storylines', async () => {
        const trends = storylinesPicks(pregameRows())
        await claimAndPostStat(db, day, 'storylines', STORYLINES_HOUR,
          storylinesText(trends, { day, ...TAIL }),
          trends.length ? {
            pill: 'STORY', label: 'STORYLINES',
            headline: trends[0]?.pitcher || 'Tonight\'s hittable arm',
            lines: trends.map((t) => `${t.pitcher}${t.team ? ` (${t.team})` : ''} — ${t.l3hr9} HR/9 last 3 starts`),
          } : null)
      })
    }
    if (etHoursSinceNoon() >= THE_FOUR_HOUR) {
      await safeStat('thefour', async () => {
        const four = theFourPicks(pregameRows())
        await claimAndPostStat(db, day, 'thefour', THE_FOUR_HOUR,
          theFourText(four, { day, ...TAIL }),
          four.length === 4 ? {
            pill: 'FOUR', label: 'THE FOUR',
            headline: 'Four categories, one bot',
            lines: four.map((p) => `${p.key}: ${p.name} vs ${p.pitcher} — ${p.score}`),
          } : null)
      })
    }
    if (etHoursSinceNoon() >= BEST_AIR_HOUR) {
      await safeStat('bestair', async () => {
        const air = bestAirPicks(pregameRows())
        await claimAndPostStat(db, day, 'bestair', BEST_AIR_HOUR,
          bestAirText(air, { day, ...TAIL }),
          air.length ? {
            pill: 'AIR', label: 'BEST AIR TONIGHT',
            headline: air[0]?.venue || 'Tonight\'s best park for a homer',
            lines: air.map((g) => `${g.venue}, ${g.matchup}${g.label ? ` — ${g.label}` : ''}`),
          } : null)
      })
    }
    // ── MATCHUP HISTORY, DAY WAVE — "HAS A HR VS THE STARTER" / "WHO OWNS
    //    HIM" (2026-09-15) ─────────────────────────────────────────────────
    // Both posts read the SAME StatsAPI vsPlayer pull off the same confirmed
    // rows, so it happens once here and each formatter just re-ranks it --
    // one round trip for two posts instead of two. See MATCHUP_HOUR above for
    // why the hour is a floor rather than a real deadline.
    if (etHoursSinceNoon() >= MATCHUP_HOUR) {
      await safeStat('matchuphistory', async () => {
        const lines = await vsPitcherCareerLines(pregameRows())
        const hrPicks = hrVsStarterPicks(lines)
        await claimAndPostStat(db, day, 'matchup_hr', MATCHUP_HOUR,
          hrVsStarterText(hrPicks, { day, ...TAIL }),
          hrPicks.length ? {
            pill: 'HISTORY', label: 'HAS A HR VS THE STARTER',
            headline: hrPicks[0]?.name ? `${hrPicks[0].name} has gone deep on tonight's arm before` : 'Tonight\'s history vs the starter',
            lines: hrPicks.map((p) => `${p.name}${p.team ? ` (${p.team})` : ''} — ${p.hr}x off ${p.pitcher}`),
          } : null,
          { picks: hrPicks })
        const careerPicks = careerVsStarterPicks(lines)
        await claimAndPostStat(db, day, 'matchup_career', MATCHUP_HOUR,
          careerVsStarterText(careerPicks, { day, ...TAIL }),
          careerPicks.length ? {
            pill: 'HISTORY', label: 'WHO OWNS HIM',
            headline: careerPicks[0]?.name ? `${careerPicks[0].name} vs ${careerPicks[0].pitcher}` : 'Tonight\'s best line vs the starter',
            lines: careerPicks.map((p) => `${p.name} — ${p.h}-for-${p.ab} vs ${p.pitcher}`),
          } : null,
          { picks: careerPicks })
      })
    }
    // ── MILESTONE WATCH, TWO WAVES (2026-09-15, Donovan: "milestone emoji
    //    title then players with stats," two posts a day, two different
    //    sets of players) -- ported from components/Storylines.js, see
    //    milestonePicks() in tweetFeed.js for the real computation. Runs
    //    off boardRows(), not pregameRows(): a milestone doesn't depend on
    //    tonight's lineup being confirmed, so the AM wave can fire at 6am
    //    ET while matchup history above is still waiting on lineups to
    //    lock. The mid wave excludes whoever the AM wave already named
    //    (milestoneSeenIds above), so the two posts never repeat a player.
    if (etHoursSinceNoon() >= MILESTONE_AM_HOUR) {
      await safeStat('milestone_am', async () => {
        const miles = await milestonePicks(boardRows())
        await claimAndPostStat(db, day, 'milestone_am', MILESTONE_AM_HOUR,
          milestoneText(miles, { day, wave: 'am', ...TAIL }),
          miles.length ? {
            pill: 'MILESTONE', label: 'MILESTONE WATCH',
            headline: miles[0]?.name ? `${miles[0].name} is ${miles[0].need} away from ${miles[0].t.toLocaleString()} ${miles[0].word}` : 'Tonight\'s milestone watch',
            lines: miles.map((p) => `${p.name}${p.team ? ` (${p.team})` : ''} — ${p.need} from ${p.t.toLocaleString()} ${p.word}`),
          } : null,
          { picks: miles })
      })
    }
    if (etHoursSinceNoon() >= MILESTONE_MID_HOUR) {
      await safeStat('milestone_mid', async () => {
        const seen = await milestoneSeenIds(db, day)
        const miles = await milestonePicks(boardRows(), { exclude: seen })
        await claimAndPostStat(db, day, 'milestone_mid', MILESTONE_MID_HOUR,
          milestoneText(miles, { day, wave: 'mid', ...TAIL }),
          miles.length ? {
            pill: 'MILESTONE', label: 'MILESTONE WATCH',
            headline: miles[0]?.name ? `${miles[0].name} is ${miles[0].need} away from ${miles[0].t.toLocaleString()} ${miles[0].word}` : 'Tonight\'s milestone watch',
            lines: miles.map((p) => `${p.name}${p.team ? ` (${p.team})` : ''} — ${p.need} from ${p.t.toLocaleString()} ${p.word}`),
          } : null,
          { picks: miles })
      })
    }
    // ── STORYLINE WATCH, FOUR WAVES (2026-09-15, Donovan: "storylies post 4
    //    a day once slate starts for games that havent started") ───────────
    // Same matchupLinesPicks/funFactsPicks data the 8am/1pm posts already
    // pull, on pregameRows() so a slot never names a game that's already
    // under way -- and each slot excludes every real line/fact posted
    // ANYWHERE today (funfacts, matchuplines, and every earlier slot) via
    // storylineSeenTexts above, so four posts plus the two morning ones never
    // repeat a sentence. A slot with nothing left un-said just posts nothing
    // -- claimAndPostStat never spends the day's claim on empty text -- it
    // does not pad with a repeat to hit a count.
    if (etHoursSinceNoon() >= STORYLINE_WATCH_1_HOUR) {
      await safeStat('storyline_watch_1', async () => {
        const seen = await storylineSeenTexts(db, day)
        const picks = await storylineWatchPicks(pregameRows(), day, { exclude: seen })
        await claimAndPostStat(db, day, 'storyline_watch_1', STORYLINE_WATCH_1_HOUR,
          storylineWatchText(picks, { day, slot: 1, ...TAIL }),
          picks.length ? {
            pill: 'STORY', label: 'STORYLINE WATCH',
            headline: 'Tonight\'s storylines',
            lines: picks.map((p) => p.text).filter(Boolean),
          } : null,
          { texts: picks.map((p) => p.text).filter(Boolean) })
      })
    }
    if (etHoursSinceNoon() >= STORYLINE_WATCH_2_HOUR) {
      await safeStat('storyline_watch_2', async () => {
        const seen = await storylineSeenTexts(db, day)
        const picks = await storylineWatchPicks(pregameRows(), day, { exclude: seen })
        await claimAndPostStat(db, day, 'storyline_watch_2', STORYLINE_WATCH_2_HOUR,
          storylineWatchText(picks, { day, slot: 2, ...TAIL }),
          picks.length ? {
            pill: 'STORY', label: 'STORYLINE WATCH',
            headline: 'Tonight\'s storylines',
            lines: picks.map((p) => p.text).filter(Boolean),
          } : null,
          { texts: picks.map((p) => p.text).filter(Boolean) })
      })
    }
    if (etHoursSinceNoon() >= STORYLINE_WATCH_3_HOUR) {
      await safeStat('storyline_watch_3', async () => {
        const seen = await storylineSeenTexts(db, day)
        const picks = await storylineWatchPicks(pregameRows(), day, { exclude: seen })
        await claimAndPostStat(db, day, 'storyline_watch_3', STORYLINE_WATCH_3_HOUR,
          storylineWatchText(picks, { day, slot: 3, ...TAIL }),
          picks.length ? {
            pill: 'STORY', label: 'STORYLINE WATCH',
            headline: 'Tonight\'s storylines',
            lines: picks.map((p) => p.text).filter(Boolean),
          } : null,
          { texts: picks.map((p) => p.text).filter(Boolean) })
      })
    }
    if (etHoursSinceNoon() >= STORYLINE_WATCH_4_HOUR) {
      await safeStat('storyline_watch_4', async () => {
        const seen = await storylineSeenTexts(db, day)
        const picks = await storylineWatchPicks(pregameRows(), day, { exclude: seen })
        await claimAndPostStat(db, day, 'storyline_watch_4', STORYLINE_WATCH_4_HOUR,
          storylineWatchText(picks, { day, slot: 4, ...TAIL }),
          picks.length ? {
            pill: 'STORY', label: 'STORYLINE WATCH',
            headline: 'Tonight\'s storylines',
            lines: picks.map((p) => p.text).filter(Boolean),
          } : null,
          { texts: picks.map((p) => p.text).filter(Boolean) })
      })
    }
    // ── REVENGE GAMES + GIVEAWAYS, ONE COMBINED POST (2026-09-15, Donovan:
    //    "thing else post in a combined tweet") ─────────────────────────────
    // Off boardRows(), not pregameRows(): a revenge game is a fact about
    // tonight's matchup, not something that stops being true once first
    // pitch happens, and a giveaway is tied to the whole game, not a lineup
    // slot -- same reasoning MILESTONE_AM above already uses for running off
    // the full board this early (7am ET, before most lineups are even
    // posted).
    if (etHoursSinceNoon() >= REVENGE_GIVEAWAY_HOUR) {
      await safeStat('revenge_giveaway', async () => {
        const rg = await revengeGiveawayPicks(boardRows(), day)
        await claimAndPostStat(db, day, 'revenge_giveaway', REVENGE_GIVEAWAY_HOUR,
          revengeGiveawayText(rg, { day, ...TAIL }),
          (rg.revenge.length || rg.giveaways.length) ? {
            pill: 'REVENGE', label: 'REVENGE & GIVEAWAYS',
            headline: rg.revenge[0]?.name ? `${rg.revenge[0].name} faces his old team tonight` : 'Tonight\'s revenge games and giveaways',
            lines: [
              ...rg.revenge.map((r) => `${r.name}${r.team ? ` (${r.team})` : ''} vs ${r.opp} — wore it ${r.span}`),
              ...rg.giveaways.map((g) => `${g.home}: ${g.name}`),
            ],
          } : null)
      })
    }
  }

  if (!started || overdue) {
    // 2026-09-10: the board existing used to be the only gate -- see the
    // note above PREGAME_LEAD_MS. 2026-09-12 (bug, found from real
    // homer_feed_posts timestamps -- Pregame Call/Pairs/Longshot posting
    // between midnight and ~1:30am ET, four nights running): "existing"
    // turned out to mean "non-empty," which a stale leftover board from
    // LAST NIGHT always is. easternToday() above rolls the site's day at
    // midnight ET; the bot's own board doesn't get a new-day publish until
    // its ~6:30am ET rollover run (today.yml). In that gap board.size is
    // non-empty but still describing yesterday, so all three fired 12+
    // hours before any real slate existed for tonight.
    //
    // Fix: also require the board's own run_meta.slate_date to equal `day`.
    // run_meta is written by the SAME bot run that writes the board file
    // (see fetchRunMeta's docstring), so it's an honest answer to "is this
    // ACTUALLY today's slate" -- unlike board.size, which only ever asked
    // "is there a file." This does not reintroduce the lineup-wait Donovan
    // removed on 2026-09-10 ("post first thing when the new slate is
    // posted"): the moment the bot's real rollover run publishes TODAY's
    // board, slate_date flips and this still fires immediately.
    const runMeta = await fetchRunMeta('today')
    const boardIsToday = runMeta?.slate_date === day
    const ready = Boolean(board.size) && boardIsToday
    // Every early return below is now guarded on `!started`: when overdue is
    // the ONLY reason this block ran (a cron gap let an early game go Live
    // before the deadline post went out), the pregame attempt still happens
    // but this falls through to homer processing afterward instead of
    // returning -- a late tick must not also skip tonight's live homers.
    if (!ready) {
      if (!started) return Response.json({ day, skipped: 'nothing-started', pregame: boardIsToday ? 'no-board' : 'stale-board', statErrors, discordErrors: discordFailuresSnapshot() })
    } else {
      // PAIRS TO WATCH + TONIGHT'S LONGEST CALL (2026-09-06, Donovan).
      // Each claims its own (day, kind) row, independent of the pregame
      // call below and of each other -- a slow news night for one is not a
      // reason to hold back the other, and neither can double-post.
      if (etHoursSinceNoon() >= PAIRSWATCH_HOUR) {
        const hits = pairsToWatch(pregameRows(), pairs, odds, day)
        if (hits.length) {
          const claim = await claimSlot(db, day, 'pairswatch')
          if (claim) {
            const text = pairsToWatchText(hits, { day, ...TAIL })
            const patch = { payload: { hits } }
            // Rendered here, above the Discord post, so both services take the
            // same one render -- see claimAndPostStat. It used to be built
            // inside the X branch, which left Discord with bare text and, on
            // a night with X off, built no card at all.
            const png = await bytesOf(() => pairsCard(day, hits, { site: SITE_HOST }))
            const d = await postToDiscord(text, { png }, FEED_WEBHOOKS())
            if (d.ok) patch.discord_sent = true
            if (hasX()) {
              const mediaId = png ? await uploadImageToX(png) : null
              const r = await postToX(text, { mediaId })
              if (r.ok && r.id) patch.x_post_id = r.id
              else console.error(`[homers] pairs-to-watch refused: ${r.status} ${r.error}`)
            }
            await db.from('homer_feed_posts').update(patch).match({ day, kind: 'pairswatch' })
          }
        }
      }
      if (etHoursSinceNoon() >= LONGSHOT_HOUR) {
        const pick = longshotPick(pregameRows(), odds, day)
        if (pick) {
          const claim = await claimSlot(db, day, 'longshot')
          if (claim) {
            const text = longshotText(pick, { day, ...TAIL })
            const patch = { payload: { pick } }
            // Rendered here, above the Discord post, so both services take the
            // same one render -- see claimAndPostStat. It used to be built
            // inside the X branch, which left Discord with bare text and, on
            // a night with X off, built no card at all.
            const png = await bytesOf(() => longshotCard(day, pick, { site: SITE_HOST }))
            const d = await postToDiscord(text, { png }, FEED_WEBHOOKS())
            if (d.ok) patch.discord_sent = true
            if (hasX()) {
              const mediaId = png ? await uploadImageToX(png) : null
              const r = await postToX(text, { mediaId })
              if (r.ok && r.id) patch.x_post_id = r.id
              else console.error(`[homers] longshot refused: ${r.status} ${r.error}`)
            }
            await db.from('homer_feed_posts').update(patch).match({ day, kind: 'longshot' })
          }
        }
      }

      // THE CALLED SHOTS, HELD FOR THE LOCK WINDOW (2026-09-15). The
      // 2026-09-10 change above made `ready` fire the moment the board
      // publishes -- right for pairswatch/longshot/community_pick (none of
      // them name a player against a lineup that can still change), wrong
      // for this one: it is a per-player TOP/HR call that quoteFor() below
      // anchors the WHOLE NIGHT's reply-quotes to, so calling it off a board
      // published hours before lineups lock is the least accurate version
      // of itself it could be. Held here until pregameLockReady -- the same
      // one-hour-before-first-pitch mark PREGAME_LEAD_MS already defined for
      // `overdue` -- so it fires off the board as it stands closest to first
      // pitch instead of as it stood at 6:30am.
      // HOISTED (2026-09-15 fix): the botpoll block below reads `picks` after
      // this if/else closes. Declaring it `const` inside the `else` only --
      // as the 2026-09-15 pregameLockReady wrap first had it -- put it out of
      // scope for that later reference (and left it undeclared entirely on
      // the `!pregameLockReady` path), which would 500 the whole tick route
      // the moment either branch ran. `let` here, assigned inside the branch
      // that actually has picks, empty otherwise.
      let picks = []
      if (!pregameLockReady) {
        if (!started) return Response.json({ day, skipped: 'nothing-started', pregame: 'waiting-for-lock-window', statErrors, discordErrors: discordFailuresSnapshot() })
      } else {
        picks = pregamePicks(pregameRows(), odds, day)
        // Every roled name on tonight's board, for the receipt quote only --
        // see pregameCalled() in homerFeed.js. Not used by any post text.
        const called = pregameCalled(pregameRows())
        if (!picks.length) {
          if (!started) return Response.json({ day, skipped: 'nothing-started', pregame: 'no-picks', statErrors, discordErrors: discordFailuresSnapshot() })
        } else {
          const claim = await claimSlot(db, day, 'pregame')
          if (!claim) {
            if (!started) return Response.json({ day, skipped: 'nothing-started', pregame: 'already', statErrors, discordErrors: discordFailuresSnapshot() })
          } else {
            const text = pregameText(picks, { day, ...TAIL })
            const patch = { payload: { picks, called } }
            // The payload goes in FIRST so the public card route can render the
            // Discord embed from it; the post ids follow.
            await db.from('homer_feed_posts').update({ payload: { picks, called } }).match({ day, kind: 'pregame' })
            const d = await postToDiscord(text, { imageUrl: pregameUrl(day) }, FEED_WEBHOOKS())
            if (d.ok) patch.discord_sent = true
            if (hasX()) {
              const png = await bytesOf(() => pregameCard(day, picks, { site: SITE_HOST }))
              const mediaId = png ? await uploadImageToX(png) : null
              const r = await postToX(text, { mediaId })
              if (r.ok && r.id) patch.x_post_id = r.id
              else console.error(`[homers] pregame refused: ${r.status} ${r.error}`)
            }
            await db.from('homer_feed_posts').update(patch).match({ day, kind: 'pregame' })
            if (!started) return Response.json({ day, skipped: 'nothing-started', pregame: patch.x_post_id || 'posted', statErrors, discordErrors: discordFailuresSnapshot() })
          }
        }
      }

      // TONIGHT'S BOARD (2026-09-15, Donovan: "role based tweets no cards
      // just text" / "make sure its graded" -- see boardRolePicks and
      // boardRoleResultsText in lib/dash/homerFeed.js). One pick per role
      // (TOP/HR/HIT/HRR), no ten-per-category dump. Same lock window as
      // Called Shots above, same reasoning: a per-player role call against a
      // lineup that can still change is least accurate called off a board
      // published hours before lineups lock.
      if (pregameLockReady) {
        const boardPicks = boardRolePicks(pregameRows())
        if (boardPicks.length) {
          const boardClaim = await claimSlot(db, day, 'board')
          if (boardClaim) {
            const text = boardRoleText(boardPicks, { day, ...TAIL })
            const patch = { payload: { picks: boardPicks } }
            const d = await postToDiscord(text, {}, FEED_WEBHOOKS())
            if (d.ok) patch.discord_sent = true
            if (hasX()) {
              const r = await postToX(text)
              if (r.ok && r.id) patch.x_post_id = r.id
              else console.error(`[homers] board refused: ${r.status} ${r.error}`)
            }
            await db.from('homer_feed_posts').update(patch).match({ day, kind: 'board' })
          }
        }
      }

      // COMMUNITY PICK (2026-09-13). Static invite, no data dependency --
      // gated on `ready` purely so it reads naturally next to tonight's real
      // picks above, not because it needs any of that data itself.
      await claimAndPostStat(db, day, 'community_pick', COMMUNITY_PICK_HOUR, communityPickText(TAIL), null)

      // BOT VS THE PEOPLE (2026-09-13). A native X poll -- see postToX's
      // `poll` option. Discord has no equivalent native-poll webhook field
      // here, so it gets the question plus the options spelled out as text;
      // X gets the real tappable poll.
      {
        const pollNames = picks.slice(0, 4).map((p) => p.name)
        if (pollNames.length >= 2) {
          const pollClaim = await claimSlot(db, day, 'botpoll')
          if (pollClaim) {
            const text = botPollText(TAIL)
            const lettered = pollNames.map((n, i) => `${String.fromCharCode(65 + i)}) ${n}`).join('\n')
            const patch = { payload: { options: pollNames } }
            const d = await postToDiscord(`${text}\n\n${lettered}`, {}, FEED_WEBHOOKS())
            if (d.ok) patch.discord_sent = true
            if (hasX()) {
              const r = await postToX(text, { poll: { options: pollNames, durationMinutes: BOTPOLL_DURATION_MIN } })
              if (r.ok && r.id) patch.x_post_id = r.id
              else console.error(`[homers] botpoll refused: ${r.status} ${r.error}`)
            }
            await db.from('homer_feed_posts').update(patch).match({ day, kind: 'botpoll' })
          }
        }
      }
    }
  }

  // ── MID-SLATE STAT-FEED REPOSTS (2026-09-07) ────────────────────────────
  // Deliberately OUTSIDE the `!started || overdue` gate above -- these fire
  // once the slate is already live, same board data (the underlying rates
  // don't move once first pitch happens), reworded ("still cooking" /
  // "still dangerous") for whoever's actually watching a game right now
  // instead of scrolling at 1pm. Independently claimed, so a slow tick or a
  // restart can never double-post either one.
  //
  // These two also require the slate to actually be UNDERWAY -- every early
  // return in the pregame block above is guarded on `!started`, so on a night
  // where first pitch is 7pm ET this code is unreachable until a game goes
  // Live. That is deliberate now the thresholds moved up: "still cooking" at
  // 4pm ET on a slate where nothing has started yet would be a lie. 4pm/7pm ET
  // are the EARLIEST these can fire, not a guarantee.
  {
    const hc = hottestContactPicks(midRows())
    await claimAndPostStat(db, day, 'hotcontact_mid', HOTTEST_CONTACT_MID_HOUR,
      hottestContactText(hc, { day, ...TAIL, variant: 'mid' }),
      hc.length ? {
        pill: 'HOT', label: 'HOT ZONE: STILL LIT',
        headline: "Tonight's hottest recent blast rates",
        lines: hc.map((p) => `${p.name} (${p.team || '?'}) — ${p.blastPct}% blast vs ${p.pitcher}${p.pitcherTeam ? ` (${p.pitcherTeam})` : ''}`),
      } : null)
  }
  {
    const dc = dangerComboPicks(midRows())
    await claimAndPostStat(db, day, 'dangercombos_mid', DANGER_COMBOS_MID_HOUR,
      dangerComboText(dc, { day, ...TAIL, variant: 'mid' }),
      dc.length ? {
        pill: 'KILL', label: 'KILL LIST: STILL LIVE',
        headline: 'Hot bats vs pitchers getting hit hard lately',
        lines: dc.map((p) => `${p.name} (${p.blastPct}% blast) vs ${p.pitcher} (${p.pitcherHrBbePct}% HR/BBE)`),
      } : null)
  }
  // ── MATCHUP HISTORY, LATE WAVE (2026-09-15, Donovan: "this can fire later
  //    in the day or middle slate for a liter game"). Same StatsAPI pull as
  //    the day wave, but against midRows() (live-filtered, so a scratched or
  //    already-finished hitter can't show up) and excluding whoever the day
  //    wave already named, so a 7pm West-Coast slate gets fresh names instead
  //    of a rerun. Wrapped in safeStat: this is the one mid-slate repost that
  //    touches the network (StatsAPI, plus a read-back for the exclude set),
  //    unlike hotcontact_mid/dangercombos_mid just above which only re-rank
  //    the board already in memory.
  await safeStat('matchuphistory_late', async () => {
    const seen = await matchupHistorySeenIds(db, day)
    const lines = await vsPitcherCareerLines(midRows(), { exclude: seen })
    const hrPicks = hrVsStarterPicks(lines)
    await claimAndPostStat(db, day, 'matchup_hr_late', MATCHUP_LATE_HOUR,
      hrVsStarterText(hrPicks, { day, ...TAIL, wave: 'late' }),
      hrPicks.length ? {
        pill: 'HISTORY', label: 'HR HISTORY — LATE SLATE',
        headline: hrPicks[0]?.name ? `${hrPicks[0].name} has gone deep on tonight's arm before` : 'Tonight\'s late-slate history vs the starter',
        lines: hrPicks.map((p) => `${p.name}${p.team ? ` (${p.team})` : ''} — ${p.hr}x off ${p.pitcher}`),
      } : null,
      { picks: hrPicks })
    const careerPicks = careerVsStarterPicks(lines)
    await claimAndPostStat(db, day, 'matchup_career_late', MATCHUP_LATE_HOUR,
      careerVsStarterText(careerPicks, { day, ...TAIL, wave: 'late' }),
      careerPicks.length ? {
        pill: 'HISTORY', label: 'WHO OWNS HIM — LATE SLATE',
        headline: careerPicks[0]?.name ? `${careerPicks[0].name} vs ${careerPicks[0].pitcher}` : 'Tonight\'s late-slate best line vs the starter',
        lines: careerPicks.map((p) => `${p.name} — ${p.h}-for-${p.ab} vs ${p.pitcher}`),
      } : null,
      { picks: careerPicks })
  })

  const homers = homersFrom(snap, day, board, odds)
  const totals = { day, seen: homers.length, fresh: 0, discord: 0, x: 0, xFailed: 0, board: board.size, mode: MODE, backfill }

  // ── 1. claim the new ones ────────────────────────────────────────────────
  let freshKeys = new Set()
  if (homers.length) {
    const { data: claimed, error } = await db
      .from('homer_feed')
      .upsert(homers.map(strip), { onConflict: 'day,player_id,hr_n', ignoreDuplicates: true })
      .select('player_id,hr_n')
    if (error) {
      console.error('[homers] insert failed: ' + error.message)
      return Response.json({ ...totals, error: 'insert-failed' })
    }
    freshKeys = new Set((claimed || []).map((r) => `${r.player_id}:${r.hr_n}`))
    totals.fresh = freshKeys.size
  }

  // ── 2. the hooks, for the rows this run created ──────────────────────────
  //
  // Computed once, here, and written to the row. The partner check needs
  // tonight's other homers, the back-to-back check needs last night's, the
  // record needs his earlier rows; three small reads shared by every fresh
  // homer in this tick.
  if (freshKeys.size) {
    const todayIds = new Set(homers.map((h) => String(h.player_id)))
    const [{ data: yRows }, { data: tonightRows }, { data: recent }] = await Promise.all([
      db.from('homer_feed').select('player_id').eq('day', shiftDay(day, -1)),
      db.from('homer_feed').select('player_id,name,inning,partner_id').eq('day', day),
      db.from('homer_feed').select('day,role').gte('day', shiftDay(day, -12)).lt('day', day).eq('role', 'TOP'),
    ])
    const yesterdayIds = new Set((yRows || []).map((r) => String(r.player_id)))
    const topStraight = topStreakFrom(recent || [], day, true)
    for (const ev of homers) {
      if (!freshKeys.has(`${ev.player_id}:${ev.hr_n}`)) continue
      const [{ data: hist }, { jersey, birthDate }] = await Promise.all([
        db.from('homer_feed').select('role').eq('player_id', ev.player_id).lt('day', day).order('day', { ascending: false }).limit(5),
        personInfoOf(ev.player_id),
      ])
      const partner = partnerFor(pairs, ev.player_id, ev.name)
      const hooks = hooksFor(ev, { pairs, board, todayIds, yesterdayIds, history: hist || [], jersey, birthDate, pairedEarlier: tonightRows || [], topStraight })
      const stats = { ...(ev.stats || {}), jersey, birthDate }
      ev.hooks = hooks
      ev.stats = stats
      ev.partner_id = partner?.id || null
      await db.from('homer_feed').update({ hooks, stats, partner_id: ev.partner_id }).match({ day, player_id: ev.player_id, hr_n: ev.hr_n })
    }
  }

  // ── 2.5. the numerology moment, checked every tick, posted at most once ──
  //
  // Unlike pairswatch/longshot (pregame, off the published board), this
  // depends on homers that have ACTUALLY happened tonight, so it reads back
  // every one of today's rows -- not just this tick's fresh ones -- and
  // re-checks as the night's homer count grows. Same one-claim-per-day
  // pattern as every other kind on homer_feed_posts.
  {
    const { data: dayRows } = await db.from('homer_feed').select('player_id,name,team,opponent,role,hr_n,stats').eq('day', day)
    const moment = numerologyMoment(dayRows || [])
    if (moment) {
      const claim = await claimSlot(db, day, 'numerology')
      if (claim) {
        const text = numerologyText(moment, { day, ...TAIL })
        const patch = { payload: { moment } }
        // Rendered above the Discord post so both services take one render --
        // see claimAndPostStat. Sat inside the X branch, which left Discord
        // with bare text and built nothing at all on a night with X off.
        const png = await bytesOf(() => numerologyCard(day, moment, { site: SITE_HOST }))
        const d = await postToDiscord(text, { png }, FEED_WEBHOOKS())
        if (d.ok) patch.discord_sent = true
        if (hasX()) {
          const mediaId = png ? await uploadImageToX(png) : null
          const r = await postToX(text, { mediaId })
          if (r.ok && r.id) patch.x_post_id = r.id
          else console.error(`[homers] numerology refused: ${r.status} ${r.error}`)
        }
        await db.from('homer_feed_posts').update(patch).match({ day, kind: 'numerology' })
      }
    }
  }

  // ── 3. post whatever is still unposted for today (fresh + earlier failures) ─
  //
  // Reading back from the table rather than from `claimed` is deliberate: a
  // homer whose post failed last minute has a row with x_post_id null and
  // discord_sent false, and this is what retries it. Bounded so a dead X key
  // cannot turn every tick into forty failed requests forever.
  const { data: pending } = await db
    .from('homer_feed')
    .select('*')
    .eq('day', day)
    .or(DISCORD_ON ? 'discord_sent.eq.false,x_post_id.is.null' : 'x_post_id.is.null')
    .order('seen_at', { ascending: true })
    .limit(12)

  const byKey = new Map(homers.map((h) => [`${h.player_id}:${h.hr_n}`, h]))
  const xOn = hasX()
  // 2026-09-06: X posting went silent for 90+ minutes with zero logged
  // errors — hasX() was apparently false at request time even though the
  // X_* env vars looked present and unchanged in the dashboard, across two
  // different production deployments. Root cause was never pinned (looked
  // like a Vercel Sensitive-env-var resolution issue, not an app bug), so
  // this loud, cheap check means the NEXT occurrence is a one-line log
  // instead of an hour of Vercel-log archaeology.
  if ((pending || []).length && !xOn) {
    console.error(`[homers] ${pending.length} pending row(s) want X but hasX() is false: ${xProblem()}`)
  }
  // The morning's call, so a homer by one of its names quotes it.
  const { data: pre } = await db.from('homer_feed_posts').select('x_post_id,payload').match({ day, kind: 'pregame' }).maybeSingle()
  // `called` is every roled name on the board; `picks` is only the ten that
  // fit the tweet. Fall back to picks so a pregame row written before this
  // shipped (no `called` key) still quotes for its ten.
  const preIds = new Set(
    (pre?.payload?.called || []).length
      ? (pre.payload.called).map((id) => String(id))
      : ((pre?.payload?.picks) || []).map((p) => String(p.player_id))
  )
  const quoteFor = (row) => (pre?.x_post_id && preIds.has(String(row.player_id)) ? pre.x_post_id : null)
  for (const row of pending || []) {
    const live = byKey.get(`${row.player_id}:${row.hr_n}`)
    const ev = { ...row, _roles: live?._roles || row.role || '' }
    const text = postText(ev, TAIL)
    const patch = {}
    let stopTick = false

    if (DISCORD_ON && !row.discord_sent) {
      const r = await postToDiscord(text, { imageUrl: cardUrl(row) })
      if (r.ok) { patch.discord_sent = true; totals.discord += 1 }
    }
    const wantsX = xOn && (MODE === 'all' || Boolean(row.role))
    if (!row.x_post_id) {
      if (wantsX) {
        // CLAIM BEFORE POSTING (2026-09-06). This used to SELECT the pending
        // rows, then post to X, then write x_post_id back -- three separate
        // round trips with a real network call to X sitting in the middle.
        // A card render + image upload + post that is still running when the
        // next minute's cron starts finds the SAME row still at x_post_id
        // null and posts it again -- Donovan caught this live, two homers
        // doubled on X.
        //
        // The fix is a conditional UPDATE ... WHERE x_post_id IS NULL before
        // any of that work happens: the same insert-and-see-what-stuck shape
        // every other dedupe in this file already uses, just against an
        // UPDATE instead of an INSERT. Only the tick that actually flips the
        // null to a sentinel gets to post this row; a tick racing it for the
        // same row gets zero rows back from `.select()` and leaves it alone.
        const { data: claim, error: claimError } = await db
          .from('homer_feed')
          .update({ x_post_id: 'posting' })
          .match({ day, player_id: row.player_id, hr_n: row.hr_n })
          .is('x_post_id', null)
          .select('player_id')
        // NOT claimSlot: this is a conditional UPDATE on homer_feed, not an
        // upsert on the (day, kind) table, and `claim` here is the row array
        // -- an EMPTY array means another tick won the race, so the length
        // check is what prevents the double-post above and must stay.
        if (claimError) console.error(`[homers] alert claim failed for ${row.player_id}: ${claimError.message}`)
        if (claim?.length) {
          // Card first, then the post with it attached. Either half of the
          // image step failing degrades to a text post, never to no post.
          const png = await bytesOf(() => homerCard(ev, { site: SITE_HOST }))
          const mediaId = png ? await uploadImageToX(png) : null
          const r = await postToX(text, { mediaId, quoteId: quoteFor(row) })
          if (r.ok && r.id) { patch.x_post_id = r.id; totals.x += 1 }
          else {
            totals.xFailed += 1
            console.error(`[homers] X refused ${row.name}: ${r.status} ${r.error}`)
            // A refused post is not a posted post -- release the claim so the
            // next tick retries instead of the sentinel hiding this homer
            // forever. (One gap left on purpose: a run killed by the 60s
            // limit between the claim above and this line leaves the row
            // stuck at 'posting' rather than retried. Rare, and the recovery
            // is the same as any other stuck row here — a manual UPDATE
            // clearing x_post_id — rather than something worth a second
            // moving part for.)
            patch.x_post_id = null
            // A quota or auth refusal will refuse every row; stop spending
            // the tick, but only once this row's own patch (the claim
            // release) is written below.
            if (r.status === 429 || r.status === 401 || r.status === 403) stopTick = true
          }
        }
      } else if (xOn) {
        // Not going to X by policy (flagged mode, no role) — mark it so it
        // stops showing up as pending. With X unconfigured the null stays, so
        // the night's rows post the moment the keys land.
        patch.x_post_id = 'skipped'
      }
    }
    if (Object.keys(patch).length) {
      await db.from('homer_feed').update(patch).match({ day, player_id: row.player_id, hr_n: row.hr_n })
    }
    if (stopTick) break
  }

  // ── 4. the recap, once, when the night is over ───────────────────────────
  // 2026-09-08: `.every()` on an empty array is vacuously true -- if the live
  // snapshot is down or empty (see gamesLive above) this must NOT read as
  // "every game is done" and fire the recap early. Require at least one
  // known game before trusting the every().
  const allDone = gamesLive.length > 0 && gamesLive.every((g) => g?.settled || g?.postponed || g?.suspended || g?.state === 'Final')
  if (allDone) Object.assign(totals, await postRecap(db, day))

  // ── 5. THE MONTHLY X BUDGET, COUNTED (2026-09-07) ────────────────────────
  // Nothing here has ever counted posts against the tier's monthly ceiling,
  // so the first symptom of exhausting it is posts silently stopping -- the
  // same shape of failure as the kind_check no-op that ate a week. This is a
  // read-only count of what actually posted this calendar month: homer alerts
  // carrying a REAL tweet id (the 'posting' and 'skipped' sentinels are not
  // posts) plus the once-a-day posts.
  //
  // It deliberately never blocks a post. A guard that silences the whole feed
  // on a miscount is a worse outcome than the overage it prevents, so this
  // logs and reports and that is all. Counted only on ticks that actually
  // posted (~30-40 a day, not 1,440) to keep it off the database's neck.
  // Shared with app/api/dash/nfl/tick/route.js (lib/dash/xBudget.js) so the
  // NFL tick can log against the same running total on nights this route
  // never fires at all -- see that file's own header note.
  if (totals.x > 0) {
    totals.xMonth = await logXBudget(db, day, { mode: MODE, cap: X_MONTHLY_CAP })
  }

  totals.statErrors = statErrors
  totals.discordErrors = discordFailuresSnapshot()
  return Response.json(totals)
}
