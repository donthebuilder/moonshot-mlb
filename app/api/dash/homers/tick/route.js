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

import { mlbQuotes } from '../../../../../lib/dash/quoteFor'
import { playerHref } from '../../../../../lib/routes'
import { storyThreadsOn, postStoryResults } from '../../../../../lib/dash/storyThread'
import { gameCalls, gameCallText } from '../../../../../lib/dash/gameCall'
import { sendMembers, retryMembers } from '../../../../../lib/writeups/discordRoute'
import { buildMlbWriteup } from '../../../../../lib/writeups/mlb'
import { renderWriteup } from '../../../../../lib/writeups/text'
import { postLimit } from '../../../../../lib/dash/postLimit'
import { xDailyAllows } from '../../../../../lib/dash/xBudget'
import { admit, xOk, recentNamed, repeatCheck, logPosted, logDroppedRepeat, scheduleGate, setScheduleContext } from '../../../../../lib/dash/xGate'
import { windowOpen, payloadFor } from '../../../../../lib/dash/xSchedule'
import { namedInText, withNamed, isRetiredForever } from '../../../../../lib/dash/xPolicy'
import { resolveNaming, mlbNamingProblem } from '../../../../../lib/dash/namingChecks'
import { postSlateOnce } from '../../../../../lib/posts/slate'
import { periodsDue, postPeriodOnce, postReceiptOnce } from '../../../../../lib/posts/receipt'
import { receiptLoader } from '../../../../../lib/posts/receiptLoad'
import { phxClock } from '../../../../../lib/dash/xSchedule'
import { slateLoader } from '../../../../../lib/posts/slateLoad'
import { recordPost } from '../../../../../lib/dash/xPostLog'
import { isRested } from '../../../../../lib/dash/xRest'
import { xEventsCalledOnly } from '../../../../../lib/dash/xEvents'
import { timingSafeEqual } from 'node:crypto'

