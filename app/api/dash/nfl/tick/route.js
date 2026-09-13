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
  fetchNfl, nflLogPaths, nflMatchupLooksReal, nflMatchupPaths,
  nflPicksLooksReal, nflPicksPaths, nflRosterPaths, nflSlateLooksReal, nflSlatePaths,
} from '../../../../../lib/nfl/dataSource'
import { milestonePicks, milestoneText } from '../../../../../lib/nfl/tweetFeed'
import { fetchNflLive } from '../../../../../lib/nfl/liveSlate'
import { buildTdEvent, eventFromRow, rowFromEvent, tdPostText, touchdownsInSnap } from '../../../../../lib/nfl/tdFeed'
import { tdCard } from '../../../../../lib/nfl/tdCard'
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
const TAIL = process.env.X_POST_LINK === '1' ? { site: SITE, handle: HANDLE } : { site: '', handle: '' }
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
async function runTouchdownTick(db, day) {
  const totals = { seen: 0, fresh: 0, discord: 0, x: 0, xFailed: 0 }
  try {
    const snap = await fetchNflLive({})
    const liveTds = touchdownsInSnap(snap)
    totals.seen = liveTds.length
    if (!liveTds.length) return totals

    // Same four payloads lib/nfl/tdFeed.js's buildTdEvent() can use, fetched
    // once per tick regardless of how many touchdowns are on it. Every one
    // of these can come back null (roster especially -- see dataSource.js's
    // own note that nfl_roster.json has no committed-snapshot fallback yet)
    // and buildTdEvent() already treats a missing input as "skip that
    // enrichment," never as a reason to fail the whole event.
    const [roster, logs, picksData, matchup] = await Promise.all([
      fetchNfl(nflRosterPaths()).catch(() => null),
      fetchNfl(nflLogPaths()).catch(() => null),
      fetchNfl(nflPicksPaths(), nflPicksLooksReal).catch(() => null),
      fetchNfl(nflMatchupPaths(), nflMatchupLooksReal).catch(() => null),
    ])
    const picksCard = picksData?.card || null
    const season = Number(matchup?.season) || new Date(`${day}T12:00:00Z`).getUTCFullYear()

    const rows = liveTds.map((play) => {
      const game = snap.games.find((g) => g.game_id === play.game_id)
      const ev = buildTdEvent(play, { game, roster, logs, picksCard, matchup, season, day })
      return rowFromEvent(day, ev)
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
      .eq('day', day)
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
          .match({ day, game_id: row.game_id, td_n: row.td_n })
          .is('x_post_id', null)
          .select('game_id')
        if (claimError) console.error(`[nfl-tick] td claim failed for ${row.game_id}/${row.td_n}: ${claimError.message}`)
        if (claim?.length) {
          const mediaId = png ? await uploadImageToX(png) : null
          const r = await postToX(text, { mediaId })
          if (r.ok && r.id) { patch.x_post_id = r.id; totals.x += 1 }
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
        await db.from('nfl_td_feed').update(patch).match({ day, game_id: row.game_id, td_n: row.td_n })
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
    const r = await postToX(text)
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

  return Response.json({ day, td, milestone })
}
