// THE SENDER. One cron run: look at what is happening right now, work out
// which of it is new, and push it to the people who asked for that kind of
// thing — whether or not they have the site open.
//
// This is the only place on this site where a message goes OUT to a person
// rather than a person coming in to look, so the rules are strict:
//
//   1. ONLY WHAT THEY ASKED FOR. Every send is checked against that user's own
//      alert settings (dash_alerts_v1) AND their follow list (dash_follow_v1).
//      No follows, no messages. A category switched off is never sent. There
//      is no "announcement" path and there should never be one.
//   2. NEW EVENTS ONLY, GLOBALLY. dash_push_seen records every event id the
//      moment it is first observed. Anything already in that table is old and
//      goes to nobody — which is also what stops a subscription created at 9pm
//      from receiving the evening's backlog, with no backlog logic anywhere.
//   3. A DEAD SUBSCRIPTION IS DELETED, NOT RETRIED FOREVER. A push service
//      answering 404/410 means that browser is gone for good.
//   4. IT NEVER FAILS LOUDLY AT THE USER. Missing config, an unreachable
//      league feed, a push service outage — each returns a counted, quiet
//      no-op. A cron that throws is a cron that stops running.
//
// CADENCE. Stale as of 2026-09-06: this used to run every ten minutes, and
// said so here. vercel.json now crons it every minute during game windows,
// with the in-run sweep below (SWEEP_GAP_MS/MAX_SWEEPS) cutting worst-case
// lag inside that minute further still. That is still deliberately not
// "instant": instant needs a process holding a live socket to the league,
// which this architecture does not have and should not grow for. But the
// honest promise today is under a minute, not ten.

import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { createHash, timingSafeEqual } from 'node:crypto'

import { easternToday } from '../../../../../lib/data'
import { fetchLiveSlate } from '../../../../../lib/liveSlate'
import { fetchNflLive } from '../../../../../lib/nfl/liveSlate'
import { hasVapid, vapidDetails, vapidProblem } from '../../../../../lib/dash/vapid'
import { claimBoardWindow, fetchBoard } from '../../../../../lib/dash/board'
import { byeStarterEventsFrom, franchiseEventsFrom, lineupGapEventsFrom } from '../../../../../lib/dash/franchise'
import { audienceFrom, mlbEventsFrom, nflEventsFrom, pregameEventsFrom, priorityOf, wants } from '../../../../../lib/dash/pushRules'
import { fanOutToDiscord } from '../../../../../lib/dash/discordAlerts'
import { isMaintenanceMode, isRedZoneAlertsEnabled } from '../../../../../lib/edgeConfig'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

