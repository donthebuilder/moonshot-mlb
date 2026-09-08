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
import { fetchBoardFull } from '../../../../../lib/dash/board'
import { oddsPaths, pairSummaryPaths } from '../../../../../lib/dataSource'
import { boardIndexFrom, captureFrom, fmtOdds, roleWord, homersFrom, hooksFor, longshotPick, longshotText, monthlyText, numerologyMoment, numerologyText, pairsToWatch, pairsToWatchText, partnerFor, postText, pregameCalled, pregamePicks, pregameText, topStreakFrom, weeklyText } from '../../../../../lib/dash/homerFeed'
import { homerCard, pregameCard, recapCard, statCard } from '../../../../../lib/dash/homerCard'
import { backToBackPicks, backToBackText, dangerComboPicks, dangerComboText, fetchWeekdayHrLeaders, funFactsPicks, funFactsText, hottestContactPicks, hottestContactText, hrLeadersByDowText, liveIndexFrom, playableRows } from '../../../../../lib/dash/tweetFeed'
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

async function claimAndPostStat(db, day, kind, hourGate, text, card) {
  if (!text || etHoursSinceNoon() < hourGate) return false
  if (!(await claimSlot(db, day, kind))) return false
  const patch = { payload: {} }
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

// STAT-FEED POST TIMES (2026-09-07, Donovan: "3-5 posts minimum a day...
// mostly pregame, then a couple mid-slate"). Expressed as hours after noon
// ET so a late-evening threshold (9pm) compares correctly even once the UTC
// clock has rolled to the next calendar date -- see etHoursSinceNoon below.
// Same DST assumption as PREGAME_HOUR_UTC above (hardcoded for EDT, the
// offset in effect for the whole regular season); accepted there already.
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
        out.push({ name: String(row.name || '').trim(), team: String(row.team || '').trim() || null, age })
      }
    } catch (err) {
      console.error('[homers] birthday lookup failed', err)
    }
  }
  return out
}

