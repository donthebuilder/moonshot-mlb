// NFL MILESTONE WATCH CRON — the automated NFL sibling of
// app/api/dash/homers/tick/route.js.
//
// Donovan, 2026-09-12 ("next please"): the third original Phase 3 piece for
// Storylines — automated social posting, no approval gate, "like Called It
// does for MLB" — now that the tab and the Games-card inline blurb are both
// shipped. Scoped via three answered questions before any code here was
// written (see lib/nfl/tweetFeed.js's own header for the full reasoning):
//   - same X/Discord account as MLB — lib/dash/xPost.js reused as-is.
//   - Milestone angle only for now.
//   - one Thursday-night post, one Sunday-morning post — two slots a week.
//
// SAME CLAIM TABLE, NO SCHEMA CHANGE BEYOND THE KIND LIST. homer_feed_posts'
// `day` column is a real Postgres `date` — not a synthetic string — so this
// claims the REAL calendar date of each Thursday/Sunday under a new
// kind='nfl_milestone'. A Thursday and the Sunday that follows it are always
// different dates, so one row per (day, kind) is already exactly "two slots
// a week" with zero new columns. The migration alongside this file MUST run
// in Supabase before this can ever claim successfully — same one-time manual
// step as the three MLB kind-widen migrations before it (see that file).
//
// SAME ROBUSTNESS PATTERN AS THE MLB TICK. This is wired into vercel.json to
// fire every minute across the Thursday-evening and Sunday-morning windows,
// same as homers/tick fires all day — the claim-then-post shape plus the
// hour gate below is what turns that into "posts once," not the cron's own
// precision.
//
// MILESTONE IS TEXT ONLY, NO CARD IMAGE -- unchanged below. postToX/
// postToDiscord both already handle bare text fine; several of MLB's own
// slots go out with no image on a night their picker returns nothing to
// draw a card from.
//
// THE LIVE TOUCHDOWN ALERT (2026-09-13, Donovan: "tuddy tweets should fire
// after every touchdown too" -- every TD, every game, full card image,
// adapted from the v5 CALLED IT design, real name-matching, no filtering).
// Added alongside Milestone in the SAME route/cron entry rather than a
// second one, mirroring homers/tick's own shape: one file, several
// independently-gated post kinds sharing one Supabase client and one
// X/Discord config. runTouchdownTick() runs UNCONDITIONALLY, before the
// Thursday/Sunday milestone gate below -- a touchdown can happen on any of
// Thu/Fri/Sat/Sun/Mon/Tue (see vercel.json's widened schedule), and the
// milestone gate must never suppress it.
//
// nfl_td_feed's own migration (supabase/migrations/202609130100_nfl_td_
// feed.sql) MUST run in Supabase before this can claim/post anything --
// same one-time manual step as every other kind-widen migration in this
// codebase; until then every insert here fails closed (logged, not thrown)
// and simply never posts, exactly the "counted no-op" homer_feed's own
// kind_check incident already taught this codebase to expect and log
// loudly rather than silently eat.

import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'

import { easternToday } from '../../../../../lib/data'
import {
  fetchNfl, nflFantasyStatsPaths, nflLogPaths, nflMatchupLooksReal, nflMatchupPaths,
  nflPicksLooksReal, nflPicksPaths, nflRosterPaths, nflSlateLooksReal, nflSlatePaths,
} from '../../../../../lib/nfl/dataSource'
import {
  milestonePicks, milestoneText,
  opportunityPicks, opportunityText, tdHistoryPicks, tdHistoryText,
  whyOnBoardPick, whyOnBoardText, bigWeekPicks, bigWeekText,
  nflBoardPicks, nflBoardText, nflBotPollPicks, nflBotPollText, nflBotPollOptions,
  nflCommunityPickText, nflBoardResultsText,
  tdCallNeighbors, tdCallNeighborsText,
  spotlightPick, spotlightText,
} from '../../../../../lib/nfl/tweetFeed'
import { fetchNflLive } from '../../../../../lib/nfl/liveSlate'
import { buildTdEvent, eventFromRow, rowFromEvent, tdPostText, touchdownsInSnap } from '../../../../../lib/nfl/tdFeed'
import { tdCard } from '../../../../../lib/nfl/tdCard'
import { threadsSnapshot } from '../../../../../lib/dash/threadsPost'
import { tailFor as linkTailFor } from '../../../../../lib/dash/postLink'
import { spotlightCard } from '../../../../../lib/nfl/spotlightCard'
import { hasX, postToDiscord, postToX, uploadImageToX } from '../../../../../lib/dash/xPost'
import { logXBudget } from '../../../../../lib/dash/xBudget'
import { isMaintenanceMode } from '../../../../../lib/edgeConfig'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60 // was 30 -- bumped to match homers/tick now this route can also render+upload+post multiple TD cards per tick

