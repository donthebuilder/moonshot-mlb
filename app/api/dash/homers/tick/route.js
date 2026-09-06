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
import { fetchLiveSlate } from '../../../../../lib/liveSlate'
import { fetchBoardFull } from '../../../../../lib/dash/board'
import { oddsPaths, pairSummaryPaths } from '../../../../../lib/dataSource'
import { boardIndexFrom, captureFrom, fmtOdds, homersFrom, hooksFor, longshotPick, longshotText, monthlyText, pairsToWatch, pairsToWatchText, partnerFor, postText, pregamePicks, pregameText, topStreakFrom, weeklyText } from '../../../../../lib/dash/homerFeed'
import { homerCard, pregameCard, recapCard, statCard } from '../../../../../lib/dash/homerCard'
import { hasX, postToDiscord, postToX, uploadImageToX, xProblem } from '../../../../../lib/dash/xPost'
import { isMaintenanceMode } from '../../../../../lib/edgeConfig'
import { backfillOneNight } from '../../../../../lib/dash/homerBackfill'

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

// The pregame post goes out once the lineups start posting, or once the
// earliest first pitch on tonight's board is under an hour away, whichever
// comes first -- and only while nothing has started, unless that one-hour
// deadline has already passed (see `overdue` below), because a slate that
// blows past its own deadline needs the post late more than it needs the
// "before anything started" rule kept perfectly. PREGAME_HOUR_UTC is now
// only the last-resort fallback for the one night the board has no
// game_time data at all to compute a real deadline from.
const PREGAME_HOUR_UTC = 20
const PREGAME_LEAD_MS = 60 * 60 * 1000

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
 * The night's recap — text + card to Discord and X, and on a Sunday the week.
 * Claimed on `homerfeed:recap:<day>` so it goes out once; `force` re-posts
 * (a test, or a night whose post failed) without touching the claim.
 */