function birthdayText(people, { day = '', site = '', handle = '' } = {}) {
  if (!Array.isArray(people) || !people.length) return ''
  const tail = [site, handle].filter(Boolean).join(' · ')
  const head = `🎂 BIRTHDAY WATCH${day ? ` — ${day.slice(5).replace('-', '/')}` : ''}`
  const lines = people.map((p) => `${p.name}${p.team ? ` (${p.team})` : ''}${p.age != null ? ` — turns ${p.age}` : ''}`)
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
    // formatters above: fetchWeekdayHrLeaders walks up to 8 graded_results
    // files off the network, and this block now runs on every tick all day
    // rather than only inside the old pregame gate.
    if (etHoursSinceNoon() >= HR_LEADERS_DOW_HOUR) {
      const { leaders, dow } = await fetchWeekdayHrLeaders(day)
      await claimAndPostStat(db, day, 'hrleadersdow', HR_LEADERS_DOW_HOUR,
        hrLeadersByDowText(leaders, dow, { day, ...TAIL }),
        leaders.length ? {
          pill: 'LEADERS', label: `MLB HR LEADERS — ${String(dow || '').toUpperCase()}S`,
          headline: `Most home runs on a ${dow || 'this weekday'} this season`,
          lines: leaders.map((p) => `${p.name} (${p.team || '?'}) — ${p.hr} HR${p.avgEv != null ? `, ${p.avgEv} mph avg EV` : ''}`),
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
      const bdays = await birthdaysToday(pregameRows(), day)
      await claimAndPostStat(db, day, 'birthday', BIRTHDAY_HOUR,
        birthdayText(bdays, { day, ...TAIL }),
        bdays.length ? {
          pill: 'BDAY', label: 'BIRTHDAY WATCH',
          headline: bdays.length === 1 ? bdays[0].name : `${bdays.length} on the slate celebrating tonight`,
          lines: bdays.map((p) => `${p.name}${p.team ? ` (${p.team})` : ''}${p.age != null ? ` — turns ${p.age}` : ''}`),
        } : null)
    }
    {
      const b2b = backToBackPicks(pregameRows(), day)
      await claimAndPostStat(db, day, 'backtoback', BACK_TO_BACK_HOUR,
        backToBackText(b2b, { day, ...TAIL }),
        b2b.length ? {
          pill: 'B2B', label: 'BACK-TO-BACK WATCH',
          headline: b2b.length === 1 ? b2b[0].name : `${b2b.length} hitters chasing an encore`,
          lines: b2b.map((p) => `${p.name}${p.team ? ` (${p.team})` : ''}`),
        } : null)
    }
    if (etHoursSinceNoon() >= FUN_FACTS_HOUR) {
      const facts = await funFactsPicks(pregameRows(), day)
      await claimAndPostStat(db, day, 'funfacts', FUN_FACTS_HOUR,
        funFactsText(facts, { day, ...TAIL }),
        facts.length ? {
          pill: 'FACTS', label: 'FUN FACTS',
          headline: facts[0]?.player ? String(facts[0].player.name || facts[0].player) : 'Tonight\'s whimsical stat line',
          lines: facts.map((f) => `${f?.icon || ''} ${f?.text || ''}`.trim()).filter(Boolean),
        } : null)
    }
  }

  if (!started || overdue) {
    const ready = board.size && (
      overdue ||
      gamesLive.some((g) => g?.lineupPosted) ||
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
        const hits = pairsToWatch(pregameRows(), pairs)
        if (hits.length) {
          const claim = await claimSlot(db, day, 'pairswatch')
          if (claim) {
            const text = pairsToWatchText(hits, { day, ...TAIL })
            const patch = { payload: { hits } }
            // Rendered here, above the Discord post, so both services take the
            // same one render -- see claimAndPostStat. It used to be built
            // inside the X branch, which left Discord with bare text and, on
            // a night with X off, built no card at all.
            const png = await bytesOf(() => statCard(day, {
              pill: 'PAIRS', label: 'THE PAIR TRAP',
              headline: hits.map((h) => `${h.a.name} & ${h.b.name}`).join('  ·  '),
              lines: hits.map((h) => `${h.count}x same-day this season${h.rate != null ? ` (${h.rate}%)` : ''} · ${h.a.team || '?'} vs ${h.a.opponent || '?'}, ${h.b.team || '?'} vs ${h.b.opponent || '?'}`),
            }, { site: SITE_HOST }))
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
      {
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
            const png = await bytesOf(() => statCard(day, {
              pill: 'LONGSHOT', label: 'THE MOONSHOT',
              headline: `${pick.name}${pick.team ? ` (${pick.team})` : ''}`,
              lines: [
                `${fmtOdds(pick.over)} · ${pick.book}${pick.opponent ? ` to go deep vs ${pick.opponent}` : ''}`,
                pick.hr_score != null ? `MOONSHOT Score ${Math.round(pick.hr_score)}` : '',
              ],
            }, { site: SITE_HOST }))
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

      const picks = pregamePicks(pregameRows(), odds, day)
      // Every roled name on tonight's board, for the receipt quote only --
      // see pregameCalled() in homerFeed.js. Not used by any post text.
      const called = pregameCalled(pregameRows())
      if (!picks.length) {
        if (!started) return Response.json({ day, skipped: 'nothing-started', pregame: 'no-picks' })
      } else {
        const claim = await claimSlot(db, day, 'pregame')
        if (!claim) {
          if (!started) return Response.json({ day, skipped: 'nothing-started', pregame: 'already' })
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
          if (!started) return Response.json({ day, skipped: 'nothing-started', pregame: patch.x_post_id || 'posted' })
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
    const { data: dayRows } = await db.from('homer_feed').select('player_id,name,team,hr_n,stats').eq('day', day)
    const moment = numerologyMoment(dayRows || [])
    if (moment) {
      const claim = await claimSlot(db, day, 'numerology')
      if (claim) {
        const text = numerologyText(moment, { day, ...TAIL })
        const patch = { payload: { moment } }
        // Rendered above the Discord post so both services take one render --
        // see claimAndPostStat. Sat inside the X branch, which left Discord
        // with bare text and built nothing at all on a night with X off.
        const cardLabel = moment.tier === 'trifecta' ? 'TRIFECTA' : moment.tier === 'jersey' ? 'JERSEY MATCH' : 'CLUSTER'
        const cardHeadline = moment.tier === 'jersey'
          ? moment.players.map((p) => p.name).join(' & ')
          : moment.players.slice(0, 4).map((p) => p.name).join(', ')
        const cardLines = moment.tier === 'trifecta'
          ? [`#${moment.players[0].jersey} · HR #${moment.players[0].nth} · born on the digit root ${moment.root}`]
          : moment.tier === 'jersey'
            ? [`Both wearing #${moment.jersey}, both deep tonight`]
            : [`${moment.players.length} homers, jersey digit root ${moment.root}`]
        const png = await bytesOf(() => statCard(day, {
          pill: 'NUMEROLOGY', label: cardLabel, headline: cardHeadline, lines: cardLines,
        }, { site: SITE_HOST }))
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
  if (totals.x > 0) {
    try {
      const monthStart = `${day.slice(0, 7)}-01`
      const [alerts, posts] = await Promise.all([
        db.from('homer_feed').select('*', { count: 'exact', head: true })
          .gte('day', monthStart).lte('day', day)
          .not('x_post_id', 'is', null)
          .not('x_post_id', 'in', '("posting","skipped")'),
        db.from('homer_feed_posts').select('*', { count: 'exact', head: true })
          .gte('day', monthStart).lte('day', day)
          .not('x_post_id', 'is', null),
      ])
      const used = (alerts.count || 0) + (posts.count || 0)
      totals.xMonth = { used, cap: X_MONTHLY_CAP, mode: MODE }
      if (used >= X_MONTHLY_CAP) {
        console.error(`[homers] X MONTHLY CAP REACHED: ${used}/${X_MONTHLY_CAP} this month (mode=${MODE}). Expect 429s until the cycle resets; X_POST_MODE=flagged is the switch.`)
      } else if (used >= X_MONTHLY_CAP * 0.8) {
        console.warn(`[homers] X monthly budget at ${used}/${X_MONTHLY_CAP} (mode=${MODE}).`)
      }
    } catch (e) {
      // A failed count must never take the tick down with it.
      console.error(`[homers] X budget count failed: ${e.message}`)
    }
  }

  return Response.json(totals)
}