const HANDLE = String(process.env.X_HANDLE || '').trim()
// Same no-URL-in-the-post-text rule as the MLB tick — X's pay-per-use pricing
// charges 13x more for a post containing a link (see homers/tick's own TAIL
// for the full reasoning). NEXT_PUBLIC_SITE_URL rather than a hardcoded NFL
// path since there's no dedicated NFL page to point at yet.
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
const SITE_HOST = SITE.replace(/^https?:\/\//, '') || 'dashnetwork.vercel.app'
// Per-kind, same as the MLB tick -- see lib/dash/postLink.js.
const TAIL = { site: '', handle: '' }
// The football anchors land on /start's NFL side — see the MLB tick's note.
const tailFor = (kind) => linkTailFor(kind, { site: SITE ? `${SITE}/start?sport=nfl` : '', handle: HANDLE })
// Same default and same override var as homers/tick's own X_MONTHLY_CAP --
// see lib/dash/xBudget.js for why this is read-only and shared, not a
// second number to keep in sync by hand.
const X_MONTHLY_CAP = Number(process.env.X_MONTHLY_CAP || 1100) || 1100

// EVERY POST GOES TO THE SAME DISCORDS THE MLB FEED USES (Donovan's own
// "same account" answer) — the homer feed's own webhook plus the general
// MLB channels, deduped so a URL in both env vars gets one message not two.
// Copied verbatim from homers/tick/route.js's own FEED_WEBHOOKS.
const FEED_WEBHOOKS = () => {
  const seen = new Set()
  return [process.env.DISCORD_HOMER_WEBHOOK, process.env.DISCORD_MLB_WEBHOOKS]
    .flatMap((v) => String(v || '').split(/[,\n]/))
    .map((x) => x.trim())
    .filter((x) => x && !seen.has(x) && seen.add(x))
    .join(',')
}

// "A Thursday-night and Sunday-morning Milestone post" — Donovan's own
// example in the question he answered. Expressed the same "hours since noon
// ET" way homers/tick's own stat-feed slots already are (see that file's
// etHoursSinceNoon), so an evening threshold still compares correctly once
// the UTC clock has rolled past midnight.
const THU_HOUR = 6    // 6pm ET Thursday
const SUN_HOUR = -3   // 9am ET Sunday

// ── THE WEEKLY CONTENT RHYTHM (2026-09-18) ──────────────────────────────────
//
// Donovan: "I'd make Sundays feel different. The account should have a weekly
// rhythm. Wednesday-Thursday: matchup / usage / injury / red-zone information.
// Friday: TUDDY BOARD. ... That turns @CalledItHR into something people check
// throughout the week, rather than an account that appears only when the model
// wants to make a pick."
//
// Before this, TUDDY's entire scheduled surface was ONE post kind on two days
// (nfl_milestone, Thursday 6pm and Sunday 9am) against MOONSHOT's ~33 a day.
// These three are the ones that needed no new bot work -- every field was
// verified against the live Week 2 payloads first; see
// claude/tuddy-content-plan-feasibility-2026-09-18.md.
//
// One post per day, spread across the three quiet days, so the account has a
// reason to exist mid-week:
//   WED 10am ET  red-zone touches   opportunity, before anyone is talking
//   WED  1pm ET  goal-line touches  the same question one step closer in
//   THU 11am ET  TD history         lands before the existing 6pm milestone
//   FRI 10am ET  why he's on the board -- the board drops
//
// vercel.json gains Wed/Thu/Fri daytime windows for these; the existing
// game-day windows are untouched.
const WED_REDZONE_HOUR = -2    // 10am ET Wednesday
const WED_GOALLINE_HOUR = 1    //  1pm ET Wednesday
const THU_TDHISTORY_HOUR = -1  // 11am ET Thursday
const FRI_WHYBOARD_HOUR = -2   // 10am ET Friday
// SATURDAY WAS EMPTY (2026-09-20). Donovan: "i havent seen any tweets and its
// saturday not good." He was right twice over -- this week's Wed/Thu/Fri posts
// had never fired at all (migration 11 landed after their slots passed), and
// Saturday had no slot in WEEKLY_SLOTS to begin with. The cron window was
// always there; there was simply nothing for it to do.
//
// Saturday is the biggest football-attention day before Sunday, so it gets a
// SECOND WHY HE'S ON THE BOARD -- a different player from Friday's, which
// whyOnBoardPick already supports via `exclude`. No new kind and therefore no
// migration: claimSlot keys on (day, kind), and Saturday is a different day
// from Friday, so the same 'nfl_whyboard' kind claims cleanly.
const SAT_WHYBOARD_HOUR = -1   // 11am ET Saturday
// PLAYER SPOTLIGHT, Tuesday -- the last empty day in the calendar, and the
// first morning the week is actually FINISHED (Monday Night Football is in the
// box score by then). See spotlightPick: it reads how many of the week's games
// are completed, so a Tuesday post can say WEEK N honestly.
const TUE_SPOTLIGHT_HOUR = -1  // 11am ET Tuesday
// BIG WEEK (2026-09-18, Donovan: "same deal for a player that had a big week
// maybe 1 rb and 1 wr and 1 qb who played well this week"). Monday, because
// that is the first morning the week's games are actually in the box score --
// and it is his own rhythm's "Monday: TUDDY WEEK IN REVIEW" slot. Monday
// Night Football has not been played yet at this hour, so the post covers
// Thursday plus Sunday; bigWeekPicks refuses outright until enough of the
// week is complete.
const MON_BIGWEEK_HOUR = -2    // 10am ET Monday

// ── SUNDAY: THE BOARD, THE POLL, THE INVITATION, AND MONDAY'S RECEIPTS ──────
// (2026-09-18, Donovan: "add more nfl tweets like the bot vs people and thinsg
// like that.")
//
// MOONSHOT had four posts TUDDY never had, and none of them rank players --
// they are about the audience, and about being held to account. Sunday is the
// only day of the week a football audience is already on X waiting for
// something, so three of them land there and the receipts land the next
// morning, alongside BIG WEEK.
const SUN_BOARD_HOUR = -3       //  9am ET Sunday -- the board drops
const SUN_BOTPOLL_HOUR = -2     // 10am ET Sunday -- poll closes with the 1pm games
const SUN_COMMUNITY_HOUR = -1   // 11am ET Sunday -- last call before kickoff
const MON_RESULTS_HOUR = -3     //  9am ET Monday -- BEFORE big week, so the
                                // grade lands before the highlight post
// Long enough to cover the 1pm and 4pm windows without running past the night
// game, so the result is readable while the answer still matters.
const NFL_POLL_DURATION_MIN = 300
// Two either side. The TD ladder is five rungs, so tdCallNeighbors shows the
// whole sheet at that size and only clamps on a week the ladder runs longer.
const TD_NEIGHBOR_SPAN = 2

// Which post, if any, this weekday owns. 0=Sun .. 6=Sat, same etWeekday()
// the milestone gate already uses.
const WEEKLY_SLOTS = {
  0: [
    { kind: 'nfl_board', hour: SUN_BOARD_HOUR },
    { kind: 'nfl_botpoll', hour: SUN_BOTPOLL_HOUR },
    { kind: 'nfl_community', hour: SUN_COMMUNITY_HOUR },
  ],
  1: [
    { kind: 'nfl_results', hour: MON_RESULTS_HOUR },
    { kind: 'nfl_bigweek', hour: MON_BIGWEEK_HOUR },
  ],
  3: [{ kind: 'nfl_redzone', hour: WED_REDZONE_HOUR }, { kind: 'nfl_goalline', hour: WED_GOALLINE_HOUR }],
  4: [{ kind: 'nfl_tdhistory', hour: THU_TDHISTORY_HOUR }],
  5: [{ kind: 'nfl_whyboard', hour: FRI_WHYBOARD_HOUR }],
  2: [{ kind: 'nfl_spotlight', hour: TUE_SPOTLIGHT_HOUR }],
  6: [{ kind: 'nfl_whyboard', hour: SAT_WHYBOARD_HOUR }],
}

function etHoursSinceNoon() {
  const h = new Date().getUTCHours()
  const rel = h < 4 ? h + 24 : h
  return rel - 16
}

// Same day-of-week test homers/tick already runs on its own recap day
// (route.js, the Sunday recap check) — noon UTC on the date string avoids
// any DST-boundary ambiguity a plain `new Date(day)` would risk.
function etWeekday(day) {
  return new Date(`${day}T12:00:00Z`).getUTCDay()
}

// Noon UTC for the same DST-safety reason etWeekday uses it.
function shiftDay(day, delta) {
  const d = new Date(`${day}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

// Same one claim function homers/tick's own claimSlot is — copied rather
// than imported since that file doesn't export it; kept byte-for-byte
// identical in shape (upsert + ignoreDuplicates, error is checked and
// logged rather than swallowed — see that file's own header note on why a
// silently-refused claim is the one failure mode that matters here).
async function claimSlot(db, day, kind) {
  const { data, error } = await db
    .from('homer_feed_posts')
    .upsert([{ day, kind, payload: {} }], { onConflict: 'day,kind', ignoreDuplicates: true })
    .select('day')
  if (error) { console.error(`[nfl-tick] ${kind} claim failed: ${error.message}`); return false }
  return Boolean(data?.length)
}

// Card render -> PNG bytes, or null. Copied from homers/tick's own bytesOf()
// (that file doesn't export it either) -- a failed render degrades a post to
// text-only, never to no post.
async function bytesOf(make) {
  try {
    const img = await make()
    return Buffer.from(await img.arrayBuffer())
  } catch (err) {
    console.error(`[nfl-tick] card failed: ${String(err?.message || err)}`)
    return null
  }
}

// ── THE LIVE TOUCHDOWN ALERT (2026-09-13) ──────────────────────────────────
// Runs every tick, any day this route's cron fires (see vercel.json) --
// independent of the Thursday/Sunday milestone gate below, since a
// touchdown can happen on any of them. Same two-phase shape homer_feed's
// own homersFrom()/claim/post loop already uses:
//   1. build the WHOLE current view of live touchdowns (not just new ones)
//      from lib/nfl/liveSlate.js's fetchNflLive(), and upsert all of them
//      with ON CONFLICT DO NOTHING -- the database decides what's new, not
//      this function guessing off its own state.
//   2. separately re-read whatever in nfl_td_feed is still unposted for
//      today (fresh rows AND any earlier post that failed) and post those,
//      claiming each one with a conditional UPDATE ... WHERE x_post_id IS
//      NULL immediately before the expensive card-render/upload/post work,
//      so two overlapping cron runs can't double-post the same score --
//      exactly homers/tick's own "CLAIM BEFORE POSTING" note explains why.
//
// Every TD, every game -- no MODE/flagged filter, per Donovan's own answer
// ("Every TD, all games") when this was scoped. Wrapped in one try/catch so
// a bad tick here (a malformed ESPN payload, a missing migration) can never
// take the Thursday/Sunday milestone post down with it.
// The Eastern calendar day a game kicked off on -- the day the feed keys it
// under, whatever the clock says when the sweep runs.
const kickoffDayOf = (game) => {
  const t = Date.parse(String(game?.kickoff || ''))
  if (!Number.isFinite(t)) return ''
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(t))
  } catch { return '' }
}

async function runTouchdownTick(db, day) {
  const totals = { seen: 0, fresh: 0, discord: 0, x: 0, xFailed: 0 }
  try {
    const snap = await fetchNflLive({})
    // 2026-09-13: report what the snapshot actually saw, so "seen: 0" can
    // never again hide a failed ESPN fetch behind a quiet slate.
    totals.games = snap?.games?.length ?? null
    totals.live = snap?.liveCount ?? null
    totals.plays = snap?.plays?.length ?? null
    if (snap?.error) totals.error = snap.error
    const liveTds = touchdownsInSnap(snap)
    totals.seen = liveTds.length
    if (!liveTds.length) return totals

    // Same four payloads lib/nfl/tdFeed.js's buildTdEvent() can use, fetched
    // once per tick regardless of how many touchdowns are on it. Every one
    // of these can come back null (roster especially -- see dataSource.js's
    // own note that nfl_roster.json has no committed-snapshot fallback yet)
    // and buildTdEvent() already treats a missing input as "skip that
    // enrichment," never as a reason to fail the whole event.
    const [roster0, slate, logs, picksData, matchup] = await Promise.all([
      fetchNfl(nflRosterPaths()).catch(() => null),
      fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null),
      fetchNfl(nflLogPaths()).catch(() => null),
      fetchNfl(nflPicksPaths(), nflPicksLooksReal).catch(() => null),
      fetchNfl(nflMatchupPaths(), nflMatchupLooksReal).catch(() => null),
    ])
    // 2026-09-13: nfl_roster.json is not published (404), so every live card
    // was name-only -- gsis_id null meant no season line, no on-the-bot rank,
    // no defense tag. The slate (nfl_week.json) carries every player with the
    // same id under `player_id`, so it IS the roster; use it when the roster
    // file is absent. matchRoster() normalises player_id -> gsis_id.
    // 2026-09-24: nfl_roster.json is published now (bots/nfl/nfl_roster.py).
    // It has NO scores, so it must never stand in for the slate here --
    // boardRankFor() would rank nobody. Slate is the roster; the file is the
    // directory for the name join. See buildTdEvent.
    const roster = slate || null
    const directory = roster0?.players?.length ? roster0 : null
    const picksCard = picksData?.card || null
    const season = Number(matchup?.season) || new Date(`${day}T12:00:00Z`).getUTCFullYear()

    const rows = liveTds.map((play) => {
      const game = snap.games.find((g) => g.game_id === play.game_id)
      // 2026-09-24 audit (TZ-1): the row's `day` -- part of the feed's
      // identity (onConflict day,game_id,td_n) -- was the sweep's wall-clock
      // Eastern day. SNF/MNF past midnight ET (OT, a weather delay, the late
      // MNF doubleheader) re-keyed every touchdown already posted as fresh
      // under D+1: duplicate X + Discord posts. Key on the game's own kickoff
      // day instead; the sweep day is only the fallback.
      const gameDay = kickoffDayOf(game) || day
      const ev = buildTdEvent(play, { game, roster, directory, logs, picksCard, matchup, season, day: gameDay })
      const row = rowFromEvent(gameDay, ev)
      // 2026-09-24 audit: a touchdown stored without a scorer or without a
      // board rank is the public record silently calling him "not on the
      // board". Fourteen rush TDs in weeks 1-2 landed that way (trailing
      // space in ESPN's text) with nothing in the logs. Say so, per row.
      if (!row.scorer_name) console.warn('[nfl/tick] TD stored with no scorer:', JSON.stringify({ game_id: row.game_id, td_n: row.td_n, text: row.text }))
      else if (!row.gsis_id) console.warn('[nfl/tick] TD scorer did not join the slate:', JSON.stringify({ scorer: row.scorer_name, team: row.team, text: row.text }))
      else if (!row.td_board && roster?.players?.some((p) => typeof p?.scores?.TD === 'number')) console.warn('[nfl/tick] TD scorer joined but has no board rank:', JSON.stringify({ scorer: row.scorer_name, gsis_id: row.gsis_id }))
      return row
    })

    // ── 1. claim the new ones ────────────────────────────────────────────
    const { data: claimed, error } = await db
      .from('nfl_td_feed')
      .upsert(rows, { onConflict: 'day,game_id,td_n', ignoreDuplicates: true })
      .select('game_id,td_n')
    if (error) {
      // The most likely cause, by far: the migration hasn't been run yet.
      // Logged loudly and once per tick, never thrown -- see this
      // function's own header note.
      console.error(`[nfl-tick] td insert failed (has the nfl_td_feed migration run?): ${error.message}`)
      return totals
    }
    totals.fresh = (claimed || []).length

    // ── 2. post whatever is still unposted for today ────────────────────
    const { data: pending } = await db
      .from('nfl_td_feed')
      .select('*')
      // rows are keyed on the game's kickoff day (above), so look under every
      // day this sweep's games belong to, plus the sweep day itself
      .in('day', [...new Set([day, ...rows.map((r) => r.day)])])
      .or('discord_sent.eq.false,x_post_id.is.null')
      .order('seen_at', { ascending: true })
      .limit(12)

    const xOn = hasX()
    for (const row of pending || []) {
      const ev = eventFromRow(row)
      const text = tdPostText(ev, TAIL)
      const patch = {}
      let stopTick = false
      const needsCard = !row.discord_sent || !row.x_post_id
      const png = needsCard ? await bytesOf(() => tdCard(ev, { site: SITE_HOST })) : null

      if (!row.discord_sent) {
        const d = await postToDiscord(text, { png }, FEED_WEBHOOKS())
        if (d.ok) { patch.discord_sent = true; totals.discord += 1 }
      }
      if (!row.x_post_id && xOn) {
        // Same conditional-UPDATE claim homers/tick's own per-homer loop
        // uses (see that file's "CLAIM BEFORE POSTING" note) -- only the
        // tick that flips x_post_id from null to the 'posting' sentinel
        // gets to render+upload+post this row.
        const { data: claim, error: claimError } = await db
          .from('nfl_td_feed')
          .update({ x_post_id: 'posting' })
          .match({ day: row.day, game_id: row.game_id, td_n: row.td_n })
          .is('x_post_id', null)
          .select('game_id')
        if (claimError) console.error(`[nfl-tick] td claim failed for ${row.game_id}/${row.td_n}: ${claimError.message}`)
        if (claim?.length) {
          const mediaId = png ? await uploadImageToX(png) : null
          // kind: 'td' for the Threads mirror only — see the MLB tick's note.
          const r = await postToX(text, { mediaId, kind: 'td' })
          if (r.ok && r.id) {
            patch.x_post_id = r.id
            totals.x += 1
            // ── THE CALL-SHEET REPLY (2026-09-18) ────────────────────────
            // Donovan, after the MOONSHOT version shipped: "same with touch
            // downs." Same shape, same reasons: the alert's job is the score,
            // a five-row table bolted on buries it, and a reply costs the
            // alert none of its reach.
            //
            // ONLY FOR A DESIGNATED CALL. `on_bot` is nfl_picks.json's TD
            // ladder, frozen onto the row when the touchdown was first seen,
            // and it is the same thing the alert itself reads for its "#N on
            // the Tuddy board / TD pick · A+" block. A scorer who is merely
            // RATED -- lib/nfl/tdFeed.js's boardRankFor ranks hundreds of
            // them -- is not a call, and the alert already says so.
            //
            // The ladder is five rungs, so this is usually the WHOLE call
            // sheet rather than a slice of it.
            //
            // FAILING IS FREE: logged and dropped. The alert is already out,
            // and a missing reply must never release its claim or re-post
            // the touchdown.
            try {
              const nbrs = row.on_bot
                ? tdCallNeighbors(picksCard, row.gsis_id, TD_NEIGHBOR_SPAN)
                : []
              // FROZEN RANK WINS, AND THIS IS NOT HYPOTHETICAL. nfl_td_feed
              // carries Javonte Williams at on_bot rank 5 from the night he
              // scored; the ladder live right now has him 3rd. The ladder is
              // rebuilt through the week and across weeks, so a reply read off
              // TODAY's rungs would say #3 under an alert that said #5. Two
              // numbers for the same call is worse than no reply, so when the
              // frozen rank and the live one disagree, say nothing.
              const me = nbrs.find((n) => n.him)
              const frozenRank = Number(row.on_bot?.rank)
              const drifted = me && Number.isFinite(frozenRank) && frozenRank !== me.rank
              if (drifted) {
                console.error(`[nfl-tick] call-sheet skipped for ${row.scorer_name}: ladder moved (row ${frozenRank}, live ${me.rank})`)
              }
              const nText = drifted ? '' : tdCallNeighborsText(nbrs, TAIL)
              if (nText) {
                const nr = await postToX(nText, { replyTo: r.id })
                // Not stored: nfl_td_feed has no column for it and nothing
                // re-reads it. A migration for a log line is not worth it.
                if (nr.ok && nr.id) totals.x += 1
                else console.error(`[nfl-tick] call-sheet reply refused for ${row.scorer_name}: ${nr.status} ${nr.error}`)
              }
            } catch (err) {
              console.error(`[nfl-tick] call-sheet reply threw for ${row.scorer_name}`, err)
            }
          }
          else {
            totals.xFailed += 1
            console.error(`[nfl-tick] X refused ${row.scorer_name || row.text}: ${r.status} ${r.error}`)
            // A refused post is not a posted post -- release the claim so
            // the next tick retries it. Same gap left on purpose as
            // homers/tick's own: a run killed by the time limit between the
            // claim and this line leaves the row stuck at 'posting' rather
            // than retried -- rare, and the recovery is the same manual
            // UPDATE clearing x_post_id, not a second moving part.
            patch.x_post_id = null
            if (r.status === 429 || r.status === 401 || r.status === 403) stopTick = true
          }
        }
      }
      if (Object.keys(patch).length) {
        await db.from('nfl_td_feed').update(patch).match({ day: row.day, game_id: row.game_id, td_n: row.td_n })
      }
      if (stopTick) break
    }

    // Shared with homers/tick (lib/dash/xBudget.js) -- logged from whichever
    // tick actually posted something, so usage still gets checked on a
    // night the MLB side is quiet (off-season, most of Nov-Jan).
    if (totals.x > 0) {
      totals.xMonth = await logXBudget(db, day, { mode: 'all', cap: X_MONTHLY_CAP })
    }
  } catch (err) {
    console.error(`[nfl-tick] touchdown block failed: ${String(err?.message || err)}`)
  }
  return totals
}

function authorized(request) {
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (!supplied) return false
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

// THE MID-WEEK CONTENT POSTS. Same claim-then-post shape as Milestone below
// and as every MLB stat slot: build the text FIRST, claim only once there is
// something to say, so a tick that finds nothing costs nothing and retries
// next minute rather than burning the day's slot (homers/tick's own
// pregame-post incident, still the most expensive lesson in this codebase).
//
// Deliberately text-only, matching Milestone. TUDDY has no card of its own
// for these yet and a generic one would be the MLB statCard problem again --
// a headline and some grey lines. The lists stand up as text.
async function runWeeklyContentTick(db, day) {
  const slots = (WEEKLY_SLOTS[etWeekday(day)] || []).filter((sl) => etHoursSinceNoon() >= sl.hour)
  if (!slots.length) return { skipped: 'no-slot-this-hour' }

  // One fetch for however many slots this day owns, and only once an hour
  // gate has actually opened -- a Wednesday 6am tick pulls nothing.
  const wantsLogs = slots.some((sl) => sl.kind === 'nfl_tdhistory')
  const wantsBox = slots.some((sl) => sl.kind === 'nfl_bigweek' || sl.kind === 'nfl_spotlight')
  const [data, logs, box] = await Promise.all([
    fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null),
    wantsLogs ? fetchNfl(nflLogPaths()).catch(() => null) : Promise.resolve(null),
    wantsBox ? fetchNfl(nflFantasyStatsPaths()).catch(() => null) : Promise.resolve(null),
  ])
  if (!data) return { skipped: 'no-slate-yet' }

  const out = {}
  for (const sl of slots) {
    try {
      let text = ''
      let payload = {}
      // Only BOT VS THE PEOPLE sets this; postToX renders them as tappable
      // buttons rather than typed A)/B)/C) in the body.
      let pollOptions = null
      // Only the spotlight carries a card. Every other weekly post is a list,
      // and a picture of a list is the thing the 2026-09-18 cards-off pass
      // deliberately removed.
      let card = null
      if (sl.kind === 'nfl_redzone' || sl.kind === 'nfl_goalline') {
        const stat = sl.kind === 'nfl_goalline' ? 'GL' : 'RZ'
        const picks = opportunityPicks(data, stat)
        text = opportunityText(picks, data, stat, TAIL)
        payload = { picks: picks.map((p) => ({ player_id: p.player_id, name: p.name, value: p.value })) }
      } else if (sl.kind === 'nfl_tdhistory') {
        if (!logs) { out[sl.kind] = 'no-logs-yet'; continue }
        const picks = tdHistoryPicks(logs, data)
        text = tdHistoryText(picks, data, TAIL)
        payload = { picks: picks.map((p) => ({ player_id: p.player_id, name: p.name, tds: p.tds, meetings: p.meetings, opp: p.opp })) }
      } else if (sl.kind === 'nfl_bigweek') {
        if (!box) { out[sl.kind] = 'no-box-score-yet'; continue }
        const picks = bigWeekPicks(box, data)
        text = bigWeekText(picks, data, TAIL)
        payload = { picks: picks.map((p) => ({ player_id: p.player_id, name: p.name, pos: p.pos, line: p.line })) }
      } else if (sl.kind === 'nfl_whyboard') {
        // Saturday's copy excludes whoever Friday named, so the two days are
        // two different players rather than the same anatomy twice. Reads
        // yesterday's own payload; a missing row just means no exclusion.
        const exclude = new Set()
        if (etWeekday(day) === 6) {
          const { data: fri } = await db.from('homer_feed_posts').select('payload')
            .match({ day: shiftDay(day, -1), kind: 'nfl_whyboard' }).maybeSingle()
          for (const p of fri?.payload?.picks || []) if (p?.player_id) exclude.add(String(p.player_id))
        }
        const pick = whyOnBoardPick(data, { exclude })
        text = whyOnBoardText(pick, data, TAIL)
        payload = pick ? { picks: [{ player_id: pick.player_id, name: pick.name, score: pick.score }] } : {}
      } else if (sl.kind === 'nfl_spotlight') {
        if (!box) { out[sl.kind] = 'no-box-score-yet'; continue }
        const pick = spotlightPick(box, data)
        text = spotlightText(pick, data, TAIL)
        payload = pick ? { picks: [{ player_id: pick.player_id, name: pick.name, week: pick.week }] } : {}
        if (pick) {
          // The card is handed the SAME strings the tweet uses -- window label
          // and closing statement -- so the two can never disagree about which
          // week this is or what it claims. See spotlightCard's own note.
          const td = (pick.patd || 0) + (pick.rutd || 0) + (pick.rectd || 0)
          const word = td === 1 ? 'touchdown' : 'touchdowns'
          const windowLabel = pick.done <= 3 ? 'THURSDAY NIGHT' : `WEEK ${pick.week}`
          const statement = pick.done <= 3
            ? `${td} total ${word} to open Week ${pick.week}`
            : `${td} total ${word} in Week ${pick.week}`
          const context = [pick.team, pick.opp ? `vs ${pick.opp}` : ''].filter(Boolean).join(' ')
          card = () => spotlightCard(pick, { site: SITE_HOST, windowLabel, statement, context })
        }
      } else if (sl.kind === 'nfl_board') {
        const picks = nflBoardPicks(data)
        text = nflBoardText(picks, data, tailFor('nfl_board'))
        // The FULL pick objects go in the payload, not a slimmed copy: Monday's
        // nfl_results reads this row back to grade it, and a grade run off a
        // board that was rebuilt on Monday would be grading a different board.
        // Frozen at post time, same rule the MLB pregame payload follows.
        payload = { picks }
      } else if (sl.kind === 'nfl_botpoll') {
        const picks = nflBotPollPicks(data)
        text = nflBotPollText(picks, data, TAIL)
        pollOptions = nflBotPollOptions(picks)
        // X refuses a poll with fewer than two options -- post it as plain
        // text rather than losing the post.
        if (pollOptions.length < 2) pollOptions = null
        payload = { options: pollOptions || [], picks: picks.map((p) => ({ player_id: p.player_id, name: p.name })) }
      } else if (sl.kind === 'nfl_community') {
        text = nflCommunityPickText(TAIL)
      } else if (sl.kind === 'nfl_results') {
        // Grades YESTERDAY's board -- Sunday's, read on Monday morning. Two
        // reads, both off what the account itself already published: the board
        // row it posted, and nfl_td_feed, the same table the live touchdown
        // alerts are written to. Nothing is recomputed, so the grade can never
        // disagree with the alerts that went out during the games.
        const yday = shiftDay(day, -1)
        const { data: prior } = await db.from('homer_feed_posts').select('payload')
          .match({ day: yday, kind: 'nfl_board' }).maybeSingle()
        const boardPicks = prior?.payload?.picks || []
        if (!boardPicks.length) { out[sl.kind] = 'no-board-to-grade'; continue }
        const { data: tds } = await db.from('nfl_td_feed').select('scorer_name').eq('day', yday)
        const scorers = new Set((tds || []).map((r) => String(r.scorer_name || '').toLowerCase()).filter(Boolean))
        text = nflBoardResultsText(boardPicks, scorers, data, tailFor('nfl_results'))
        payload = { picks: boardPicks, scorers: [...scorers], graded_day: yday }
      }
      if (!text) { out[sl.kind] = 'nothing-to-say-yet'; continue }
      if (!(await claimSlot(db, day, sl.kind))) { out[sl.kind] = 'already-posted-or-claim-failed'; continue }

      const patch = { payload }
      // Discord has no poll widget, so the options are typed there -- same
      // treatment the MLB botpoll already gives them.
      const forDiscord = pollOptions
        ? `${text}\n\n${pollOptions.map((n, i) => `${String.fromCharCode(65 + i)}) ${n}`).join('\n')}`
        : text
      // Rendered once, given to both services -- the same "ONE RENDER, BOTH
      // PLACES" rule the MLB tick's claimAndPostStat already follows, and for
      // the same reason: the card used to be built inside the X branch, so
      // Discord got bare text while a finished PNG existed a few lines later.
      const png = card ? await bytesOf(card) : null
      const d = await postToDiscord(forDiscord, { png }, FEED_WEBHOOKS())
      if (d.ok) patch.discord_sent = true
      if (hasX()) {
        const mediaId = png ? await uploadImageToX(png) : null
        const r = await postToX(text, {
          ...(mediaId ? { mediaId } : {}),
          ...(pollOptions ? { poll: { options: pollOptions, durationMinutes: NFL_POLL_DURATION_MIN } } : {}),
          // For the Threads mirror only: which weekly slot this is decides
          // whether a funnel link goes under it. X ignores it.
          kind: sl.kind,
        })
        if (r.ok && r.id) patch.x_post_id = r.id
        else console.error(`[nfl-tick] ${sl.kind} refused: ${r.status} ${r.error}`)
      }
      await db.from('homer_feed_posts').update(patch).match({ day, kind: sl.kind })
      out[sl.kind] = 'posted'
    } catch (err) {
      // One slot throwing must never take the touchdown alerts down with it --
      // same rule (and the same 2026-09-08 incident) behind safeStat() in the
      // MLB tick.
      console.error(`[nfl-tick] ${sl.kind} block threw`, err)
      out[sl.kind] = `error: ${String(err?.message || err)}`
    }
  }
  return out
}

// The twice-a-week Milestone post, unchanged in every particular except its
// shape: used to BE the whole route (its own early-returning Response.json
// per branch); now a plain function returning a plain result object, since
// GET needs to report on this AND runTouchdownTick() in one response.
async function runMilestoneTick(db, day) {
  const dow = etWeekday(day)
  const isThu = dow === 4
  const isSun = dow === 0
  if (!isThu && !isSun) return { skipped: 'not-a-milestone-day' }

  const hourGate = isThu ? THU_HOUR : SUN_HOUR
  if (etHoursSinceNoon() < hourGate) return { skipped: 'too-early', hourGate }

  // Same two fetches, same validator, NflDashboard.js already uses for the
  // slate (`data`) and logs — see components/nfl/NflDashboard.js.
  const [data, logs] = await Promise.all([
    fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null),
    fetchNfl(nflLogPaths()).catch(() => null),
  ])
  if (!data || !logs) return { skipped: 'no-data-yet' }

  const picks = milestonePicks(logs, data)
  const text = milestoneText(picks, data, TAIL)
  // No claim burned on a slate with nothing to say yet — same lesson
  // homers/tick's own pregame-post incident taught (see that file's header
  // note on computing picks BEFORE claiming): a tick that finds nothing
  // costs nothing and simply tries again next minute.
  if (!text) return { skipped: 'no-milestone-yet' }

  if (!(await claimSlot(db, day, 'nfl_milestone'))) {
    return { skipped: 'already-posted-or-claim-failed' }
  }

  const patch = { payload: { picks: picks.map((p) => ({ name: p.player?.name, market: p.marketKey, streak: p.streak })) } }
  const d = await postToDiscord(text, {}, FEED_WEBHOOKS())
  if (d.ok) patch.discord_sent = true
  if (hasX()) {
    const r = await postToX(text, { kind: 'nfl_milestone' })
    if (r.ok && r.id) patch.x_post_id = r.id
    else console.error(`[nfl-tick] nfl_milestone refused: ${r.status} ${r.error}`)
  }
  await db.from('homer_feed_posts').update(patch).match({ day, kind: 'nfl_milestone' })

  return { posted: true, text }
}

export async function GET(request) {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (await isMaintenanceMode()) return Response.json({ skipped: 'maintenance_mode' })
  const db = service()
  if (!db) return Response.json({ skipped: 'supabase-service-key-missing' })

  const day = easternToday()

  // Touchdown alerts run every tick, any day -- independent of Milestone's
  // own Thursday/Sunday gate below (see runTouchdownTick()'s own header).
  const td = await runTouchdownTick(db, day)
  const milestone = await runMilestoneTick(db, day)
  const weekly = await runWeeklyContentTick(db, day)

  const threads = threadsSnapshot()
  return Response.json({ day, td, milestone, weekly, ...(threads.length ? { threads } : {}) })
}