function authorized(request) {
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (!supplied) return false
  return [process.env.CRON_SECRET, process.env.FRANCHISE_CRON_SECRET].filter(Boolean).some((expected) => {
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

// ── what happened ──────────────────────────────────────────────────────────
//
// The shapes and the rules live in lib/dash/pushRules.js so they can be tested
// without a database or a live feed; these two just do the fetching.

// THE DAY AN EVENT BELONGS TO IS AN EASTERN CALENDAR DAY, never this
// machine's. `new Date()` here runs on Vercel, and Vercel is UTC -- so the
// old `toLocaleDateString('en-CA')` rolled the day at 00:00 UTC, which is
// 8pm ET: the middle of a baseball evening, every single night.
//
// The dedupe key is `mlb:${day}:${id}:hr:${hr}`. At 8pm ET the `day` in that
// key changed, so every followed hitter who had already gone deep produced a
// brand new key for the SAME home run, missed the seen-check, and was pushed
// about it a second time. Nobody had caught it because with no subscribers
// nothing was ever sent; the first night with a real subscriber would have
// been a duplicate blast at 8:00pm ET.
//
// lib/data.js's easternToday is the frame the rest of the site settled on
// (2026-08-17, the slate-is-an-Eastern-calendar-day fix) and the frame the
// league dates its own games in. There is no second opinion about the day.
const today = () => easternToday()

async function mlbEvents(audience) {
  const snap = await fetchLiveSlate({ force: true }).catch(() => null)
  return mlbEventsFrom(snap, today(), audience)
}

// BEFORE FIRST PITCH. Costs a board read, so it is gated three ways: somebody
// has to follow somebody, at least one game has to still be in Preview, and
// this run has to win the fetch window against every other run in the same five
// minutes. All three fail cheaply and the common case does no work at all.
//
// fetchLiveSlate is called WITHOUT force here on purpose: mlbEvents has just
// pulled it, so this is the in-process cache rather than a second trip to the
// league.
async function pregameEvents(db, audience) {
  if (!audience?.mlb?.size) return []
  const snap = await fetchLiveSlate().catch(() => null)
  if (!snap?.games?.some((g) => g?.state === 'Preview')) return []
  if (!(await claimBoardWindow(db))) return []
  const rows = await fetchBoard('today')
  return rows ? pregameEventsFrom(rows, snap, today(), audience) : []
}

async function nflEvents(audience) {
  const snap = await fetchNflLive({ force: true }).catch(() => null)
  return nflEventsFrom(snap, today(), audience)
}

// ── HOW MANY MESSAGES, AND WHEN ────────────────────────────────────────────
//
// At */10 a flat cap of three per run was enough. At */1 it is not: three a
// minute is a hundred and eighty an hour, which is how a notification channel
// gets muted and never turned back on. Two rules replace the cap.
//
//   BUNDLE. Everything going to one device in one tick goes as ONE
//   notification. Three of your guys doing something is one buzz that names
//   three men, not three buzzes. BODY_CAP keeps the text readable past that.
//
//   THROTTLE THE QUIET ONES. Priority 0 -- the homer, the touchdown -- is
//   never held; that is the whole promise of the channel. Everything else gets
//   at most one message per QUIET_WINDOW_MS per device. The slot is claimed
//   exactly the way an event is: an insert into dash_push_seen that either
//   sticks or does not, so two overlapping runs can never both decide they own
//   this window. No new table, no new column, no clock to trust.
//
// Quiet events that lose the claim are DROPPED, not queued. They are already
// marked seen, and "he doubled" arriving eleven minutes late is worth less
// than the silence it costs.
const QUIET_WINDOW_MS = 10 * 60 * 1000
const BODY_CAP = 5

const shortId = (s) => createHash('sha1').update(String(s)).digest('hex').slice(0, 16)

async function claimQuietSlot(db, endpoint) {
  const key = `quiet:${shortId(endpoint)}:${Math.floor(Date.now() / QUIET_WINDOW_MS)}`
  const { data } = await db
    .from('dash_push_seen')
    .upsert([{ event_key: key }], { onConflict: 'event_key', ignoreDuplicates: true })
    .select('event_key')
  return Boolean(data?.length)
}

/**
 * One notification out of one event or many.
 *
 * A single event keeps EXACTLY the shape it had before this existed -- same
 * title, same body, same tag -- so nothing about the one-thing-happened case
 * changed. Past that it collapses: when everything in the bundle is the same
 * kind of thing, the count carries the verb ("5 went deep") and the body is
 * just the names, because five lines all ending in "goes yard" read as noise
 * where five names read as news.
 */
function bundle(events) {
  // ONE LINE PER PERSON. A hitter who homers, clears HRR and passes four total
  // bases inside the same minute is one man having a good night, not three
  // bullet points with his name on each. Keep his loudest event and drop the
  // rest -- they are all saying the same thing about the same at-bat.
  const best = new Map()
  const solo = []
  for (const e of events) {
    const who = e.playerId || e.playerName
    if (!who) { solo.push(e); continue }
    const prev = best.get(who)
    if (!prev || priorityOf(e) < priorityOf(prev)) best.set(who, e)
  }
  // A GAME-level event -- first pitch, kickoff -- is worth a line only when it
  // is telling you about somebody the bundle has not already named. "Schwarber,
  // Harper and Judge are underway" underneath "Schwarber, Harper, Judge" is the
  // same sentence twice.
  const kept = solo.filter((e) => {
    const named = [...(e.playerIds || []), ...(e.playerNames || [])].map(String)
    return !named.length || !named.every((n) => best.has(n))
  })
  const list = [...best.values(), ...kept].sort((a, b) => priorityOf(a) - priorityOf(b))

  const head = list[0]
  if (list.length === 1) return { title: head.title, body: head.body, tag: head.key, url: head.url }
  const groups = new Set(list.map((e) => e.group).filter(Boolean))
  const verb = groups.size === 1 ? [...groups][0] : ''
  const parts = list.map((e) => e.short || e.body)
  const shown = parts.slice(0, BODY_CAP)
  const more = parts.length - shown.length
  return {
    title: `${head.brand || 'DASH'} \u00b7 ${list.length} ${verb || 'of your guys'}`,
    body: shown.join(' \u00b7 ') + (more > 0 ? ` \u00b7 +${more} more` : ''),
    tag: `bundle:${head.key}`,
    url: head.url,
  }
}

// ── HOW FAST AN EVENT CAN REACH YOU ────────────────────────────────────────
//
// Donovan: "make the notis a little faster, specifically for the event-based
// ones like HRs, XBH."
//
// The data was never the problem. lib/liveSlate.js pulls statsapi.mlb.com
// directly -- the schedule with a hydrated linescore, then a live boxscore per
// started game -- and this route already calls it with force:true, so the
// batting line it reads is seconds old. The whole delay is the CRON, and the
// cron is already as fast as Vercel goes: once a minute is the floor on Pro.
//
// So the invocation does the waiting instead of the scheduler. One run sweeps
// three times, eighteen seconds apart, inside the sixty seconds it is already
// allowed (maxDuration above). Worst case for a home run goes from about sixty
// seconds to about twenty.
//
// WHY THIS IS SAFE TO REPEAT. The dedupe claim is an atomic upsert into
// dash_push_seen, so a sweep that finds nothing new sends nothing -- and that
// is already true of two cron runs overlapping, which is exactly what this is.
// Nothing here needs a lock it did not already need.
//
// WHAT IT COSTS, AND WHAT KEEPS THAT HONEST. Each extra sweep is one schedule
// call plus one boxscore per live game. Fifteen live games is sixteen requests,
// three times a minute -- under a request a second, against an API that serves
// the league. It is gated so a night with nothing on pays none of it: no live
// game, or nobody following anybody, and the run returns after one sweep the
// way it always did. The elapsed-time guard is the other half: a slow MLB
// response must never push this past maxDuration and get the function killed
// halfway through sending.
const SWEEP_GAP_MS = 18000
const MAX_SWEEPS = 3
// Everything must be finished by here. maxDuration is 60s and being killed
// mid-send is the one outcome worth engineering against, so five seconds of
// the sixty are simply not spent.
const SWEEP_DEADLINE_MS = 55000

// THE DEADLINE IS CHECKED AGAINST A MEASUREMENT, NOT A GUESS.
//
// Two wrong versions of this got written before the right one, and both read
// perfectly well:
//
//   "stop if we are past most of the budget" -- checked BEFORE an eighteen
//   second sleep and the sweep after it, so a first pass that hung on a slow
//   MLB response passed the check at forty seconds and was killed mid-send at
//   sixty-three. A deadline has to account for what comes AFTER it.
//
//   "stop unless elapsed + gap + TEN SECONDS still fits" -- better, and still
//   wrong, because the ten seconds was invented. Simulated at a twenty-nine
//   second sweep it cleared the guard at twenty-nine and finished at
//   seventy-six.
//
// So the loop times its own last sweep and projects with that. A slow night
// makes the projection pessimistic and the run gives up early, which is the
// direction a guess should fail in.

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/**
 * Is there anything actually happening that a faster sweep would catch?
 *
 * Uses the in-process cache rather than force -- the sweep that just ran
 * pulled this, and asking the league again to answer "was anything live fifty
 * milliseconds ago" would be the sort of request this file exists to avoid.
 */
async function worthSweepingAgain(audience) {
  if (audience?.mlb?.size) {
    const snap = await fetchLiveSlate().catch(() => null)
    if (snap?.games?.some((g) => g?.state === 'Live')) return true
  }
  if (audience?.nfl?.size) {
    const snap = await fetchNflLive().catch(() => null)
    if (snap?.games?.some((g) => g?.state === 'in')) return true
  }
  return false
}

export async function GET(request) {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (await isMaintenanceMode()) return Response.json({ skipped: 'maintenance_mode' })
  const vapidBad = vapidProblem()
  if (vapidBad) {
    // Named, and at error level, so it shows up in the log filter rather than
    // hiding inside a 200 that says "skipped".
    console.error('[push] tick cannot send: ' + vapidBad)
    return Response.json({ skipped: 'vapid-not-configured', problem: vapidBad })
  }
  const db = service()
  if (!db) return Response.json({ skipped: 'supabase-service-key-missing' })

  const { data: subs } = await db.from('dash_push_subscriptions').select('endpoint,user_id,p256dh,auth')
  if (!subs?.length) return Response.json({ sent: 0, reason: 'no-subscriptions' })

  // WHO IS LISTENING, BEFORE WHAT HAPPENED.
  //
  // The settings used to be loaded after the events, which was fine when two
  // categories existed. It is not fine now: a fifteen-game slate with lineups,
  // first pitches, on-deck spots and six in-game bars per hitter manufactures
  // several hundred events a minute, every one of which is then written to the
  // dedupe table and thrown away because nobody follows the man. Loading the
  // follow lists first turns that into "produce nothing for players no
  // subscriber has ever named", which is most of the league.
  const userIds = [...new Set(subs.map((s) => s.user_id))]
  const { data: stateRows } = await db
    .from('dash_user_state')
    .select('user_id,key,value')
    .in('user_id', userIds)
    .in('key', ['dash_alerts_v1', 'dash_follow_v1'])

  const stateByUser = {}
  for (const row of stateRows || []) {
    stateByUser[row.user_id] = { ...(stateByUser[row.user_id] || {}), [row.key]: row.value }
  }
  const audience = audienceFrom(stateByUser)

  // Called once per run and able to throw on a malformed key or subject.
  // Unguarded this took the whole tick down as a 500 the moment anything was
  // actually worth sending -- which is to say, on the one night it mattered.
  try {
    const v = vapidDetails()
    webpush.setVapidDetails(v.subject, v.publicKey, v.privateKey)
  } catch (err) {
    console.error('[push] setVapidDetails refused the keys: ' + String(err?.message || err))
    return Response.json({ sent: 0, reason: 'vapid-rejected' })
  }

  const totals = { sent: 0, held: 0, events: 0, fresh: 0, sweeps: 0, discord: 0 }
  const dead = []
  const startedAt = Date.now()
  let lastSweepMs = 0

  // FIRST SWEEP DOES EVERYTHING. The later ones do the live half only: the
  // pregame board, the franchise tables and the lineup gap all describe things
  // that change on the hour, and re-reading them twice more a minute would buy
  // nothing and cost a board fetch and four queries each time.
  for (let n = 0; n < MAX_SWEEPS; n += 1) {
    if (n > 0) {
      // The wait AND the sweep after it both have to fit, and the best
      // estimate of the next sweep is how long the last one actually took.
      if (Date.now() - startedAt + SWEEP_GAP_MS + lastSweepMs > SWEEP_DEADLINE_MS) break
      if (!(await worthSweepingAgain(audience))) break
      await sleep(SWEEP_GAP_MS)
    }
    totals.sweeps += 1
    const sweepStart = Date.now()
    const r = await sweep(db, subs, stateByUser, audience, { full: n === 0 })
    lastSweepMs = Date.now() - sweepStart
    totals.sent += r.sent
    totals.held += r.held
    totals.events += r.events
    totals.fresh += r.fresh
    totals.discord += r.discord
    for (const e of r.dead) if (!dead.includes(e)) dead.push(e)
  }

  if (dead.length) await db.from('dash_push_subscriptions').delete().in('endpoint', dead)
  await db.rpc('dash_push_seen_prune')
  return Response.json({ ...totals, dropped: dead.length })
}

/** One pass: what happened, who has not been told, tell them. */
async function sweep(db, subs, stateByUser, audience, { full }) {
  const nothing = { sent: 0, held: 0, events: 0, fresh: 0, dead: [], discord: 0 }
  const redZoneEnabled = await isRedZoneAlertsEnabled()
  const events = [
    ...(await mlbEvents(audience)),
    ...(await nflEvents(audience)),
    ...(full ? await pregameEvents(db, audience) : []),
    // FRANCHISE needs no audience: these are addressed to the owner of a team,
    // not to whoever follows a player. It also runs on every tick rather than
    // behind a window claim -- a draft clock is ninety seconds long, and there
    // is no version of "you are on the clock" that is worth sending late.
    ...(full ? await franchiseEventsFrom(db) : []),
    // Same shape, same owner gate, its own producer because it reads a
    // completely different set of tables and must not be able to take the
    // draft clock down with it.
    ...(full ? await lineupGapEventsFrom(db) : []),
    // Its own producer for the same reason: it reads the whole week's game
    // list and the team on every rostered player, and must not be able to
    // take the empty-slot alert down with it.
    ...(full ? await byeStarterEventsFrom(db) : []),
  ].filter((e) => redZoneEnabled || e.category !== 'nflred')
  if (!events.length) return nothing

  // Insert-and-see-what-stuck: only rows this run actually created are new.
  // Doing it as one insert with ignoreDuplicates makes the check atomic — two
  // overlapping cron runs cannot both decide the same home run is theirs.
  const { data: claimed } = await db
    .from('dash_push_seen')
    .upsert(events.map((e) => ({ event_key: e.key })), { onConflict: 'event_key', ignoreDuplicates: true })
    .select('event_key')

  const fresh = new Set((claimed || []).map((r) => r.event_key))
  const toSend = events.filter((e) => fresh.has(e.key))
  if (!toSend.length) return { ...nothing, events: events.length }

  // Fired alongside the push loop below, not after it -- a slow Discord
  // webhook must never eat into the 55s sweep budget the push send needs.
  // toSend is already the globally-fresh set for this tick (the claim above
  // is what makes that true), so this is naturally exactly-once per event,
  // the same guarantee the homer feed's own Discord post relies on.
  const discordSend = fanOutToDiscord(toSend)

  let sent = 0
  let held = 0
  const dead = []
  await Promise.all(subs.map(async (sub) => {
    const state = stateByUser[sub.user_id]
    // An owned event goes to its owner's devices and to nobody else's. This
    // is the gate that makes "you are on the clock" mean YOU: it is checked
    // here, against this subscription's user, rather than inside wants(),
    // which only ever sees settings and never sees whose they are.
    const mine = toSend
      .filter((e) => !e.owner || e.owner === sub.user_id)
      .filter((e) => wants(state, e))
      .sort((a, b) => priorityOf(a) - priorityOf(b))
    if (!mine.length) return

    const urgent = mine.filter((e) => priorityOf(e) === 0)
    const quiet = mine.filter((e) => priorityOf(e) !== 0)

    const notes = []
    if (urgent.length) notes.push(bundle(urgent))
    if (quiet.length) {
      if (await claimQuietSlot(db, sub.endpoint)) notes.push(bundle(quiet))
      else held += quiet.length
    }

    for (const note of notes) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(note),
        )
        sent += 1
      } catch (err) {
        if (err?.statusCode === 404 || err?.statusCode === 410) dead.push(sub.endpoint)
        break
      }
    }
  }))

  const discord = await discordSend
  return { sent, held, events: events.length, fresh: toSend.length, dead, discord: discord.sent }
}