import { easternToday, etHoursSinceNoon, slateDateFromRows, shiftDay } from '../../../../../lib/data'
import { callStatus } from '../../../../../lib/callStatus'
import { mlbWatch, historyWatchText, reachedLine } from '../../../../../lib/history/watch'
import { fetchLiveSlate, liveSlateStatus } from '../../../../../lib/liveSlate'
import { fetchBoardFull, fetchRunMeta } from '../../../../../lib/dash/board'
import { dataUrl, oddsPaths, pairSummaryPaths } from '../../../../../lib/dataSource'
import { primaryRole, boardIndexFrom, moonshotBoardRanking, moonshotBoardText, boardRolePicks, boardRoleText, homersFrom, hooksFor, longshotPick, longshotText, numerologyMoment, numerologyText, pairsToWatch, pairsToWatchText, partnerFor, postText, pregameCalled, pregamePicks, topStreakFrom } from '../../../../../lib/dash/homerFeed'
import { homerCard, mlbhrCard, hotStretchCard, longshotCard, numerologyCard, pairsCard, statCard } from '../../../../../lib/dash/homerCard'
import {
  backToBackPicks, backToBackText, bestAirPicks, bestAirText, 
  careerVsStarterPicks, careerVsStarterText, dangerComboPicks, dangerComboText, fetchWeekdayHrLeaders, funFactsPicks, funFactsText,
  hottestContactPicks, hottestContactText, hrLeadersByDowText, hrVsStarterPicks, hrVsStarterText, liveIndexFrom, matchupLinesPicks, matchupLinesText,
  milestonePicks, milestoneText, playableRows, revengeGiveawayPicks, revengeGiveawayText, storylinesPicks, storylinesText, storylineWatchPicks, storylineWatchText,
  streaksPick, streaksText, vsPitcherCareerLines,
  boardPitchersFresh, scheduleFor, boardGamesToday, onSlateTonight, hotStretchPicks, hotStretchText,
  anglesText, hotSheetText,
} from '../../../../../lib/dash/tweetFeed'
import { threadsSnapshot } from '../../../../../lib/dash/threadsPost'
import { tailFor as linkTailFor, postPath } from '../../../../../lib/dash/postLink'
import { MLBHR_USER_ID, matchHomer, mayClaimHomer, mlbhrReplyText, parseMlbhr } from '../../../../../lib/dash/mlbhr'
import { getFromX } from '../../../../../lib/dash/xPost'
import { discordFailuresSnapshot, hasX, postToDiscord, postToX, uploadImageToX, xProblem } from '../../../../../lib/dash/xPost'
import { isMaintenanceMode } from '../../../../../lib/edgeConfig'
import { backfillOneNight } from '../../../../../lib/dash/homerBackfill'
import { logXBudget } from '../../../../../lib/dash/xBudget'
import { postLongshotsOnce } from '../../../../../lib/dash/longshotsPost'
import { mlbLatestOdds } from '../../../../../lib/odds/latest'
import { postMultiClubOnce } from '../../../../../lib/dash/multiClubPost'
import { mlbSeasonActive, postseasonOn, priorPostseasonHr } from '../../../../../lib/dash/seasonGuard'
import { storiesTick } from '../../../../../lib/stories/record'
import { mlbNumerologyWrite, mlbNumerologyGrade } from '../../../../../lib/numerology/mlbWriter'
import { postMlbListOnce } from '../../../../../lib/lists/post'
import { adminClient } from '../../../../../lib/supabase/admin'
import { claimSlot as sharedClaimSlot, bytesOf as sharedBytesOf, knownTaken, markTaken } from '../../../../../lib/dash/postClaim'
import { ordinal } from '../../../../../lib/format'
import { feedHooks, withReceipts } from '../../../../../lib/dash/discordChannels'
import { postMembers, membersWebhook, MEMBERS_KINDS, mlbMembersBoard, mlbMembersGrade } from '../../../../../lib/dash/membersPost'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const SITE = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
const CALLED_URL = SITE ? `${SITE}/called` : ''
// WHERE AN ANCHOR POST SENDS: every one went to /start from 09-22, and
// /start's buttons went to /called and back. Since funnel step 2 (09-26)
// each kind links to what it is about -- lib/dash/postLink.js postPath().
const SITE_HOST = SITE.replace(/^https?:\/\//, '') || 'dashnetwork.vercel.app'
const HANDLE = String(process.env.X_HANDLE || '').trim()          // e.g. "@dashnetwork" — optional
// NO URL IN THE POST TEXT (2026-09-05). X's pay-per-use pricing: a post is
// $0.015, a post CONTAINING A URL is $0.200 — thirteen times the price for a
// link that already sits in the account's bio. The card and Discord embeds
// still carry the page; the tweet text does not. `site` is passed empty to
// every text builder for that reason. Set X_POST_LINK=1 to put it back if X
// ever changes the rule.
// THE LINK IS PER-KIND NOW (2026-09-22) -- see lib/dash/postLink.js. TAIL is
// the default for every post that is NOT an anchor, which is almost all of
// them, and stays empty. Anchor posts call tailFor(kind) instead.
//
// Why it changed: X_POST_LINK=1 put the URL on all 44 builders here AND on the
// per-homer alert -- 55 posts on 09-21, each priced at $0.200 instead of
// $0.015. About $330/month for a link under every homer, which is also the
// pattern that teaches people to ignore it.
const TAIL = { site: '', handle: '' }
// WHERE (funnel step 2, 2026-09-26): postPath() -- the board, the record or
// the player the post is about. The anchor list and X_POST_LINK are unchanged.
const tailFor = (kind, ctx) => linkTailFor(kind, { site: SITE ? `${SITE}${postPath(kind, ctx)}` : '', handle: HANDLE })
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
// 2026-10-02: shared with the NFL/NHL ticks via lib/dash/discordChannels.js.
const FEED_WEBHOOKS = () => feedHooks('mlb')

// THE DAY'S MORNING POST, WHICHEVER KIND (2026-10-09): THE SLATE replaced the pregame post, so a day is read as its
// 'slate' row, else (a day before the Slate, or history) its 'pregame' row. The accountability grade, the receipt
// quote and the /called list all read the names a post really named from the row this returns.
async function morningPost(db, day, cols = 'payload') {
  const { data } = await db.from('homer_feed_posts').select(`kind,${cols}`).eq('day', day).in('kind', ['slate', 'pregame'])
  return (data || []).find((r) => r.kind === 'slate') || (data || []).find((r) => r.kind === 'pregame') || null
}

// THE SLATE (2026-10-09, X overhaul piece 3): ONE cross-sport post a day that replaced callofnight, the pregame
// post (THE CALLED SHOTS) and thefour. It is tried on EVERY tick, across sports, because it is not MOONSHOT's:
// a football-only or hockey-only day has no MLB games and must still get its Slate. It decides its own timing
// (lib/posts/slate.js: ready an hour before the first game it covers, held for unconfirmed names until 30
// minutes before) and mirrors as plain text to the free feed channels the pregame post mirrored to. Never throws.
async function slateTick(db, { day, rows = [], live = null, hold = null, firstStartMs = NaN }) {
  try {
    return await postSlateOnce(db, { day, hooks: FEED_WEBHOOKS(), load: slateLoader({ day, mlb: { rows, live, hold, firstStartMs } }) })
  } catch (err) {
    console.error('[homers] slate threw', err)
    return `error: ${String(err?.message || err)}`
  }
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
// ── WHICH POSTS RUN (tweets fix step 3, 2026-09-26, Donovan: "yes" to the
// plan's list). 23 kinds went out on 09-26 and the feed read like yesterday.
//   DAILY     the calls (Called Shots, the board), ONE morning "last night"
//             post (accountability, 8am ET, grades yesterday's calls),
//             numerology, the call of the night, history watch (only when a
//             claim passes), and the weekly/monthly summaries. Homer alerts
//             never come through here and are never gated.
//   ROTATION  one a day at most, by date: matchup HR, best air, hot contact,
//             storylines, pairs, hot week, hot month.
//   OFF       everything else (danger combos, matchup lines, career matchups,
//             HR leaders by day, back-to-back, bot poll, community pick,
//             storyline watch, longshot, The Four, board results, the night
//             recap...).
// POST_KINDS_ON (Vercel env, comma list, or 'all') replaces all of it
// without a deploy.
const DAILY_KINDS = new Set(['board', 'numerology', 'history_watch'])   // 2026-10-09: pregame + callofnight left (THE SLATE, lib/posts/slate.js, is claimed by its own runner); accountability, weekly and monthly left too (THE NIGHT RECEIPT, lib/posts/receipt.js, claims its own)
const ROTATION_KINDS = ['matchup_hr', 'bestair', 'hotcontact', 'storylines', 'pairswatch', 'hot_week', 'hot_month']
function postKindOn(kind, day) {
  // THE CALL, one per postseason game (call_<game_pk>, lib/dash/gameCall):
  // claimable whenever per-game posting is on for the day.
  if (String(kind).startsWith('call_')) return perGameOn(day)
  const env = String(process.env.POST_KINDS_ON || '').trim()
  if (env.toLowerCase() === 'all') return true
  if (env) return env.split(',').map((k) => k.trim()).includes(kind)
  if (DAILY_KINDS.has(kind)) return true
  const i = ROTATION_KINDS.indexOf(kind)
  if (i < 0) return false
  const dayNo = Math.floor(Date.parse(`${day}T12:00:00Z`) / 864e5)
  return dayNo % ROTATION_KINDS.length === i
}

// Per-game posting (postseason plan step 3) from this day on; X_PER_GAME=off
// turns it off. 2026-09-29 is the first Wild Card day.
const PER_GAME_FROM = String(process.env.X_PER_GAME_FROM || '2026-09-29').trim()
function perGameOn(day) { return !/^off$/i.test(String(process.env.X_PER_GAME || '')) && String(day) >= PER_GAME_FROM }
// A game's call posts once both lineups are confirmed and inside this window
// before its first pitch -- never after it starts.
const PER_GAME_LEAD_MS = 4 * 60 * 60 * 1000
let _mlbMembersRetryAt = 0   // when this instance last looked for a failed #members copy to retry

// lib/dash/postClaim.js (R3), with this tick's own gates
const claimSlot = (db, day, kind) => sharedClaimSlot(db, day, kind, { gate: (k, d) => postKindOn(k, d) && !isRested(k) && !isRetiredForever(k), tag: 'homers' })

// `payload` (2026-09-15, matchup-history posts): every other caller leaves
// this at the default `{}` -- claimAndPostStat has never persisted anything
// beyond the claim itself. The two new matchup-history kinds are the first
// that need a later tick to read back WHO got named (the late wave's
// exclude-set, see matchupHistorySeenIds below), so this is now a real
// parameter instead of a hardcoded literal. Optional and additive: every
// existing call site is unaffected.
// TEXT-ONLY POSTS (2026-09-18, Donovan: "honestly also alot of the tweets dont
// need cards either").
//
// The precedent is his own, from 2026-09-15 -- "some of these I just wanted
// tweets and no card... a decent list of names on tweet so people can
// screenshot and share" -- which is why matchup history, milestone watch and
// revenge/giveaways already pass null. This extends the same call to every
// other plain LIST post: a stacked list of names is already legible as text,
// and a card on it costs a render plus an X media upload to say the same thing
// twice.
//
// Cards are kept where the image carries analysis the text cannot: the homer
// alert and recap (their own bespoke cards, not routed through here), the
// pregame call, tonight's board, pairs, the longest call, numerology, and the
// new hot-stretch post (a six-line slash line is exactly what a stat card is
// for).
//
// Done HERE, in one set, rather than by editing fourteen call sites: the card
// specs stay in the code, correct and ready, so putting one back is deleting a
// string from this list rather than rebuilding a card from scratch.
const TEXT_ONLY_KINDS = new Set([
  'hotcontact', 'history_watch',
  'dangercombos',
  'hrleadersdow', 'backtoback', 'birthday', 'funfacts',
  'matchuplines', 'streaks', 'storylines', 'bestair',
])

// THE MERGE (2026-09-18, Donovan: "add more to the tweet this what im saying
// like the storylin and stuff acna bee really big tweet or two"). Eighteen thin
// slots stop posting on their own and come back as two long posts -- TONIGHT'S
// ANGLES and THE HOT SHEET -- built from the exact same picks arrays their old
// posts used. Nothing is deleted: every builder, card spec and call site below
// stays where it is, so restoring a slot is deleting a string from this set.
//
// Read twice: claimAndPostStat refuses a retired kind outright (the guarantee),
// and the blocks that make a NETWORK call to build their picks check isRetired()
// before spending the round trip (the saving).
// 2026-09-18, SECOND PASS. Donovan read the two merged posts rendered at full
// length and called the packaging, not the information: "874 characters is not
// a tweet... you have five separate content products being forced together.
// Don't delete the information. Split it." Same for THE HOT SHEET at 762.
//
// So the eight slots those two absorbed come back, each rewritten to the copy
// he specified -- standard baseball language in the headline, a labelled
// window line, a human closer -- and ANGLES and HOT SHEET retire in their
// place. This is not a revert: the originals were three-name lists with no
// frame, and what comes back is four or five names with a label and a closing
// thought. The merge was the right instinct at the wrong grain.
//
// Still retired, and these were the ones he actually marked: the two reworded
// mid-slate repeats, the second helping of the milestone post, three of the
// four identical storyline slots, and the two posts where "nothing here is
// yours."
const RETIRED_KINDS = new Set([
  'angles', 'hotsheet',
  'birthday', 'funfacts', 'streaks',
  'milestone_mid', 'revenge_giveaway',
  'storyline_watch_2', 'storyline_watch_3', 'storyline_watch_4',
])
const isRetired = (kind) => RETIRED_KINDS.has(kind) || isRested(kind)   // + the postseason rest (lib/dash/xRest)

// `renderCard` (2026-09-18): a post whose card is its OWN design rather than
// the generic statCard passes a thunk here and leaves cardSpec null. Optional
// and additive -- every existing call site keeps the statCard path.
// NOTHING TO SAY, REMEMBERED 10 MIN (2026-10-05, egress round 3): a slot whose text came
// out empty claims nothing, so knownTaken never set and its exclude read (storylineSeenTexts,
// hotStretchSeenIds...) ran again every minute all evening. The picks only change as
// lineups confirm; ask again in 10 minutes.
const _emptyAt = new Map()
const EMPTY_RETRY_MS = 10 * 60e3
const triedEmpty = (day, kind) => Date.now() - (_emptyAt.get(`${day}|${kind}`) || 0) < EMPTY_RETRY_MS

/** The cheap window check before a scheduled kind builds its text (lib/dash/xSchedule.windowOpen); `hour` is only the X_SCHEDULE_OFF fallback. */
const hourOk = (hour, kind) => windowOpen({ kind, legacyHour: hour })

async function claimAndPostStat(db, day, kind, hourGate, text, cardSpec, payload = {}, renderCard = null) {
  if (isRetired(kind)) return false
  // THE SCHEDULER (2026-10-09, lib/dash/xSchedule.js): the hour is a floor only when X_SCHEDULE_OFF=on; otherwise
  // windowOpen is the cheap period check before the text is used, and scheduleGate (slot, 45-min gap, no same kind
  // back to back, sport mix, priority near the budget) is the real question. Held = nothing claimed; the next tick asks again.
  const open = windowOpen({ kind, legacyHour: hourGate })
  if (!text && open) { if (_emptyAt.size > 500) _emptyAt.clear(); _emptyAt.set(`${day}|${kind}`, Date.now()) }
  if (!text || !open) return false
  if (!(await scheduleGate(db, { kind, day, legacyHour: hourGate })).ok) return false
  // THE REPEAT GUARD (2026-10-09): the same player in the same kind not within 3
  // days. Checked before the claim, so a post that would repeat a name claims
  // nothing (the picks change as lineups land and it asks again; the log says
  // it once). Kinds whose payload carries no player ids are not guarded here.
  const named = namedInText(payload, text)
  const repeats = await repeatCheck(db, { day, kind, ids: named })
  if (repeats.length) { logDroppedRepeat({ day, kind }, `${repeats.slice(0, 4).join(', ')} named too recently`); return false }
  if (!(await claimSlot(db, day, kind))) return false
  const card = TEXT_ONLY_KINDS.has(kind) ? null : cardSpec
  const custom = TEXT_ONLY_KINDS.has(kind) ? null : renderCard
  const patch = { payload: { ...(named.length ? withNamed(payload, named) : payload), ...payloadFor(kind) } }   // x_tag INFO/FUN + the overnight experiment mark
  // ONE RENDER, BOTH PLACES (2026-09-07). The card used to be built inside the
  // `hasX()` branch, below Discord, so Discord got bare text while a finished
  // PNG existed a few lines later -- and on a night with X off it was never
  // built at all. Now it is rendered once, up front, and both take it.
  const png = custom
    ? await bytesOf(custom)
    : card ? await bytesOf(() => statCard(day, card, { site: SITE_HOST })) : null
  const d = await postToDiscord(text, { png }, FEED_WEBHOOKS())
  if (d.ok) patch.discord_sent = true
  // The daily cap, by tier (lib/dash/xPolicy + xGate): the call of the night is
  // the slate tier, the receipts and write-ups next, then facts, polls, numerology.
  if (hasX() && await xOk(db, { day, kind, ids: named, repeat: false })) {
    const mediaId = png ? await uploadImageToX(png) : null
    // `kind` rides along for the Threads mirror only -- it decides whether
    // this post gets a funnel link under it (lib/dash/threadsLink.js). X
    // ignores it entirely.
    const r = await postToX(text, { mediaId, kind })
    if (r.ok && r.id) { patch.x_post_id = r.id; logPosted({ day, kind, ids: named, tweetId: r.id, text }) }
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

// WHO THE MORNING HOT-STRETCH POST NAMED (2026-09-18). Same shape as
// milestoneSeenIds above: the 5pm week wave reads the 7am month wave's payload
// back so the two never feature the same player on the same day.
async function hotStretchSeenIds(db, day) {
  try {
    const { data } = await db.from('homer_feed_posts').select('payload').eq('day', day).eq('kind', 'hot_month')
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
      .in('kind', ['funfacts', 'matchuplines', 'angles', 'storyline_watch_1', 'storyline_watch_2', 'storyline_watch_3', 'storyline_watch_4'])
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
  return adminClient()
}

// ── the published files, cached per instance ───────────────────────────────
const TTL_MS = 10 * 60 * 1000
const MISS_MS = 2 * 60 * 1000   // a not-yet-today board is re-asked this often (cost cut)
const _cache = { board: { at: 0, day: '', index: null }, odds: { at: 0, data: null }, pairs: { at: 0, data: null } }

async function boardIndex(day) {
  const c = _cache.board
  if (c.index && c.day === day && Date.now() - c.at < TTL_MS) return c.index
  // COST CUT (2026-09-27): until today's board is up, the 4 MB file was
  // re-downloaded and parsed every minute. A board that isn't today's yet (or
  // is empty) is now re-asked every two minutes -- the pregame posts can wait
  // one more minute; the function-seconds and transfer halve.
  if (c.missAt && c.missDay === day && Date.now() - c.missAt < MISS_MS) return c.missIndex
  const rows = await fetchBoardFull('today').catch(() => null)
  const index = boardIndexFrom(rows)
  // An empty board is not cached: a bot that has not published yet should be
  // asked again next minute, not remembered as "nobody is on it" for ten.
  // NOR IS ANOTHER DAY'S BOARD (2026-09-26, the stale Called Shots): the
  // rows' own game times say which day they are. Caching yesterday's rows
  // under today's key kept them for ten minutes after the bot published --
  // while run_meta, fetched separately, already said today. Asked again next
  // tick instead, until the rows themselves are today's.
  if (index.size && slateDateFromRows(rows) === day) _cache.board = { at: Date.now(), day, index, rows }
  else _cache.board = { at: 0, day: '', index: null, rows: index.size ? rows : (c.rows || []), missAt: Date.now(), missDay: day, missIndex: index }
  return index
}
const boardRows = () => _cache.board.rows || []
const FREE_PREGAME_N = 5

// THE LOCKED BOARD, NOT THE LIVE ONE (2026-10-04, record audit B). A homer's
// role / on_board / hr_score / board_rank came from the published board at the
// moment of the homer -- a board the bot rebuilds through the day -- so 448 of
// 552 checked homer_feed rows carried an in-game rank or score, and 22 changed
// CALLED / ON THE BOARD. The prediction of record (por_rows_<date>.jsonl, one
// row per rated hitter, written at each game's lock) is what was called; a
// homer in a locked game takes its values from there. A game with no lock row
// yet keeps the live board's values and says so (stats.board_source 'live').
const _lock = { day: '', at: 0, idx: null }
async function lockIndex(day) {
  if (_lock.idx && _lock.day === day && Date.now() - _lock.at < 2 * 60 * 1000) return _lock.idx
  const txt = await fetch(dataUrl(`current/por_rows_${day}.jsonl`), { cache: 'no-store' }).then((r) => (r.ok ? r.text() : '')).catch(() => '')
  const rows = String(txt).split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)
  const byKey = new Map(); const games = new Set(); let of = 0
  for (const r of rows) {
    byKey.set(`${r.game_pk}|${r.player_id}`, r)
    games.add(String(r.game_pk))
    of = Math.max(of, Number(r?.scores?.board_rank) || 0)
  }
  const idx = { byKey, games, of: of || null }
  _lock.day = day; _lock.at = Date.now(); _lock.idx = idx
  return idx
}
function withLockedBoard(homers, lock) {
  if (!lock?.games?.size) return homers.map((h) => (h.on_board ? { ...h, stats: { ...(h.stats || {}), board_source: 'live' } } : h))
  return homers.map((h) => {
    if (!lock.games.has(String(h.game_pk))) return h.on_board ? { ...h, stats: { ...(h.stats || {}), board_source: 'live' } } : h
    const r = lock.byKey.get(`${h.game_pk}|${h.player_id}`)
    if (!r) return { ...h, role: null, on_board: false, hr_score: null, board_rank: null, stats: null, _roles: '' }
    const hr = Number(r?.scores?.hr); const rank = Number(r?.scores?.board_rank)
    return {
      ...h,
      role: primaryRole({ game_pick_role: r.game_pick_role }),
      on_board: true,
      hr_score: Number.isFinite(hr) ? hr : null,
      board_rank: Number.isFinite(rank) && rank > 0 ? rank : null,
      stats: { ...(h.stats || {}), board_of: lock.of ?? h.stats?.board_of ?? null, board_source: 'lock', lock_run: r.run_id || null },
      _roles: String(r.game_pick_role || ''),
    }
  })
}

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
// clock has rolled to the next calendar date -- see etHoursSinceNoon (lib/data.js).
// Read off the real America/New_York clock (lib/data.js), EDT or EST.
// 2026-09-07, second pass (Donovan: "earlier in the day for all of these").
// Every slot moved up; negative values are morning ET. The three pregame
// slots no longer sit behind the posted-lineup gate, so these thresholds are
// now the only thing holding them (plus board.size).
const HOTTEST_CONTACT_HOUR = 1     // 1pm ET  (2026-09-18: moved off 9am. His
                                   // calendar puts hot contact in the AFTERNOON,
                                   // and 9am now belongs to HR MATCHUP HISTORY.)
const HR_LEADERS_DOW_HOUR = 2      // 2pm ET   (afternoon, per the same calendar)
const DANGER_COMBOS_HOUR = -1      // 11am ET
// 2026-09-08 (Donovan: "wire those up for automated tweets"). Same board-only
// shape as the three above -- gated on the hour, claimed per (day, kind), no
// live snapshot involved.
const BIRTHDAY_HOUR = -2      // 10am ET
const BACK_TO_BACK_HOUR = 3   // 3pm ET   (2026-09-18: off the crowded 11am hour)
const FUN_FACTS_HOUR = 1      // 1pm ET
// 2026-09-08 (Donovan: "build them because I want them"). Same board-only
// shape, spread through the morning/midday window alongside the four above --
// see claude/ project docs for why each of these six has a real data source
// behind it (no invented numbers) and why Revenge Game Watch is NOT here yet.
const MATCHUP_LINES_HOUR = -3   // 9am ET   (2026-09-18: HR MATCHUP HISTORY)
const STREAKS_HOUR = -3         // 9am ET
const STORYLINES_HOUR = -4      // 8am ET   (2026-09-18: ARMS GETTING HIT leads the
                                // morning -- it is the one post that frames every
                                // hitter post after it)
const BEST_AIR_HOUR = -2        // 10am ET  (2026-09-18: morning, per his calendar)
// THE HOT STRETCH (2026-09-18, Donovan: "i want player highlights liike this
// too... for players doing well during the week or throught the month"). Two
// waves a day off one builder, deliberately parked on two of the few hours
// nothing else claims (7am / 5pm ET) rather than stacked on an already-busy
// tick. The week wave excludes whoever the month wave named -- see
// hotStretchSeenIds below.
const HOT_MONTH_HOUR = -5       // 7am ET
const HOT_WEEK_HOUR = 5         // 5pm ET
// THE MERGE, two slots (2026-09-18). ANGLES lands on the 9am hour the retired
// hotcontact/callofnight/streaks slots shared; THE HOT SHEET on the 11am hour
// dangercombos/backtoback shared. Both are floors, same as every hour here.
const ANGLES_HOUR = -3          // 9am ET   (retired -- see RETIRED_KINDS)
const HOT_SHEET_HOUR = -1       // 11am ET  (retired -- see RETIRED_KINDS)
const ACCOUNTABILITY_HOUR = -4  // 8am ET -- grades YESTERDAY's picks
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
const LONGSHOTS_HOUR = 1        // 1pm ET, the new all-longshots post
// Replies per tick. The pass runs every minute and anything it does not get to
// is still owed (reply_post_id null), so a homer burst drains over a few ticks
// rather than risking this route's 60-second ceiling in one go.
const NEIGHBOR_REPLY_BATCH = 6
// TOP/HR ONLY, and this took two rendered passes to get right.
//
//   1st: gated on on_board. Tonight's file is 270 rows -- every hitter the
//        model SCORED, not every one it surfaced -- so rank 268 produced
//        "#268 on tonight's board. It landed."
//   2nd: gated on any role. Freddie Freeman is a real pick, role HRR, and
//        HRR is the 2+ hits/runs/RBI market -- his HR score is 3.9, rank 258.
//        The post ranks on hr_score, so it made a genuine call look absurd.
//
// lib/verdict.js's own house rule is the answer and it was already written
// down: A PICK ALWAYS WEARS ITS OWN MARKET'S SCORE. This post is about a home
// run and it ranks on hr_score, so it may only speak for the markets that
// settle on a home run. A HRR pick going deep is a bonus, not something the
// HR board called -- the alert itself already says so, and this reply stays
// quiet rather than claiming a position he never held.
// THE MOONSHOT BOARD REPLY -- who gets one.
//
// Third pass. The first two argued about WHICH board, and both were wrong in
// the same way: they ranked a homer on hr_score, one market's number, so a
// HIT call came out 60th and a HRR call 258th. Donovan settled it -- "moonshot
// board is the top rankings" -- and overall_score is that ranking. One board,
// everybody on it, no market to choose (see lib/dash/homerFeed.js).
//
// TWO GUARDS REMAIN, and both earned their place on a live night:
//   role      he has to have been SURFACED. The published board scores 269
//             hitters; most were never called, and "#205 on tonight's board.
//             It landed." is the account taking credit for coverage.
//   rank      even a surfaced name can sit deep. A reply that has to admit
//             #187 is not a reply worth an X post.
// OFF BY DEFAULT since 2026-09-20 — see the pass itself for why. Set
// HOMER_BOARD_REPLY=1 in the environment to bring it back.
const BOARD_REPLY_ON = String(process.env.HOMER_BOARD_REPLY || '').trim() === '1'
// @MLBHR replies. ON by default once deployed -- this is the distribution, not
// a garnish -- but MLBHR_REPLY=0 turns it off without a deploy.
const MLBHR_REPLY_ON = String(process.env.MLBHR_REPLY || '1').trim() !== '0'
const MLBHR_REPLY_ALL = String(process.env.MLBHR_REPLY_ALL || '').trim() === '1'
// Their timeline carries ~20 posts a read and a busy half-hour can put six of
// ours in it. Capped per tick so one minute cannot spend the whole burst.
const MLBHR_REPLY_BATCH = 4
// A NIGHTLY CAP (2026-09-26 tweets fix, step 2): at most this many @MLBHR
// replies a day, best-ranked CALLED homers first. 5 (Donovan, 09-26).
const MLBHR_REPLY_CAP = Math.max(0, Number(process.env.MLBHR_REPLY_CAP ?? 5) || 0)
const BOARD_REPLY_MAX_RANK = 50
const isSurfaced = (row) => Boolean(String(row?.role || '').trim())
// How many of the board the reply prints above him. Ten names every night is
// ten names in front of search and one object a reader learns to recognise.
const BOARD_REPLY_TOP = 10
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
// 2026-09-15 (Donovan: "lets have those fire earlier too"). Both floors are
// safety minimums, not promises -- the day wave only actually posts once
// vsPitcherCareerLines() finds a real CONFIRMED lineup spot, and the late
// wave only runs once a game has actually gone Live (see the "MID-SLATE
// STAT-FEED REPOSTS" gate below) -- so moving the floor earlier costs
// nothing on a normal night, it just stops an already-confirmed early
// lineup or an already-started day game from sitting there unposted until
// an arbitrary clock time.
const MATCHUP_HOUR = -1         // 11am ET -- first wave of confirmed lineups
const MATCHUP_LATE_HOUR = 3     // 3pm ET -- once ANY game (day slate included) goes live
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

// etHoursSinceNoon lives in lib/data.js (2026-09-27): the real New York hour
// minus 12, -12 (midnight ET) through +11 (11pm ET). It used to be the UTC
// hour minus 16 here, which was an hour early all winter (EST).

/** The earliest game_time on tonight's board, in ms, or null if none parse.
 *  With `games` (today's MLB schedule), only rows whose game is on it count:
 *  yesterday's game times made 09-26's pregame "overdue" four hours early. */
function firstPitchOf(rows, games = null) {
  const times = (Array.isArray(rows) ? rows : [])
    .filter((r) => !games || games.has(Number(r?.game_pk)))
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
/** "His 3rd multi-HR game this season." for the homer that makes his game a
 *  2-HR game (his 2nd in THIS game, counted per game_pk -- hr_n counts the
 *  day), else null. */
async function multiLineFor(db, row, day) {
  if (!row.game_pk || Number(row.hr_n) < 2) return null
  const { count } = await db.from('homer_feed').select('player_id', { count: 'exact', head: true })
    .eq('day', day).eq('player_id', row.player_id).eq('game_pk', row.game_pk).lte('hr_n', row.hr_n)
  if (count !== 2) return null
  const { count: k } = await db.from('multi_games').select('game_id', { count: 'exact', head: true })
    .eq('sport', 'mlb').eq('season', Number(day.slice(0, 4))).eq('kind', 'HR').eq('player_id', String(row.player_id))
  return k ? `His ${ordinal(k)} multi-HR game this season.` : null
}

// OUR PRICES FIRST (2026-09-27): read straight from the tables (the site's
// /api/odds/latest is relative-only); the bot's file is the fallback.
async function oddsFile(day, db) {
  const c = _cache.odds
  if (c.data && Date.now() - c.at < TTL_MS && c.data.date === day) return c.data
  // An EMPTY answer is remembered for the same TTL too (egress audit
  // 2026-09-28): with no MLB prices (off days, the offseason) this used to
  // re-ask the tables' freshness -- 4 queries -- every minute, all day.
  const e0 = _cache.oddsEmpty
  const knownEmpty = e0 && e0.day === day && Date.now() - e0.at < TTL_MS
  try {
    const ours = !knownEmpty && db && day ? await mlbLatestOdds(db, day) : null
    if (ours && !ours.empty) { _cache.odds = { at: Date.now(), data: ours }; return ours }
    if (ours?.empty) _cache.oddsEmpty = { at: Date.now(), day }
  } catch (e) { console.error(`[homers] odds (ours): ${e?.message}`) }
  return published('odds', oddsPaths().filter((u) => /^https?:/.test(u)), (j) => Boolean(j?.by_player_id))
}
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

// PNG bytes, or null. Never throws: the image is the garnish. lib/dash/postClaim.js (R3).
const bytesOf = (make) => sharedBytesOf(make, { tag: 'homers' })

const strip = (row) => {
  const out = {}
  for (const [k, v] of Object.entries(row)) if (!k.startsWith('_')) out[k] = v
  return out
}

// The numerology moment's per-instance memory (see 2.5 in GET): the day's
// homer count it last evaluated, and whether it already claimed the day.
let _numerology = { day: null, count: -1, done: false }
// History Watch: when this instance last found nothing to post, per day.
const WATCH_RETRY_MS = 10 * 60 * 1000
const _watchTried = new Map()

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
 * THE NIGHT RECEIPT and the weekly / monthly receipts (2026-10-09, X overhaul piece 5; lib/posts/receipt.js).
 * They replaced the accountability grade, the night recap and the graded board post (kinds retired in
 * lib/dash/xPolicy.js RETIRED_BY_RECEIPT; their history rows stay). The weekly and monthly used to be
 * claimed INSIDE the recap, which was off in the post list, so they never ran: each has its own claim and
 * its own schedule now. Cross-sport and event-driven like the Slate, so it is tried on every tick, football
 * and hockey days included. Mirrors as plain text to the free feed channels the accountability post used.
 * Never throws.
 */
async function receiptTick(db, { day }) {
  const out = {}
  try {
    // the feed channels the accountability post went to, plus #called-it (where the recap, the week and the month went; "Receipts: nightly in #called-it")
    const hooks = withReceipts(FEED_WEBHOOKS())
    // the morning after: yesterday's slate day, then today's (a night that ended before the day rolled)
    for (const d of [shiftDay(day, -1), day]) {
      out[d] = await postReceiptOnce(db, { day: d, hooks, load: receiptLoader(db, { day: d }) })
    }
    for (const period of periodsDue(phxClock(Date.now()))) {
      out[period.kind] = await postPeriodOnce(db, { period, hooks })
    }
  } catch (err) {
    console.error('[homers] receipt threw', err)
    out.error = String(err?.message || err)
  }
  return out
}


export async function GET(request) {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (await isMaintenanceMode()) return Response.json({ skipped: 'maintenance_mode' })
  const db = service()
  if (!db) return Response.json({ skipped: 'supabase-service-key-missing' })

  // (The on-demand ?recap=YYYY-MM-DD post went with the retired night recap, 2026-10-09.)
  const u = new URL(request.url)

  // OFFSEASON GUARD (2026-09-27). This cron fires every minute all year; after
  // the World Series there is nothing for it to do. No MLB game from 3 days
  // back to 3 days ahead -> return before the live-slate fetch, the backfill
  // and the board reads. The look-back keeps the last nights' grading, recap
  // and weekly/monthly posts alive. Fails open (lib/dash/seasonGuard.js).
  // ?noguard=1 bypasses it for a hand run.
  if (u.searchParams.get('noguard') !== '1') {
    const season = await mlbSeasonActive(easternToday())
    if (!season.active) {
      // THE SLATE is cross-sport: no MLB games in 3 days either side must NOT silence the football / hockey /
      // basketball Slate. Tried here, once, with no MLB rows (its own try/catch, its own gates); the in-season
      // path below calls it itself, so a tick never runs it twice.
      const slateOff = await slateTick(db, { day: easternToday() })
      const receiptOff = await receiptTick(db, { day: easternToday() })   // the night receipt is cross-sport too: a football night ends in the MLB offseason
      return Response.json({ skipped: 'offseason', season, slate: slateOff, receipt: receiptOff })
    }
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
  // 🔒 MEMBERS GRADE (BATCH-MEMBERS-PLAN M3): last night's members board against
  // last night's homers, the next morning, #members only. Same read-back as the
  // accountability post below; nothing runs until DISCORD_MEMBERS_WEBHOOK is set.
  if (membersWebhook() && etHoursSinceNoon() >= ACCOUNTABILITY_HOUR) {
    const yday = shiftDay(day, -1)
    await postMembers(db, { day: yday, kind: MEMBERS_KINDS.mlbGrade, build: async () => {
      const { data: board } = await db.from('homer_feed_posts').select('payload').match({ day: yday, kind: MEMBERS_KINDS.mlbBoard }).maybeSingle()
      if (!board?.payload?.picks?.length) return null
      const { data: yHits } = await db.from('homer_feed').select('player_id').eq('day', yday)
      return mlbMembersGrade({ board: board.payload, events: yHits || [] })
    } }).catch((e) => console.error(`[homers] members grade: ${e?.message}`))
  }

  // THE NIGHT RECEIPT (2026-10-09, X overhaul piece 5): the accountability grade (yesterday's pregame picks) and the
  // graded board post (board_results) are retired into ONE cross-sport receipt, posted when every game that held a
  // named player is final, quoting the Slate or write-up that named the man who cashed (lib/posts/receipt.js). It
  // runs before the no-games exits on purpose: an off day for TODAY is not a reason to skip grading YESTERDAY.
  const receiptResult = await receiptTick(db, { day })
  if (Object.values(receiptResult).some((v) => !/^(waiting|already-posted|off|none|settling)/.test(String(v)))) console.log(`[homers] receipt: ${JSON.stringify(receiptResult)}`)

  // The nights before the feed existed, one per tick until the /called window
  // is full (lib/dash/homerBackfill). Runs before the no-games exits on
  // purpose: an off day is exactly when there is time for it.
  const backfill = await backfillOneNight(db, day)
  // 📋 LIST POSTS (2026-09-27, BATCH-LIST-POSTS step 2): the season wrap, one
  // list a day from the morning after the regular season's last game --
  // played every game, the 40-homer club, 30-30, CALLED IT season
  // (lib/lists/post.js). Before the no-games exit on purpose: Mon 09-28 has
  // no games and is the first morning of the wrap.
  if (hourOk(-3, 'list_mlb')) {
    const lists = await postMlbListOnce(db, day).catch((e) => `error: ${e?.message}`)
    if (lists === 'posted' || String(lists).startsWith('error') || lists === 'claim-failed') console.log(`[homers] list post: ${lists}`)
  }
  // 🔢 NUMEROLOGY GRADE (HOT-NUMBERS-FIX item 1): yesterday's recorded
  // players against its homers, from 3am ET, once. Before the no-games exit:
  // an off day still grades the night before. Never throws.
  if (etHoursSinceNoon() >= -9) {
    const g = await mlbNumerologyGrade(db, day).catch((e) => `error: ${e?.message}`)
    if (g) console.log(`[homers] numerology grade: ${typeof g === 'string' ? g : JSON.stringify(g)}`)
  }
  const [board, odds, pairs] = await Promise.all([boardIndex(day), oddsFile(day, db), pairsFile()])
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
    // no baseball today -- the football / hockey / basketball Slate still goes out
    const slateNoMlb = await slateTick(db, { day })
    return Response.json({ day, skipped: 'no-games', slate: slateNoMlb, receipt: receiptResult, backfill, liveSlate: liveSlateStatus() })
  }
  // From here down, `snap` may still be null or empty (fetchLiveSlate down,
  // or genuinely nothing live yet) while `board` carries tonight's games.
  // Every read of the live snapshot goes through `gamesLive`, never raw
  // `snap.games` -- and the board-only posts below (hotcontact, dangercombos,
  // hrleadersdow) never touch the snapshot at all, so a live-API outage no
  // longer blocks them.
  const started = gamesLive.some((g) => g?.state === 'Live' || g?.state === 'Final')
  // 📰 STORYLINES (2026-09-27, BATCH-STORYLINES-PAGE step 3): freeze each
  // game's stories in the 15 minutes before its first pitch, grade them once
  // it is final (lib/stories/record.js). Before the pregame early returns on
  // purpose -- the freeze IS pregame. Never throws; a schedule read and one
  // small select on a quiet minute.
  const storylines = await storiesTick(db, 'mlb')
  if (storylines?.frozen || storylines?.graded || storylines?.base) console.log(`[homers] storylines ${JSON.stringify(storylines)}`)
  // 2026-09-06 (Donovan: "at least a hour before first pitch"). Computed off
  // whatever the board holds right now -- boardIndex() only just resolved
  // above, so this always sees the freshest cached rows.
  // Today's MLB schedule, read once for the timing and the gate below.
  const sched = await scheduleFor(day)
  // THE SCHEDULER'S DAY (lib/dash/xSchedule): tonight's games (the sport mix) and the postseason flag; every gate below reads it.
  setScheduleContext({
    games: [...new Map(boardRows().map((r) => [r?.game_pk, r])).values()].filter((r) => Number.isFinite(Date.parse(r?.game_time || ''))).map((r) => ({ sport: 'mlb', startMs: Date.parse(r.game_time) })),
    postseason: (await postseasonOn(day).catch(() => ({ postseason: null }))).postseason === true,
  })
  // 🔢 NUMEROLOGY WRITE (HOT-NUMBERS-FIX item 1): tonight's board players
  // whose game hasn't started, once each; only today's rows (the board cache
  // holds another day's only uncached). Never throws.
  if (_cache.board.day === day) {
    const w = await mlbNumerologyWrite(db, day, boardRows()).catch((e) => `error: ${e?.message}`)
    if (w && w !== 'nothing new') console.log(`[homers] numerology write: ${typeof w === 'string' ? w : JSON.stringify(w)}`)
  }
  const firstPitch = firstPitchOf(boardRows(), sched?.games || null)
  const overdue = firstPitch != null && Date.now() >= firstPitch - PREGAME_LEAD_MS
  // 2026-09-15 (Donovan: "the top ten needs to be updated before first
  // pitch"). Reverses part of the 2026-09-10 change for ONE post only --
  // see the note above the pregame claim below for which one and why.
  // firstPitch can be null (no parseable game_time on the board at all);
  // waiting forever in that case would be worse than the thing being
  // reverted, so it falls open rather than blocking the call permanently.
  // Falls open only when the schedule was unreachable: with today's schedule
  // in hand and no board row on it, nothing is ready (2026-09-26).
  const pregameLockReady = firstPitch == null ? !sched?.games : overdue
  // WHO IS STILL PLAYABLE (2026-09-07, Donovan: "it should not be tweeting
  // things about the slate that's already gone off or players that are not
  // playing anymore"). One index over tonight's snapshot; every board-derived
  // post below reads the board THROUGH it instead of raw. Fails open on an
  // unknown game -- see lib/dash/tweetFeed.js playableRows.
  const live = liveIndexFrom(snap)
  // THE CALLS keep playableRows (Called Shots, the board, The Four -- made
  // before lineups by design). EVERY OTHER post that names players reads
  // confirmed lineups only (onSlateTonight, tweets fix step 2c, Donovan
  // 09-26 "strict, posts wait"): a morning post with nobody confirmed yet
  // posts nothing and its slot keeps asking each tick.
  const callRows = () => playableRows(boardRows(), live, 'pregame')
  const pregameRows = () => onSlateTonight(boardRows(), live, 'pregame')
  const midRows = () => onSlateTonight(boardRows(), live, 'mid')

  // IS THE BOARD TONIGHT'S BOARD (2026-09-18, Donovan: "THE TWEETS are
  // sending out yesterday's information again") ─────────────────────────────
  //
  // Two questions, both asked ONCE here and answered for every board-derived
  // post below -- the stat slots AND the pregame block, which is the whole
  // point. The slate_date half of this already existed, but it was computed
  // ~380 lines further down and only ever guarded the pregame/pairswatch/
  // longshot branch. Every stat slot moved OUT of that branch on 2026-09-07
  // (to post earlier in the day) was left on a bare `board.size` -- "is there
  // a file," never "is it today's file" -- so the whole morning feed could and
  // did run off a leftover board. Hoisted so there is one answer, not two.
  //
  //   1. slate_date: does run_meta say the file describes THIS day.
  //   2. pitcher column: does the board's arm for each game agree with MLB's
  //      own probables. A board can pass (1) and still fail (2) -- that is
  //      exactly what happened on 09-18, when the arms were the previous day's
  //      starters on today's slate. See boardPitchersFresh in tweetFeed.js.
  //
  // Both fail OPEN: run_meta missing is not a hold (that half already behaved
  // this way via `boardIsToday` being compared, not required), and an
  // unreachable StatsAPI or a slate with too few verifiable games returns
  // fresh. A hold costs one tick and retries; a false hold that never clears
  // would be worse than the bug.
  //   3. (2026-09-26) games: are the board's game_pks on today's MLB
  //      schedule at all. 09-26's Called Shots was yesterday's board under
  //      today's run_meta: (1) passed, and (2) checked nothing and passed.
  //      The rows' own date (slateDateFromRows) must be today too -- run_meta
  //      is a separate file and can be a publish ahead of the rows.
  const runMeta = await fetchRunMeta('today')
  const rowsDate = slateDateFromRows(boardRows())
  const boardIsToday = runMeta?.slate_date === day && (!rowsDate || rowsDate === day)
  const gamesCheck = boardGamesToday(boardRows(), sched?.games || null)
  const pitcherFreshness = boardPitchersFresh(boardRows(), sched?.probables || null, sched?.games || null)
  // The one gate every board-derived post now shares.
  const boardUsable = Boolean(board.size) && boardIsToday && gamesCheck.ok && pitcherFreshness.fresh
  const boardHold = board.size
    ? (!boardIsToday ? 'stale-slate-date' : !gamesCheck.ok ? 'stale-games' : (!pitcherFreshness.fresh ? 'stale-pitchers' : null))
    : 'no-board'
  if (boardHold) console.error(`[homers] board held: ${boardHold}`, { slate_date: runMeta?.slate_date, rowsDate, day, games: gamesCheck, ...pitcherFreshness })

  // ── THE SLATE (see slateTick). MOONSHOT's rows are named only from tonight's own board; a board that is not
  // tonight's (stale date / stale arms / none yet) is a HOLD for the MLB line, then the post goes out without it.
  const slateResult = await slateTick(db, { day, rows: boardUsable ? boardRows() : [], live, hold: boardUsable ? null : (boardHold || 'no-board'), firstStartMs: firstPitch ?? NaN })
  if (!/^(waiting|already-posted|off)/.test(String(slateResult))) console.log(`[homers] slate: ${slateResult}`)

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
  // 2026-09-18: was `if (board.size)`. See boardUsable above for why that was
  // not enough -- a non-empty file is not the same question as a current one.
  if (boardUsable) {
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
    if (hourOk(HR_LEADERS_DOW_HOUR, 'hrleadersdow') && !isRetired('hrleadersdow')) {
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
    if (hourOk(BIRTHDAY_HOUR, 'birthday') && !isRetired('birthday')) {
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
    if (hourOk(FUN_FACTS_HOUR, 'funfacts') && !isRetired('funfacts')) {
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
    if (hourOk(MATCHUP_LINES_HOUR, 'matchuplines') && !isRetired('matchuplines')) {
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
    // THE BEST LOOK (callofnight) is retired (2026-10-09): THE CALL OF THE NIGHT leads THE SLATE (lib/posts/slate.js).
    if (hourOk(STREAKS_HOUR, 'streaks') && !isRetired('streaks')) {
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
    if (hourOk(STORYLINES_HOUR, 'storylines')) {
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
    // THE FOUR is retired (2026-10-09): THE SLATE replaced it (lib/posts/slate.js).
    if (hourOk(BEST_AIR_HOUR, 'bestair')) {
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
    if (hourOk(MATCHUP_HOUR, 'matchup_hr')) {
      await safeStat('matchuphistory', async () => {
        const lines = await vsPitcherCareerLines(pregameRows())
        // 2026-09-15 (Donovan: "some of these I just wanted tweets and no
        // card... a decent list of names on tweet so people can screenshot
        // and share"). No card at all -- text is the whole deliverable, so
        // both picks functions get their normal default pool (12 / 6) and
        // shrinkToFit alone decides how many names fit in 270 chars.
        const hrPicks = hrVsStarterPicks(lines)
        await claimAndPostStat(db, day, 'matchup_hr', MATCHUP_HOUR,
          hrVsStarterText(hrPicks, { day, ...TAIL }),
          null,
          { picks: hrPicks })
        const careerPicks = careerVsStarterPicks(lines)
        await claimAndPostStat(db, day, 'matchup_career', MATCHUP_HOUR,
          careerVsStarterText(careerPicks, { day, ...TAIL }),
          null,
          { picks: careerPicks })
      })
    }
    // ── THE HOT STRETCH, TWO WAVES (2026-09-18) ──────────────────────────
    // A month-to-date line at 7am ET and a last-7-days line at 5pm ET, each on
    // the hottest bat ON TONIGHT'S BOARD by OPS over that window. Every number
    // is MLB's own byDateRange split for that player, not recomputed here --
    // see hotStretchPicks in tweetFeed.js for the window rules and the sample
    // floors. Both are wrapped in safeStat: they are the only stat slots that
    // fan out ~25 API calls, so a StatsAPI wobble must not take the tick down.
    // 2026-09-18 (Donovan, on the first version's generic statCard: "that can
    // be alot better color and more stuff kinda like how the home run cards
    // are make its like a show case card"). These two are the only stat slots
    // with a card of their own -- hotStretchCard in homerCard.js -- so they
    // pass a render thunk instead of a statCard spec.
    if (hourOk(HOT_MONTH_HOUR, 'hot_month')) {
      await safeStat('hot_month', async () => {
        const { pick, window: win } = await hotStretchPicks(pregameRows(), day, { window: 'month' })
        await claimAndPostStat(db, day, 'hot_month', HOT_MONTH_HOUR,
          hotStretchText(pick, { day, ...TAIL, window: 'month' }),
          null,
          pick ? { picks: [{ player_id: pick.player_id, name: pick.name }] } : {},
          pick ? () => hotStretchCard(day, pick, { site: SITE_HOST, window: 'month', windowLabel: win?.label }) : null)
      })
    }
    if (hourOk(HOT_WEEK_HOUR, 'hot_week')) {
      await safeStat('hot_week', async () => {
        if (knownTaken(day, 'hot_week') || triedEmpty(day, 'hot_week')) return   // egress: posted already (or nothing to say <10 min ago), skip the exclude read
        const exclude = await hotStretchSeenIds(db, day)
        const { pick, window: win } = await hotStretchPicks(pregameRows(), day, { window: 'week', exclude })
        await claimAndPostStat(db, day, 'hot_week', HOT_WEEK_HOUR,
          hotStretchText(pick, { day, ...TAIL, window: 'week' }),
          null,
          pick ? { picks: [{ player_id: pick.player_id, name: pick.name }] } : {},
          pick ? () => hotStretchCard(day, pick, { site: SITE_HOST, window: 'week', windowLabel: win?.label }) : null)
      })
    }

    // ── MILESTONE WATCH, TWO WAVES (2026-09-15, Donovan: "milestone emoji
    //    title then players with stats," two posts a day, two different
    //    sets of players) -- ported from components/Storylines.js, see
    //    milestonePicks() in tweetFeed.js for the real computation. (Since
    //    09-26 every post naming players reads confirmed lineups only --
    //    pregameRows() = onSlateTonight -- so these wait for lineups.) The mid wave excludes whoever the AM wave already named
    //    (milestoneSeenIds above), so the two posts never repeat a player.
    // 📜 HISTORY WATCH REPLACES THE AM MILESTONE POST (milestones plan step
    //    2, 2026-09-26). Same slot, same volume: tonight's hitters one homer
    //    short of a history rung, each claim a query result with its proof
    //    stored in the payload (lib/history/watch.js). No link, three names at
    //    most, and NOTHING is posted when no claim passes -- the round-number
    //    list is not a fallback for it.
    if (hourOk(MILESTONE_AM_HOUR, 'history_watch') && !isRetired('history_watch')) {
      await safeStat('history_watch', async () => {
        // COST CUT (2026-09-27): mlbWatch queries hist_mlb (up to 500 rows a
        // candidate) and ran every minute for the rest of the day, before the
        // claim said the slot was long taken. Asked first now; and a watch
        // that found nothing waits WATCH_RETRY_MS on this instance (it only
        // changes as lineups confirm).
        // knownTaken first (egress round 3): the slot read ran every minute after the post went out
        if (knownTaken(day, 'history_watch') || Date.now() - (_watchTried.get(day) || 0) < WATCH_RETRY_MS) return
        const { data: taken } = await db.from('homer_feed_posts').select('day').match({ day, kind: 'history_watch' }).maybeSingle()
        if (taken) { markTaken(day, 'history_watch'); return }
        const items = await mlbWatch(pregameRows(), Number(day.slice(0, 4)), { day })
        if (!historyWatchText(items)) _watchTried.set(day, Date.now())
        await claimAndPostStat(db, day, 'history_watch', MILESTONE_AM_HOUR,
          historyWatchText(items),
          null,
          { items: items.slice(0, 3) })
      })
    }
    // 🎯 LONGSHOTS (2026-09-27): from 1pm ET, once, when at least three
    //    long-priced hitters with CONFIRMED lineups are still to play
    //    (lib/dash/longshotsPost.js -- the page's own data). Replaces the old
    //    one-name 'longshot' post, which read the bot's odds files (dead
    //    since 09-14).
    // 🔁 THE 2+ CLUB, WEEKLY (2026-09-27): Mondays from 10am ET, the season's
    //    multi-HR leaders with their CALLED count (lib/dash/multiClubPost.js).
    if (new Date(`${day}T12:00:00Z`).getUTCDay() === 1 && hourOk(-2, 'multi_club')) {
      await safeStat('multi_club', async () => {
        const r = await postMultiClubOnce(db, { sport: 'mlb', day, kind: 'multi_club' })
        if (r === 'posted') console.log('[homers] 2+ club posted')
      })
    }
    if (hourOk(LONGSHOTS_HOUR, 'longshots')) {
      await safeStat('longshots', async () => {
        const r = await postLongshotsOnce(db, { sport: 'mlb', day, kind: 'longshots' })
        if (r === 'posted') console.log('[homers] longshots posted')
      })
    }
    // Not in October (2026-09-27): a postseason game moves neither the
    // regular-season nor the career line, so every countdown would name a
    // number that cannot change tonight. History Watch carries October.
    if (hourOk(MILESTONE_MID_HOUR, 'milestone_mid') && !isRetired('milestone_mid') && (await postseasonOn(day)).postseason !== true) {
      await safeStat('milestone_mid', async () => {
        const seen = await milestoneSeenIds(db, day)
        const miles = await milestonePicks(pregameRows(), { exclude: seen })  // text-only now, see the AM wave above
        await claimAndPostStat(db, day, 'milestone_mid', MILESTONE_MID_HOUR,
          milestoneText(miles, { day, wave: 'mid', ...TAIL }),
          null,
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
    if (hourOk(STORYLINE_WATCH_1_HOUR, 'storyline_watch_1')) {
      await safeStat('storyline_watch_1', async () => {
        if (knownTaken(day, 'storyline_watch_1') || triedEmpty(day, 'storyline_watch_1')) return   // egress: posted already (or nothing to say <10 min ago), skip the exclude read
        const seen = await storylineSeenTexts(db, day)
        // 2026-09-15 (Donovan: "some of these I just wanted tweets and no
        // card... a decent list of names"). No card -- storylineWatchPicks
        // still pulls a wide pool (8 matchup lines + 10 fun facts) so
        // there's something left after the exclude filter, and shrinkToFit
        // alone now decides how many survivors fit in 270 chars.
        const picks = await storylineWatchPicks(pregameRows(), day, { exclude: seen })
        await claimAndPostStat(db, day, 'storyline_watch_1', STORYLINE_WATCH_1_HOUR,
          storylineWatchText(picks, { day, slot: 1, ...TAIL }),
          null,
          { texts: picks.map((p) => p.text).filter(Boolean) })
      })
    }
    if (hourOk(STORYLINE_WATCH_2_HOUR, 'storyline_watch_2') && !isRetired('storyline_watch_2')) {
      await safeStat('storyline_watch_2', async () => {
        if (knownTaken(day, 'storyline_watch_2') || triedEmpty(day, 'storyline_watch_2')) return   // egress: posted already (or nothing to say <10 min ago), skip the exclude read
        const seen = await storylineSeenTexts(db, day)
        // text-only now, see storyline_watch_1 above
        const picks = await storylineWatchPicks(pregameRows(), day, { exclude: seen })
        await claimAndPostStat(db, day, 'storyline_watch_2', STORYLINE_WATCH_2_HOUR,
          storylineWatchText(picks, { day, slot: 2, ...TAIL }),
          null,
          { texts: picks.map((p) => p.text).filter(Boolean) })
      })
    }
    if (hourOk(STORYLINE_WATCH_3_HOUR, 'storyline_watch_3') && !isRetired('storyline_watch_3')) {
      await safeStat('storyline_watch_3', async () => {
        if (knownTaken(day, 'storyline_watch_3') || triedEmpty(day, 'storyline_watch_3')) return   // egress: posted already (or nothing to say <10 min ago), skip the exclude read
        const seen = await storylineSeenTexts(db, day)
        // text-only now, see storyline_watch_1 above
        const picks = await storylineWatchPicks(pregameRows(), day, { exclude: seen })
        await claimAndPostStat(db, day, 'storyline_watch_3', STORYLINE_WATCH_3_HOUR,
          storylineWatchText(picks, { day, slot: 3, ...TAIL }),
          null,
          { texts: picks.map((p) => p.text).filter(Boolean) })
      })
    }
    if (hourOk(STORYLINE_WATCH_4_HOUR, 'storyline_watch_4') && !isRetired('storyline_watch_4')) {
      await safeStat('storyline_watch_4', async () => {
        if (knownTaken(day, 'storyline_watch_4') || triedEmpty(day, 'storyline_watch_4')) return   // egress: posted already (or nothing to say <10 min ago), skip the exclude read
        const seen = await storylineSeenTexts(db, day)
        // text-only now, see storyline_watch_1 above
        const picks = await storylineWatchPicks(pregameRows(), day, { exclude: seen })
        await claimAndPostStat(db, day, 'storyline_watch_4', STORYLINE_WATCH_4_HOUR,
          storylineWatchText(picks, { day, slot: 4, ...TAIL }),
          null,
          { texts: picks.map((p) => p.text).filter(Boolean) })
      })
    }
    // ── REVENGE GAMES + GIVEAWAYS, ONE COMBINED POST (2026-09-15, Donovan:
    //    "thing else post in a combined tweet") ─────────────────────────────
    // (Since 09-26: confirmed lineups only, like every post naming players
    // -- tweets fix step 2c.) Originally off the raw board because a revenge
    // game is a fact about tonight's matchup and a giveaway is tied to the
    // whole game, not a lineup slot -- same reasoning MILESTONE_AM above already uses for running off
    // the full board this early (7am ET, before most lineups are even
    // posted).
    if (hourOk(REVENGE_GIVEAWAY_HOUR, 'revenge_giveaway') && !isRetired('revenge_giveaway')) {
      await safeStat('revenge_giveaway', async () => {
        // 2026-09-15 (Donovan: "some of these I just wanted tweets and no
        // card"). No card -- revengeGiveawayText() (tweetFeed.js) no longer
        // pre-trims to 4 revenge + 3 giveaways either, so shrinkToFit alone
        // decides how many real lines fit in 270 chars.
        const rg = await revengeGiveawayPicks(pregameRows(), day)
        await claimAndPostStat(db, day, 'revenge_giveaway', REVENGE_GIVEAWAY_HOUR,
          revengeGiveawayText(rg, { day, ...TAIL }),
          null)
      })
    }

    // ── THE MERGE: TONIGHT'S ANGLES + THE HOT SHEET (2026-09-18) ──────────
    // Donovan, marking up the post inventory: "add more to the tweet this what
    // im saying like the storylin and stuff acna bee really big tweet or two".
    //
    // Eighteen slots that each carried three or four names now arrive as two
    // posts that carry twenty-odd between them. Nothing new is computed: every
    // section below is the SAME picks array its retired post used, handed to
    // fitSections(), which fills to the limit and drops from the capped tail
    // when it overflows. Section caps (tweetFeed.js) stop one long list --
    // the arms, usually -- from eating the whole post.
    //
    // Both are text-only by nature: a twenty-line post has no card that could
    // carry it, so neither is in TEXT_ONLY_KINDS and neither passes a spec.
    //
    // LENGTH. Built at BIG_LIMIT (900) and posted through postToX, which now
    // retries once at 280 if X refuses a long post -- so on an account without
    // Premium these publish as the same shape, shorter. See lib/dash/xPost.js.
    if (hourOk(ANGLES_HOUR, 'angles')) {
      await safeStat('angles', async () => {
        const [matchups, streak, milestones, bdays, rg] = await Promise.all([
          matchupLinesPicks(pregameRows()),
          streaksPick(pregameRows(), day),
          milestonePicks(boardRows()),
          birthdaysToday(pregameRows(), day),
          revengeGiveawayPicks(boardRows(), day),
        ])
        const arms = storylinesPicks(pregameRows())
        const parks = bestAirPicks(pregameRows())
        await claimAndPostStat(db, day, 'angles', ANGLES_HOUR,
          anglesText({ arms, parks, matchups, streak, milestones, birthdays: bdays, revenge: rg }, { day, ...TAIL }),
          null,
          // Stored for the same reason funfacts/matchuplines store theirs:
          // storylineSeenTexts reads it back so Storyline Watch never repeats
          // a sentence this post already used.
          { texts: (matchups || []).map((m) => m?.text).filter(Boolean) })
      })
    }
    if (hourOk(HOT_SHEET_HOUR, 'hotsheet')) {
      await safeStat('hotsheet', async () => {
        const { leaders, dow } = await fetchWeekdayHrLeaders(day)
        const hot = hottestContactPicks(pregameRows())
        const danger = dangerComboPicks(pregameRows())
        const b2b = backToBackPicks(pregameRows(), day)
        await claimAndPostStat(db, day, 'hotsheet', HOT_SHEET_HOUR,
          hotSheetText({ hot, danger, b2b, leaders, dow }, { day, ...TAIL }),
          null)
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
    // 2026-09-18: runMeta/boardIsToday used to be fetched here. They are now
    // computed once, far above, alongside the pitcher-column check -- so the
    // stat slots get the same protection this branch has had since 09-12.
    const ready = boardUsable
    // Every early return below is now guarded on `!started`: when overdue is
    // the ONLY reason this block ran (a cron gap let an early game go Live
    // before the deadline post went out), the pregame attempt still happens
    // but this falls through to homer processing afterward instead of
    // returning -- a late tick must not also skip tonight's live homers.
    if (!ready) {
      if (!started) return Response.json({ day, skipped: 'nothing-started', pregame: boardHold, pitcherCheck: pitcherFreshness, statErrors, discordErrors: discordFailuresSnapshot() })
    } else {
      // PAIRS TO WATCH + TONIGHT'S LONGEST CALL (2026-09-06, Donovan).
      // Each claims its own (day, kind) row, independent of the pregame
      // call below and of each other -- a slow news night for one is not a
      // reason to hold back the other, and neither can double-post.
      if (hourOk(PAIRSWATCH_HOUR, 'pairswatch')) {
        const hits = pairsToWatch(pregameRows(), pairs, odds, day)
        if (hits.length) {
          const claim = (await scheduleGate(db, { kind: 'pairswatch', day, legacyHour: PAIRSWATCH_HOUR })).ok && await claimSlot(db, day, 'pairswatch')
          if (claim) {
            const text = pairsToWatchText(hits, { day, ...TAIL })
            const patch = { payload: { hits, ...payloadFor('pairswatch') } }
            // Rendered here, above the Discord post, so both services take the
            // same one render -- see claimAndPostStat. It used to be built
            // inside the X branch, which left Discord with bare text and, on
            // a night with X off, built no card at all.
            const png = await bytesOf(() => pairsCard(day, hits, { site: SITE_HOST }))
            const d = await postToDiscord(text, { png }, FEED_WEBHOOKS())
            if (d.ok) patch.discord_sent = true
            if (hasX() && await xOk(db, { day, kind: 'pairswatch', repeat: false })) {
              const mediaId = png ? await uploadImageToX(png) : null
              const r = await postToX(text, { mediaId, kind: 'pairswatch' })
              if (r.ok && r.id) { patch.x_post_id = r.id; logPosted({ day, kind: 'pairswatch', tweetId: r.id, text }) }
              else console.error(`[homers] pairs-to-watch refused: ${r.status} ${r.error}`)
            }
            await db.from('homer_feed_posts').update(patch).match({ day, kind: 'pairswatch' })
          }
        }
      }
      if (hourOk(LONGSHOT_HOUR, 'longshot')) {
        const pick = longshotPick(pregameRows(), odds, day)
        if (pick) {
          const claim = (await scheduleGate(db, { kind: 'longshot', day, legacyHour: LONGSHOT_HOUR })).ok && await claimSlot(db, day, 'longshot')
          if (claim) {
            const text = longshotText(pick, { day, ...TAIL })
            const patch = { payload: { pick, ...payloadFor('longshot') } }
            // Rendered here, above the Discord post, so both services take the
            // same one render -- see claimAndPostStat. It used to be built
            // inside the X branch, which left Discord with bare text and, on
            // a night with X off, built no card at all.
            const png = await bytesOf(() => longshotCard(day, pick, { site: SITE_HOST }))
            const d = await postToDiscord(text, { png }, FEED_WEBHOOKS())
            if (d.ok) patch.discord_sent = true
            if (hasX() && await xOk(db, { day, kind: 'longshot', ids: pick?.player_id ? [pick.player_id] : [] })) {
              const mediaId = png ? await uploadImageToX(png) : null
              const r = await postToX(text, { mediaId, kind: 'longshot' })
              if (r.ok && r.id) { patch.x_post_id = r.id; logPosted({ day, kind: 'longshot', ids: pick?.player_id ? [pick.player_id] : [], tweetId: r.id, text }) }
              else console.error(`[homers] longshot refused: ${r.status} ${r.error}`)
            }
            await db.from('homer_feed_posts').update(patch).match({ day, kind: 'longshot' })
          }
        }
      }

      // THE CALL, ONE PER GAME (2026-09-28, postseason plan steps 3/6/7):
      // the top CALLED hitter in each game, posted once both lineups are
      // confirmed and before first pitch, with the one number that makes the
      // case and the one reason it could fail (lib/dash/gameCall). P1 under
      // the daily cap. A CALLED homer by that hitter quotes this post.
      // THE WRITE-UP (2026-10-05, Donovan "same person ... just a longer post"): the same
      // headliner, long (lib/writeups/mlb.js + the fact checker): Discord gets both sides,
      // X the longest version that fits the account's limit. A write-up that fails the
      // checker posts the old CALL text instead -- never an unchecked long post.
      if (perGameOn(day)) {
        const nowMs = Date.now()
        const slate = callRows()
        for (const call of gameCalls(slate)) {
          const t = Date.parse(call.time || '')
          if (!call.confirmed || !Number.isFinite(t) || nowMs >= t || nowMs < t - PER_GAME_LEAD_MS) continue
          const kind = `call_${call.game_pk}`
          if (knownTaken(day, kind)) continue
          // BEFORE HE IS NAMED (2026-10-09): both lineups are confirmed (above); the starter
          // must be too, and he is not this kind's man within 3 days. Pending is simply not
          // posted yet -- the window above runs to first pitch, so it is held, then lost.
          const nameProblem = mlbNamingProblem(call.row)
          if (nameProblem) {
            recordPost({ day, kind, sport: 'mlb', state: nowMs >= t - 30 * 60e3 ? 'DROPPED' : 'HELD', reason: nameProblem.reason, ids: [nameProblem.id] })
            continue
          }
          const recentCalls = await recentNamed(db, { kind, day })
          if (recentCalls.has(String(call.row.player_id))) {
            recordPost({ day, kind, sport: 'mlb', state: 'DROPPED', reason: `repeat: ${call.row.player_id} was a call within 3 days`, ids: [String(call.row.player_id)] })
            markTaken(day, kind)   // decided for the day: stop asking every minute on this instance
            continue
          }
          // THE SCHEDULER (event-driven INFO, lib/dash/xSchedule): asked before the slot is claimed, logged HELD/DROPPED
          if (!(await scheduleGate(db, { kind, day, sport: 'mlb', startMs: t })).ok) continue
          if (!(await claimSlot(db, day, kind))) continue
          const tl = tailFor('call', { playerId: call.row.player_id })
          const tail = [tl.site, tl.handle].filter(Boolean).join(' ')
          const old = gameCallText(call, { tail })
          const w = buildMlbWriteup(slate.filter((r) => String(r?.game_pk) === String(call.game_pk)))
          const rw = w && String(w.players[0]?.player_id) === String(call.row.player_id) ? renderWriteup(w, { xLimit: postLimit() - (tail ? tail.length + 1 : 0) - 30 /* postToX's funnel link */ }) : null
          const useW = Boolean(rw?.ok)
          const text = useW ? `${rw.x}${tail ? `\n${tail}` : ''}` : old
          const discordText = useW ? `${rw.full}${tail ? `\n${tail}` : ''}` : old
          const callNamed = useW ? w.players.map((p) => String(p.player_id)) : [String(call.row.player_id)]
          const patch = { payload: { player_id: String(call.row.player_id), name: String(call.row.name || ""), game_pk: call.game_pk, role: call.role, bar: call.bar, posted_at: new Date().toISOString(), named: callNamed,
            writeup: useW ? { x_is_long: rw.xIsLong, players: w.players.map((p) => p.player_id) } : { off: rw ? rw.why : 'no write-up for this game' } } }
          await db.from('homer_feed_posts').update({ payload: patch.payload }).match({ day, kind })
          // MLB KEEPS ITS FREE POST PER GAME (Donovan, 2026-10-09: "keep MLB exactly how it is"): every game still goes to the free
          // feed channels as before; #members gets every game too (additive).
          const d = await postToDiscord(discordText, {}, FEED_WEBHOOKS())
          if (d.ok) patch.discord_sent = true
          patch.payload = { ...patch.payload, kickoff: call.time, text_full: discordText, free: true, free_sent: Boolean(d?.ok), members_sent: await sendMembers(discordText, { sport: 'mlb', kind }), members_tries: 1 }
          if (hasX() && await xOk(db, { day, kind, ids: callNamed, repeat: false })) {
            const r = await postToX(text, { kind: 'call', link: { playerId: call.row.player_id } })
            if (r.ok && r.id) { patch.x_post_id = r.id; logPosted({ day, kind, ids: callNamed, tweetId: r.id, text }) }
            else console.error(`[homers] ${kind} refused: ${r.status} ${r.error}`)
          }
          await db.from('homer_feed_posts').update(patch).match({ day, kind })
        }
        // A #members copy that failed (members_sent === false) is tried again, before first pitch, at most 3 times in all
        // (lib/writeups/discordRoute.js retryMembers: compare-and-set, never twice). Asked at most every 5 minutes.
        if (membersWebhook() && nowMs - _mlbMembersRetryAt > 5 * 60e3 && gameCalls(slate).some((c) => Date.parse(c.time || '') > nowMs)) {
          _mlbMembersRetryAt = nowMs
          const failed = await db.from('homer_feed_posts').select('day,kind,payload').eq('day', day).like('kind', 'call\\_%').filter('payload->>members_sent', 'eq', 'false')
          await retryMembers(db, failed.data || [], { sport: 'mlb', now: nowMs }).catch((e) => console.error(`[homers] members retry: ${e?.message}`))
        }
      }

      // STORY THREADS, THE RESULT (RUN ORDER 3b, 2026-10-04): each call post
      // above gets one reply after its final -- CALLED IT or MISSED, graded by
      // pickCleared. OFF until STORY_THREADS=on (lib/dash/storyThread.js).
      if (storyThreadsOn() && hasX()) {
        const st = await postStoryResults(db, [day, shiftDay(day, -1)], { postToX, xAllows: (d) => xDailyAllows(db, d, 'story_t3') })
          .catch((e) => { console.error(`[homers] story results: ${e?.message || e}`); return null })
        if (st?.replied) console.log(`[homers] story results: ${st.replied} replied`)
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
      // 🔒 MEMBERS BOARD (BATCH-MEMBERS-PLAN M3): tonight's top of the HR board at
      // the same lock the pregame call waits for, #members only. Its own claim,
      // so it posts once whatever the public call does.
      if (pregameLockReady && membersWebhook()) {
        await postMembers(db, { day, kind: MEMBERS_KINDS.mlbBoard, build: async () => mlbMembersBoard({ rows: boardRows(), day }) })
          .catch((e) => console.error(`[homers] members board: ${e?.message}`))
      }
      let picks = []
      if (!pregameLockReady) {
        if (!started) return Response.json({ day, skipped: 'nothing-started', pregame: 'waiting-for-lock-window', slate: slateResult, receipt: receiptResult, statErrors, discordErrors: discordFailuresSnapshot() })
      } else {
        // THE PREGAME POST IS RETIRED (2026-10-09, X overhaul piece 3): THE SLATE (lib/posts/slate.js, tried
        // above on every tick, across sports) replaced it, callofnight and thefour. What stays here is only the
        // MOONSHOT list the (rested) vote below still reads. The `!started` return is the old pregame block's
        // own gate and stays: everything under it waits for a game to start, as before.
        picks = pregamePicks(callRows(), odds, day, FREE_PREGAME_N)
        if (!started) return Response.json({ day, skipped: 'nothing-started', slate: slateResult, receipt: receiptResult, statErrors, discordErrors: discordFailuresSnapshot() })
      }

      // TONIGHT'S BOARD (2026-09-15, Donovan: "role based tweets no cards
      // just text" / "make sure its graded" -- see boardRolePicks and
      // the retired board_results post's grader). One pick per role
      // (TOP/HR/HIT/HRR), no ten-per-category dump. Same lock window as
      // Called Shots above, same reasoning: a per-player role call against a
      // lineup that can still change is least accurate called off a board
      // published hours before lineups lock.
      if (pregameLockReady && !knownTaken(day, 'board')) {
        // BEFORE THEY ARE NAMED (2026-10-09): same naming rule as the pregame post (the board
        // is exempt from the cap and the repeat guard -- it is the page's essential feed).
        const bn = resolveNaming({ rows: callRows(), check: mlbNamingProblem, pickFrom: (rs) => boardRolePicks(rs), startOf: (r) => Date.parse(r?.game_time), trim: true, now: Date.now() })
        if (bn.state === 'held') recordPost({ day, kind: 'board', sport: 'mlb', state: 'HELD', reason: bn.reason, ids: bn.pending.map((x) => x.id) })
        else if (bn.trimmed?.length) recordPost({ day, kind: 'board', sport: 'mlb', state: 'DROPPED', reason: `left out, ${bn.reason || 'not confirmed'} 30 min before first pitch: ${bn.trimmed.join(', ')}`, ids: bn.trimmed })
        const boardPicks = bn.state === 'held' ? [] : bn.picks
        if (boardPicks.length) {
          const boardClaim = await claimSlot(db, day, 'board')
          if (boardClaim) {
            const text = boardRoleText(boardPicks, { day, ...tailFor('board') })
            const patch = { payload: withNamed({ picks: boardPicks }, pregameCalled(boardPicks, text)) }
            const d = await postToDiscord(text, {}, FEED_WEBHOOKS())
            if (d.ok) patch.discord_sent = true
            if (hasX()) {
              const r = await postToX(text, { kind: 'board' })
              if (r.ok && r.id) { patch.x_post_id = r.id; logPosted({ day, kind: 'board', ids: patch.payload.named, tweetId: r.id, text }) }
              else console.error(`[homers] board refused: ${r.status} ${r.error}`)
            }
            await db.from('homer_feed_posts').update(patch).match({ day, kind: 'board' })
          }
        }
      }

      // POLLS moved out (2026-10-09): the old MOONSHOT VS THE PEOPLE poll and the community-pick invite are
      // replaced by the poll formats in lib/dash/polls, posted by their own cron (app/api/dash/polls/tick).
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
  // 2026-09-18: these three read the same board the morning slots do, and name
  // the same starting pitchers, so they share the same gate. Un-gated they
  // would happily repost a stale board's arms under "still cooking."
  if (boardUsable) {
  // hotcontact_mid and dangercombos_mid were RETIRED COMPLETELY on 2026-10-09 (lib/dash/xPolicy
  // RETIRED_KINDS): their blocks are gone; their history rows stay.
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
    // egress (2026-10-03): the exclude read ran every minute before the claim,
    // all evening; nothing to do before the hour or once the slot is taken
    if (!hourOk(MATCHUP_LATE_HOUR, 'matchup_hr_late') || knownTaken(day, 'matchup_hr_late') || triedEmpty(day, 'matchup_hr_late')) return
    const seen = await matchupHistorySeenIds(db, day)
    const lines = await vsPitcherCareerLines(midRows(), { exclude: seen })
    const hrPicks = hrVsStarterPicks(lines)  // text-only now, see the day wave above
    await claimAndPostStat(db, day, 'matchup_hr_late', MATCHUP_LATE_HOUR,
      hrVsStarterText(hrPicks, { day, ...TAIL, wave: 'late' }),
      null,
      { picks: hrPicks })
    const careerPicks = careerVsStarterPicks(lines)
    await claimAndPostStat(db, day, 'matchup_career_late', MATCHUP_LATE_HOUR,
      careerVsStarterText(careerPicks, { day, ...TAIL, wave: 'late' }),
      null,
      { picks: careerPicks })
  })
  }

  const homers = withLockedBoard(homersFrom(snap, day, board, odds), await lockIndex(day))
  const totals = { day, seen: homers.length, fresh: 0, discord: 0, x: 0, xFailed: 0, board: board.size, mode: MODE, backfill, receipt: receiptResult }

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

  // ── THE 2+ CLUB, LIVE (2026-09-27, BATCH-MULTI-PLAN step 2) ───────────────
  // His second homer IN ONE GAME lands in multi_games tonight, not tomorrow.
  // Counted per game_pk, never off hr_n (hr_n counts the DAY, so a homer in
  // each half of a doubleheader is not a 2-HR game). Label = the first
  // homer's frozen role/on_board (lib/callStatus.js). The morning refresh
  // (/api/multi/tick) rewrites the row off the box score with the price.
  if (freshKeys.size) {
    const perGame = new Map()
    for (const h of homers) {
      const k = `${h.player_id}|${h.game_pk}`
      if (!perGame.has(k)) perGame.set(k, [])
      perGame.get(k).push(h)
    }
    const multi = []
    for (const list of perGame.values()) {
      if (list.length < 2 || !list[0].game_pk || !list.some((h) => freshKeys.has(`${h.player_id}:${h.hr_n}`))) continue
      const first = [...list].sort((x, y) => x.hr_n - y.hr_n)[0]
      multi.push({
        sport: 'mlb', season: Number(day.slice(0, 4)), day, game_id: String(first.game_pk), player_id: String(first.player_id),
        name: first.name, team: first.team || null, opp: first.opponent || null, n: list.length, kind: 'HR', detail: null,
        status: callStatus(first), board_rank: first.board_rank ?? null, score: first.hr_score ?? null, odds: null,
      })
    }
    if (multi.length) {
      const { error: mErr } = await db.from('multi_games').upsert(multi, { onConflict: 'sport,game_id,player_id,kind' })
      if (mErr) console.error(`[homers] multi_games: ${mErr.message}`)
    }
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
    // OCTOBER COUNTS IN OCTOBER (2026-09-27, list-posts step 6). On a
    // postseason day the row carries postseason: true and post_nth (his
    // homers since the postseason's first day, from our own feed, + tonight's
    // hr_n) BEFORE the hooks are written, so hooksFor / the card / the
    // numerology moment say "his 2nd homer this postseason" and never add an
    // October homer to the regular-season total. Unreadable schedule ->
    // postseason: null -> they say nothing about counts.
    const post = await postseasonOn(day)
    for (const ev of homers) {
      if (!freshKeys.has(`${ev.player_id}:${ev.hr_n}`)) continue
      if (post.postseason === true) {
        const { count, error: pErr } = await db.from('homer_feed').select('player_id', { count: 'exact', head: true }).eq('player_id', ev.player_id).gte('day', post.start).lt('day', day)
        const postNth = pErr ? null : (count || 0) + Number(ev.hr_n || 1)
        // FIRST CAREER POSTSEASON HOMER (list-posts step 6): his postseason
        // homers in EARLIER seasons (StatsAPI yearByYear, gameType P -- final
        // numbers tonight's homer can't touch) = 0, and this is his first of
        // this October. Unreadable -> null, and the line is not said.
        const prior = postNth === 1 ? await priorPostseasonHr(ev.player_id, Number(day.slice(0, 4))) : null
        ev.stats = { ...(ev.stats || {}), postseason: true, post_nth: postNth, post_first: postNth === 1 && prior === 0 ? true : (prior == null && postNth === 1 ? null : false) }
      } else if (post.postseason === null) {
        ev.stats = { ...(ev.stats || {}), postseason: null }
      }
      const [{ data: hist }, { jersey, birthDate }] = await Promise.all([
        db.from('homer_feed').select('role').eq('player_id', ev.player_id).lt('day', day).order('day', { ascending: false }).limit(5),
        personInfoOf(ev.player_id),
      ])
      const partner = partnerFor(pairs, ev.player_id, ev.name)
      const hooks = hooksFor(ev, { day, pairs, board, todayIds, yesterdayIds, history: hist || [], jersey, birthDate, pairedEarlier: tonightRows || [], topStraight })
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
  //
  // COST CUT (2026-09-27): the moment only changes when a homer row lands,
  // and posts at most once a day. So a head-only count comes first, and the
  // rows (jsonb stats) are read only when the count moved since this warm
  // instance last looked -- and never again once the day's slot is taken.
  const { count: dayCount, error: dayCountErr } = await db.from('homer_feed').select('player_id', { count: 'exact', head: true }).eq('day', day)
  if (dayCountErr) console.error(`[homers] numerology count: ${dayCountErr.message}`)
  if (_numerology.day !== day) _numerology = { day, count: -1, done: false }
  // THE SCHEDULER: numerology is FUN, evening/night only (xSchedule); `heldUntil` keeps a held moment from re-reading the day's rows every minute.
  if (!dayCountErr && !_numerology.done && windowOpen({ kind: 'numerology' }) && Date.now() >= (_numerology.heldUntil || 0) && dayCount !== _numerology.count) {
    _numerology.count = dayCount
    const { data: dayRows } = await db.from('homer_feed').select('player_id,name,team,opponent,role,hr_n,stats').eq('day', day)
    const moment = numerologyMoment(dayRows || [], { day })
    if (moment) {
      const sg = await scheduleGate(db, { kind: 'numerology', day })
      if (!sg.ok) { _numerology.count = -1; _numerology.heldUntil = Date.now() + 5 * 60e3 }
      const claim = sg.ok && await claimSlot(db, day, 'numerology')
      // Claimed: this day is settled here. Not claimed (taken, kind off, or
      // a failed write): asked again when the next homer lands.
      if (claim) _numerology.done = true
      if (claim) {
        const text = numerologyText(moment, { day, ...TAIL })
        const patch = { payload: { moment, ...payloadFor('numerology') } }
        // Rendered above the Discord post so both services take one render --
        // see claimAndPostStat. Sat inside the X branch, which left Discord
        // with bare text and built nothing at all on a night with X off.
        const png = await bytesOf(() => numerologyCard(day, moment, { site: SITE_HOST }))
        const d = await postToDiscord(text, { png }, FEED_WEBHOOKS())
        if (d.ok) patch.discord_sent = true
        if (hasX() && await xOk(db, { day, kind: 'numerology', repeat: false })) {
          const mediaId = png ? await uploadImageToX(png) : null
          const r = await postToX(text, { mediaId, kind: 'numerology' })
          if (r.ok && r.id) { patch.x_post_id = r.id; logPosted({ day, kind: 'numerology', tweetId: r.id, text }) }
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
  // The morning's call, so a homer by one of its names quotes it. Read only
  // when a homer is actually waiting to post (egress, 2026-10-03: these two
  // reads ran every minute, all evening, for a quote nobody needed).
  const quoting = (pending || []).length > 0
  const pre = quoting ? await morningPost(db, day, 'x_post_id,payload') : null
  // Only a CALLED homer (lib/callStatus.js) quotes the morning's post, and
  // only when that post actually went out (2026-09-26): an ON THE BOARD or
  // NOT ON THE BOARD homer posts standalone, and a held Called Shots means
  // nobody quotes anything.
  // QUOTE THE GAME'S OWN CALL FIRST (postseason plan step 2): a CALLED homer by
  // the hitter a per-game post named quotes THAT post ("✅ Called at 5:10 PM ET");
  // otherwise the morning's call, as before.
  const { data: gamePosts } = quoting ? await db.from('homer_feed_posts').select('kind,x_post_id,payload').eq('day', day).like('kind', 'call_%') : { data: [] }
  // the decision itself lives in lib/dash/quoteFor.js (2026-10-04), shared with the NFL receipts
  const { quoteFor, calledAtLine } = mlbQuotes({ pre, gamePosts, callStatus })
  for (const row of pending || []) {
    const live = byKey.get(`${row.player_id}:${row.hr_n}`)
    const ev = { ...row, _roles: live?._roles || row.role || '' }
    // REACHED (milestones plan step 2): a homer that lands on a history rung
    // gains one line, the claim re-asked at this moment -- never the
    // morning's text. Only for an unposted alert; a failed check drops it.
    const reached = (!row.x_post_id || !row.discord_sent) ? await reachedLine(ev, Number(day.slice(0, 4))) : null
    // THE 2+ CLUB LINE (BATCH-MULTI-PLAN step 4): the homer that MAKES it a
    // 2-HR game adds "His 3rd multi-HR game this season." -- counted from
    // multi_games (written for this game earlier in this same tick), never
    // guessed. Only for an unposted alert; a failed read drops the line.
    const multi = (!row.x_post_id || !row.discord_sent) ? await multiLineFor(db, row, day).catch(() => null) : null
    const extra = [calledAtLine(row), reached, multi].filter(Boolean).join('\n')
    const text = extra ? `${postText(ev, TAIL)}\n\n${extra}` : postText(ev, TAIL)
    const patch = {}
    let stopTick = false

    if (DISCORD_ON && !row.discord_sent) {
      // a card linked to him on MOONSHOT, in MOONSHOT's colour (2026-10-04)
      const r = await postToDiscord(text, { imageUrl: cardUrl(row), sport: 'mlb', link: row.player_id ? playerHref('mlb', row.player_id) : null })
      if (r.ok) { patch.discord_sent = true; totals.discord += 1 }
    }
    // CALLED only by default (lib/dash/xEvents, postseason plan step 1); the
    // old MODE rule applies when X_EVENTS=all.
    const wantsX = xOn && (xEventsCalledOnly() ? callStatus(row) === 'called' : (MODE === 'all' || Boolean(row.role)))
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
          // kind: 'homer' is for the Threads mirror only (lib/dash/postLink.js)
          // -- on a highlights account the live alert IS the feed. X ignores it,
          // and no link is attached: the alerts are the reach, not the funnel.
          const r = await postToX(text, { mediaId, quoteId: quoteFor(row), kind: 'homer', link: { playerId: row.player_id } })
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
        // Not going to X by policy (not CALLED, or flagged mode with no role) — mark it so it
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

  // ── 4. the night is over: graded by the night receipt (receiptTick) ──────
  // 2026-09-08: `.every()` on an empty array is vacuously true -- if the live
  // snapshot is down or empty (see gamesLive above) this must NOT read as
  // "every game is done" and fire the recap early. Require at least one
  // known game before trusting the every().
  // (The night recap that stood here is retired: the night receipt, receiptTick above, grades the night.)

  // ── 5. THE MONTHLY X BUDGET, COUNTED (2026-09-07) ────────────────────────
  // Nothing here has ever counted posts against the tier's monthly ceiling,
  // so the first symptom of exhausting it is posts silently stopping -- the
  // same shape of failure as the kind_check no-op that ate a week. This is a
  // read-only count of what actually posted this calendar month: homer alerts
  // carrying a REAL tweet id (the 'posting' and 'skipped' sentinels are not
  // posts) plus the once-a-day posts.
  //
  // ── THE BOARD-NEIGHBOURS REPLY, ITS OWN PASS (2026-09-19) ────────────────
  //
  // Donovan, 2026-09-18: "reply with maybe the like three names above and
  // below the player who went." Then, the next night: "only one of the WHERE
  // HE SAT AMONG TONIGHT'S HRR CALLS or whatever did the reply."
  //
  // WHY IT MOVED OUT OF THE ALERT LOOP. The first version posted the reply
  // inline, at the end of each homer's own iteration, with no record kept and
  // no retry. Three completely different failures then looked identical from
  // the outside -- which is to say, looked like nothing at all:
  //   - a deploy that had not finished when the homer landed
  //   - an X rate limit during a burst (the reply doubles the post rate)
  //   - this route hitting its own 60-second ceiling mid-iteration, which
  //     kills the reply first because it is the last thing in the loop
  // I could not tell those apart from the outside, and that was the actual
  // defect. Two changes fix all three at once: reply_post_id remembers, and
  // this runs AFTER every alert is out, so a reply can never eat the seconds
  // the next homer's ALERT needs. The alert is the product; this is context.
  //
  // null means still owed, so a failure just retries next tick. 'skipped'
  // means decided-and-done: no role, no market, or nothing to say.
  // ── TURNED OFF (2026-09-20) ────────────────────────────────────────────
  //
  // Donovan, pointing at a live one: "i dont want the home runs to be replied
  // to with the called shots... stop doing that."
  //
  // Off, not deleted. The builder, the column and this pass all still work; a
  // single env var brings it back if the call changes. What does not come back
  // on its own is the decision — HOMER_BOARD_REPLY must be set to '1' for any
  // of this to run, so the default from here on is silence.
  //
  // Already-posted replies stay up. Deleting someone's public posts is not
  // something I do from a cron fix; the ones from tonight are yours to remove
  // if you want them gone.
  if (xOn && BOARD_REPLY_ON) {
    const { data: owed } = await db
      .from('homer_feed')
      .select('player_id,hr_n,name,role,x_post_id')
      .eq('day', day)
      .not('x_post_id', 'is', null)
      .is('reply_post_id', null)
      .order('seen_at', { ascending: true })
      .limit(NEIGHBOR_REPLY_BATCH)
    for (const row of owed || []) {
      // 'posting' is the alert's own in-flight sentinel, not a real id --
      // replying to it would 400. Leave it; the next tick sees a real id.
      if (!row.x_post_id || row.x_post_id === 'posting') continue
      const ranking = moonshotBoardRanking(boardRows())
      const seat = ranking.find((r) => r.player_id === String(row.player_id))
      const eligible = isSurfaced(row) && seat && seat.rank <= BOARD_REPLY_MAX_RANK
      const nText = eligible
        ? moonshotBoardText(ranking, row.player_id, { ...TAIL, top: BOARD_REPLY_TOP })
        : ''
      if (!nText) {
        // A DECISION, not a failure, and it is written down. WATCH and unroled
        // homers land here by design; so does a hitter the board has since
        // rebuilt without. Marking it stops this row being retried every
        // minute for the rest of the night.
        if (!eligible) totals.replySkipped = (totals.replySkipped || 0) + 1
        else {
          totals.replyNoText = (totals.replyNoText || 0) + 1
          console.error(`[homers] board reply built nothing for ${row.name} (rank ${seat?.rank})`)
        }
        await db.from('homer_feed').update({ reply_post_id: 'skipped' }).match({ day, player_id: row.player_id, hr_n: row.hr_n })
        continue
      }
      // the reply is its own X post: it counts (lib/dash/xPolicy, kind homer_board_reply)
      if (!(await xOk(db, { day, kind: 'homer_board_reply', repeat: false }))) { totals.replySkipped = (totals.replySkipped || 0) + 1; continue }
      const nr = await postToX(nText, { replyTo: row.x_post_id })
      if (nr.ok && nr.id) {
        totals.x += 1
        totals.replies = (totals.replies || 0) + 1
        await db.from('homer_feed').update({ reply_post_id: nr.id }).match({ day, player_id: row.player_id, hr_n: row.hr_n })
      } else {
        // Left null on purpose: the next tick retries it. This is the whole
        // reason the column exists.
        totals.replyFailed = (totals.replyFailed || 0) + 1
        console.error(`[homers] reply refused for ${row.name}: ${nr.status} ${nr.error}`)
        if (nr.status === 429 || nr.status === 401 || nr.status === 403) break
      }
    }
  }

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
  // ── @MLBHR: PUT THE BOARD UNDER SOMEBODY ELSE'S POST ──────────────────────
  //
  // 2026-09-22, Donovan, with a screenshot of @TheStarTool doing exactly this:
  // "do this on twitter." @MLBHR posts every home run in baseball to 424,000
  // followers; the post he screenshotted had 154,000 views. This account has
  // fifty followers. A reply under their post is the difference between
  // publishing into an empty room and publishing into a full one.
  //
  // ONLY WHEN THE BOARD HAD HIM. Star Tool replies to every home run; this
  // replies to the ones the model actually called. Three reasons, and they
  // agree. A reply saying "we didn't have him" is an advert against the
  // product. X's automation rules are aimed at high-volume identical replies
  // to one account, and 6 a night reads differently from 35. And the ones
  // worth reading are the receipts -- the misses are still graded in public on
  // /called, so nothing is hidden by being selective.
  // MLBHR_REPLY_ALL=1 turns that gate off.
  //
  // MATCHED ON PLAYER AND TEAM, NEVER ON TIME (see lib/dash/mlbhr.js): their
  // post and our detection can be minutes apart, and replying "we had him"
  // under the wrong man's home run is the most expensive mistake available
  // here -- public, on their post, in front of their whole audience.
  if (xOn && MLBHR_REPLY_ON) {
    try {
      const tl = await getFromX(`/2/users/${MLBHR_USER_ID}/tweets`, {
        max_results: '20', 'tweet.fields': 'created_at,text',
      })
      totals.mlbhrRate = tl.rate || null
      if (!tl.ok) {
        totals.mlbhrError = `${tl.status} ${tl.error || ''}`.trim()
      } else {
        // THE FULL ROW (2026-09-26): the reply card was built from eight
        // columns, so it printed "Invalid Date" and "KC @ ???".
        // COST CUT (2026-09-27): this ran select('*') on every one of today's
        // unreplied homers every minute (jsonb stats/hooks, ~1 KB a row) to
        // match 20 tweets that mostly don't parse. Now: parse first (no
        // parsed tweet, no read at all), match on the columns matchHomer and
        // the ranking use, then fetch the FULL row only for the queued few.
        const tweets = (tl.json?.data || []).map((tweet) => ({ tweet, parsed: parseMlbhr(tweet.text) })).filter((t) => t.parsed)
        const { data: mine } = tweets.length
          ? await db.from('homer_feed').select('player_id,hr_n,name,team,role,board_rank,mlbhr_reply_id').eq('day', day).is('mlbhr_reply_id', null)
          : { data: [] }
        const rows = mine || []
        // Match first, then send best-ranked first, so the cap keeps the
        // strongest receipts rather than whichever homer came first.
        const queue = []
        for (const { tweet, parsed } of tweets) {
          const row = matchHomer(parsed, rows)
          if (!row || queue.some((q) => q.row === row)) continue
          queue.push({ tweet, row })
        }
        queue.sort((a, b) => (a.row.board_rank ?? 9999) - (b.row.board_rank ?? 9999))
        // THE FULL ROW (2026-09-26) for the reply card, only for the queue.
        if (queue.length) {
          const { data: full, error: fullErr } = await db.from('homer_feed').select('*').eq('day', day).in('player_id', [...new Set(queue.map((q) => q.row.player_id))])
          if (fullErr) console.error(`[mlbhr] full rows: ${fullErr.message}`)
          for (const q of queue) q.row = (full || []).find((r) => r.player_id === q.row.player_id && r.hr_n === q.row.hr_n) || q.row
        }
        // When the morning's calls went out (Called Shots), for the card's proof line.
        const preRow = queue.length ? await morningPost(db, day, 'x_post_id,seen_at') : null
        const preAt = preRow?.x_post_id ? (preRow.seen_at || null) : null   // seen_at = the claim, seconds before the post
        const { data: doneToday } = queue.length ? await db.from('homer_feed').select('mlbhr_reply_id').eq('day', day).not('mlbhr_reply_id', 'is', null) : { data: [] }
        let sentToday = (doneToday || []).filter((r) => r.mlbhr_reply_id !== 'skipped' && !String(r.mlbhr_reply_id).startsWith('refused')).length
        let sent = 0
        for (const { tweet, row } of queue) {
          // The builder's own rule, asked here so the log says the same thing
          // the copy does: only TOP and HR settle on a home run.
          const eligible = MLBHR_REPLY_ALL || mayClaimHomer(row.role)
          const text = eligible ? mlbhrReplyText(row, parseMlbhr(tweet.text)) : ''
          const where = { day, player_id: row.player_id, hr_n: row.hr_n }
          if (!text || sentToday >= MLBHR_REPLY_CAP || sent >= MLBHR_REPLY_BATCH) {
            // Decided and done: no call (or tonight's cap is spent), nothing
            // to send. Marked so the next tick does not re-examine it.
            if (text && sentToday < MLBHR_REPLY_CAP) continue       // only the per-tick batch is full: next tick
            await db.from('homer_feed').update({ mlbhr_post_id: tweet.id, mlbhr_reply_id: 'skipped' }).match(where).is('mlbhr_reply_id', null)
            row.mlbhr_reply_id = 'skipped'
            totals.mlbhrSkipped = (totals.mlbhrSkipped || 0) + 1
            continue
          }
          // CLAIM BEFORE POSTING (2026-09-26) -- the same rule the homer
          // alerts follow. A reply that X accepts but this row never records
          // would be sent again next tick: a duplicate under their post.
          const { data: claimed, error: claimErr } = await db.from('homer_feed').update({ mlbhr_post_id: tweet.id, mlbhr_reply_id: 'pending' })
            .match(where).is('mlbhr_reply_id', null).select('player_id')
          // A failed claim is "did not claim" (nothing posts), but said out
          // loud -- otherwise it reads exactly like a quiet night.
          if (claimErr) console.error(`[mlbhr] claim for ${row.name} not written (${claimErr.message}); not replying`)
          if (claimErr || !claimed?.length) continue
          // A card only when the row can fill it: no "Invalid Date", no "???".
          // The reply's own card (mlbhrCard, the approved design), with the
          // board's size for the "top X%" line and the time the calls went out.
          const parsed = parseMlbhr(tweet.text)
          const cardOk = Boolean(row.day && row.opponent && parsed?.distance)
          const png = cardOk ? await bytesOf(() => mlbhrCard(row, parsed, { site: SITE_HOST, boardSize: boardRows().length || null, postedAt: preAt })) : null
          const mediaId = png ? await uploadImageToX(png) : null
          if (!(await xOk(db, { day, kind: 'mlbhr_reply', repeat: false }))) { await db.from('homer_feed').update({ mlbhr_reply_id: null }).match(where); break }   // over the cap: release the claim
          const r = await postToX(text, { replyTo: tweet.id, mediaId, kind: 'mlbhr_reply' })
          if (r.ok && r.id) {
            const w = await db.from('homer_feed').update({ mlbhr_reply_id: r.id }).match(where)
            if (w.error) console.error(`[mlbhr] POSTED ${r.id} for ${row.name} but the row did not record it (${w.error.message}); the 'pending' claim still blocks a resend`)
            row.mlbhr_reply_id = r.id
            totals.mlbhr = (totals.mlbhr || 0) + 1
            sent += 1; sentToday += 1
          } else {
            totals.mlbhrFailed = (totals.mlbhrFailed || 0) + 1
            console.error(`[mlbhr] reply refused for ${row.name}: ${r.status} ${r.error}`)
            // A rate limit or a server-side failure releases the claim so a
            // later tick can try; a refusal (403 and the like) is recorded and
            // never retried -- no loop against a wall.
            const transient = r.status === 429 || !r.status || r.status >= 500
            await db.from('homer_feed').update({ mlbhr_reply_id: transient ? null : `refused:${r.status}` }).match(where)
            if (r.status === 429) break
          }
        }
      }
    } catch (err) {
      // One bad night on somebody else's timeline must never take the alerts
      // down with it -- same rule as safeStat() above.
      totals.mlbhrError = String(err?.message || err)
      console.error(`[mlbhr] pass threw: ${totals.mlbhrError}`)
    }
  }

  totals.discordErrors = discordFailuresSnapshot()
  // What the Threads mirror did this tick, for the same reason discordErrors
  // exists: a second network failing quietly is a week of nobody noticing.
  const th = threadsSnapshot()
  if (th.length) totals.threads = th
  return Response.json(totals)
}
