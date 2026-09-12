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
// TEXT ONLY, NO CARD IMAGE. MLB's stat-feed posts render a PNG via
// statCard(); an NFL equivalent is real work and is deliberately not part of
// this. postToX/postToDiscord both already handle bare text fine — several
// of MLB's own slots go out with no image on a night their picker returns
// nothing to draw a card from.

import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'

import { easternToday } from '../../../../../lib/data'
import { fetchNfl, nflLogPaths, nflSlateLooksReal, nflSlatePaths } from '../../../../../lib/nfl/dataSource'
import { milestonePicks, milestoneText } from '../../../../../lib/nfl/tweetFeed'
import { hasX, postToDiscord, postToX } from '../../../../../lib/dash/xPost'
import { isMaintenanceMode } from '../../../../../lib/edgeConfig'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const HANDLE = String(process.env.X_HANDLE || '').trim()
// Same no-URL-in-the-post-text rule as the MLB tick — X's pay-per-use pricing
// charges 13x more for a post containing a link (see homers/tick's own TAIL
// for the full reasoning). NEXT_PUBLIC_SITE_URL rather than a hardcoded NFL
// path since there's no dedicated NFL page to point at yet.
const SITE = (process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
const TAIL = process.env.X_POST_LINK === '1' ? { site: SITE, handle: HANDLE } : { site: '', handle: '' }

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

export async function GET(request) {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (await isMaintenanceMode()) return Response.json({ skipped: 'maintenance_mode' })
  const db = service()
  if (!db) return Response.json({ skipped: 'supabase-service-key-missing' })

  const day = easternToday()
  const dow = etWeekday(day)
  const isThu = dow === 4
  const isSun = dow === 0
  if (!isThu && !isSun) return Response.json({ day, skipped: 'not-a-milestone-day' })

  const hourGate = isThu ? THU_HOUR : SUN_HOUR
  if (etHoursSinceNoon() < hourGate) return Response.json({ day, skipped: 'too-early', hourGate })

  // Same two fetches, same validator, NflDashboard.js already uses for the
  // slate (`data`) and logs — see components/nfl/NflDashboard.js.
  const [data, logs] = await Promise.all([
    fetchNfl(nflSlatePaths(), nflSlateLooksReal).catch(() => null),
    fetchNfl(nflLogPaths()).catch(() => null),
  ])
  if (!data || !logs) return Response.json({ day, skipped: 'no-data-yet' })

  const picks = milestonePicks(logs, data)
  const text = milestoneText(picks, data, TAIL)
  // No claim burned on a slate with nothing to say yet — same lesson
  // homers/tick's own pregame-post incident taught (see that file's header
  // note on computing picks BEFORE claiming): a tick that finds nothing
  // costs nothing and simply tries again next minute.
  if (!text) return Response.json({ day, skipped: 'no-milestone-yet' })

  if (!(await claimSlot(db, day, 'nfl_milestone'))) {
    return Response.json({ day, skipped: 'already-posted-or-claim-failed' })
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

  return Response.json({ day, posted: true, text })
}