async function postRecap(db, day, { force = false } = {}) {
  const xOn = hasX()
  const out = { recap: xOn ? 'posted' : 'x-not-configured', ...(xOn ? {} : { x_problem: xProblem() }) }
  const key = `homerfeed:recap:${day}`
  const { data: claim } = await db
    .from('dash_push_seen')
    .upsert([{ event_key: key }], { onConflict: 'event_key', ignoreDuplicates: true })
    .select('event_key')
  if (!claim?.length && !force) return { recap: 'already' }
  {
    const { data: rows } = await db.from('homer_feed').select('name,team,role,on_board,board_rank').eq('day', day)
    const c = captureFrom(rows)
    if (c.total) {
      const roles = Object.entries(c.byRole).sort((a, b) => b[1] - a[1]).map(([r, n]) => `${r} ${n}`).join(' · ')
      const { data: hist } = await db.from('homer_feed').select('day,role,name,odds_over,odds_book').gte('day', shiftDay(day, -12)).lte('day', day)
      const straight = topStreakFrom(hist || [], day, false)
      const text = [
        `📋 ${day} — the bot called ${c.called} of ${c.total} home runs (${c.pct}%)`,
        roles ? `🤖 ${roles}` : '',
        c.rated ? `⚪ ${c.rated} more were on the board, no call` : '',
        straight >= 2 ? `🔥 A TOP pick has gone deep ${straight} straight nights` : '',
        [TAIL.site, TAIL.handle].filter(Boolean).join(' · '),
      ].filter(Boolean).join('\n')
      await postToDiscord(text, { imageUrl: recapUrl(day) })
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
        const { data: wk } = await db
          .from('homer_feed_posts')
          .upsert([{ day, kind: 'weekly', payload: {} }], { onConflict: 'day,kind', ignoreDuplicates: true })
          .select('day')
        if (wk?.length) {
          const from = shiftDay(day, -6)
          const week = (hist || []).filter((r) => r.day >= from && r.day <= day)
          const wtext = weeklyText(week, { from, to: day, ...TAIL })
          const wc = captureFrom(week)
          const patch = { payload: { from, to: day, called: wc.called, total: wc.total } }
          const d = await postToDiscord(wtext)
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
        const { data: mo } = await db
          .from('homer_feed_posts')
          .upsert([{ day, kind: 'monthly', payload: {} }], { onConflict: 'day,kind', ignoreDuplicates: true })
          .select('day')
        if (mo?.length) {
          const prevLastDay = shiftDay(day, -1)
          const monthFrom = `${prevLastDay.slice(0, 7)}-01`
          const { data: monthRows } = await db.from('homer_feed').select('day,role').gte('day', monthFrom).lte('day', prevLastDay)
          const monthLabel = new Date(`${monthFrom}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
          const mtext = monthlyText(monthRows || [], { month: monthLabel, ...TAIL })
          const mc = captureFrom(monthRows || [])
          const patch = { payload: { from: monthFrom, to: prevLastDay, called: mc.called, total: mc.total } }
          const d = await postToDiscord(mtext)
          if (d.ok) patch.discord_sent = true
          if (xOn) {
            const png = await bytesOf(() => statCard(day, {
              pill: 'MONTHLY', label: monthLabel.toUpperCase(),
              headline: `${mc.called} of ${mc.total} home runs on the bot (${mc.pct ?? 0}%)`,
              lines: [`TOP ${mc.byRole.TOP || 0}  ·  HR ${mc.byRole.HR || 0}  ·  HR Watch ${mc.byRole.WATCH || 0}`],
            }, { site: SITE_HOST }))
            const mediaId = png ? await uploadImageToX(png) : null
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

  const day = easternToday()
  // The nights before the feed existed, one per tick until the /called window
  // is full (lib/dash/homerBackfill). Runs before the no-games exits on
  // purpose: an off day is exactly when there is time for it.
  const backfill = await backfillOneNight(db, day)
  const snap = await fetchLiveSlate({ force: true }).catch(() => null)
  if (!snap?.games?.length) return Response.json({ day, skipped: 'no-games', backfill })

  const started = snap.games.some((g) => g?.state === 'Live' || g?.state === 'Final')
  const [board, odds, pairs] = await Promise.all([boardIndex(day), oddsFile(), pairsFile()])
  // 2026-09-06 (Donovan: "at least a hour before first pitch"). Computed off
  // whatever the board holds right now -- boardIndex() only just resolved
  // above, so this always sees the freshest cached rows.
  const firstPitch = firstPitchOf(boardRows())
  const overdue = firstPitch != null && Date.now() >= firstPitch - PREGAME_LEAD_MS

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
  if (!started || overdue) {
    const ready = board.size && (
      overdue ||
      snap.games.some((g) => g?.lineupPosted) ||
      (firstPitch == null && new Date().getUTCHours() >= PREGAME_HOUR_UTC)
    )
    // Every early return below is now guarded on `!started`: when overdue is
    // the ONLY reason this block ran (a cron gap let an early game go Live
    // before the deadline post went out), the pregame attempt still happens
    // but this falls through to homer processing afterward instead of
    // returning -- a late tick must not also skip tonight's live homers.
    if (!ready) {
      if (!started) return Response.json({ day, skipped: 'nothing-started' })
    } else {
      // PAIRS TO WATCH + TONIGHT'S LONGEST CALL (2026-09-06, Donovan).
      // Each claims its own (day, kind) row, independent of the pregame
      // call below and of each other -- a slow news night for one is not a
      // reason to hold back the other, and neither can double-post.
      {
        const hits = pairsToWatch(boardRows(), pairs)
        if (hits.length) {
          const { data: claim } = await db
            .from('homer_feed_posts')
            .upsert([{ day, kind: 'pairswatch', payload: {} }], { onConflict: 'day,kind', ignoreDuplicates: true })
            .select('day')
          if (claim?.length) {
            const text = pairsToWatchText(hits, { day, ...TAIL })
            const patch = { payload: { hits } }
            const d = await postToDiscord(text)
            if (d.ok) patch.discord_sent = true
            if (hasX()) {
              const png = await bytesOf(() => statCard(day, {
                pill: 'PAIRS', label: 'PAIRS TO WATCH',
                headline: hits.map((h) => `${h.a.name} & ${h.b.name}`).join('  ·  '),
                lines: hits.map((h) => `${h.count}x same-day this season${h.rate != null ? ` (${h.rate}%)` : ''} · ${h.a.team || '?'} vs ${h.a.opponent || '?'}, ${h.b.team || '?'} vs ${h.b.opponent || '?'}`),
              }, { site: SITE_HOST }))
              const mediaId = png ? await uploadImageToX(png) : null
              const r = await postToX(text, { mediaId })
              if (r.ok && r.id) patch.x_post_id = r.id
              else console.error(`[homers] pairs-to-watch refused: ${r.status} ${r.error}`)
            }
            await db.from('homer_feed_posts').update(patch).match({ day, kind: 'pairswatch' })
          }
        }
      }
      {
        const pick = longshotPick(boardRows(), odds, day)
        if (pick) {
          const { data: claim } = await db
            .from('homer_feed_posts')
            .upsert([{ day, kind: 'longshot', payload: {} }], { onConflict: 'day,kind', ignoreDuplicates: true })
            .select('day')
          if (claim?.length) {
            const text = longshotText(pick, { day, ...TAIL })
            const patch = { payload: { pick } }
            const d = await postToDiscord(text)
            if (d.ok) patch.discord_sent = true
            if (hasX()) {
              const png = await bytesOf(() => statCard(day, {
                pill: 'LONGSHOT', label: "TONIGHT'S LONGEST CALL",
                headline: `${pick.name}${pick.team ? ` (${pick.team})` : ''}`,
                lines: [
                  `${fmtOdds(pick.over)} · ${pick.book}${pick.opponent ? ` to go deep vs ${pick.opponent}` : ''}`,
                  pick.hr_score != null ? `HR score ${Math.round(pick.hr_score)}` : '',
                ],
              }, { site: SITE_HOST }))
              const mediaId = png ? await uploadImageToX(png) : null
              const r = await postToX(text, { mediaId })
              if (r.ok && r.id) patch.x_post_id = r.id
              else console.error(`[homers] longshot refused: ${r.status} ${r.error}`)
            }
            await db.from('homer_feed_posts').update(patch).match({ day, kind: 'longshot' })
          }
        }
      }

      const picks = pregamePicks(boardRows(), odds, day)
      if (!picks.length) {
        if (!started) return Response.json({ day, skipped: 'nothing-started', pregame: 'no-picks' })
      } else {
        const { data: claim } = await db
          .from('homer_feed_posts')
          .upsert([{ day, kind: 'pregame', payload: {} }], { onConflict: 'day,kind', ignoreDuplicates: true })
          .select('day')
        if (!claim?.length) {
          if (!started) return Response.json({ day, skipped: 'nothing-started', pregame: 'already' })
        } else {
          const text = pregameText(picks, { day, ...TAIL })
          const patch = { payload: { picks } }
          // The payload goes in FIRST so the public card route can render the
          // Discord embed from it; the post ids follow.
          await db.from('homer_feed_posts').update({ payload: { picks } }).match({ day, kind: 'pregame' })
          const d = await postToDiscord(text, { imageUrl: pregameUrl(day) })
          if (d.ok) patch.discord_sent = true
          if (hasX()) {
            const png = await bytesOf(() => pregameCard(day, picks, { site: SITE_HOST }))
            const mediaId = png ? await uploadImageToX(png) : null
            const r = await postToX(text, { mediaId })
            if (r.ok && r.id) patch.x_post_id = r.id
            else console.error(`[homers] pregame refused: ${r.status} ${r.error}`)
          }
          await db.from('homer_feed_posts').update(patch).match({ day, kind: 'pregame' })
          if (!started) return Response.json({ day, skipped: 'nothing-started', pregame: patch.x_post_id || 'posted' })
        }
      }
    }
  }
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
      const stats = { ...(ev.stats || {}), jersey }
      ev.hooks = hooks
      ev.stats = stats
      ev.partner_id = partner?.id || null
      await db.from('homer_feed').update({ hooks, stats, partner_id: ev.partner_id }).match({ day, player_id: ev.player_id, hr_n: ev.hr_n })
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
  const preIds = new Set(((pre?.payload?.picks) || []).map((p) => String(p.player_id)))
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
        const { data: claim } = await db
          .from('homer_feed')
          .update({ x_post_id: 'posting' })
          .match({ day, player_id: row.player_id, hr_n: row.hr_n })
          .is('x_post_id', null)
          .select('player_id')
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
  const allDone = snap.games.every((g) => g?.settled || g?.postponed || g?.suspended || g?.state === 'Final')
  if (allDone) Object.assign(totals, await postRecap(db, day))

  return Response.json(totals)
}
