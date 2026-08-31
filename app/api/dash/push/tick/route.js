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
// CADENCE. Every ten minutes during game windows (see vercel.json). That is
// deliberately not "instant": instant needs a process holding a live socket to
// the league, which this architecture does not have and should not grow for
// this. Ten minutes is the honest promise, and the panel says so.

import webpush from 'web-push'
import { createClient } from '@supabase/supabase-js'
import { createHash, timingSafeEqual } from 'node:crypto'

import { easternToday } from '../../../../../lib/data'
import { fetchLiveSlate } from '../../../../../lib/liveSlate'
import { fetchNflLive } from '../../../../../lib/nfl/liveSlate'
import { hasVapid, vapidDetails } from '../../../../../lib/dash/vapid'
import { audienceFrom, mlbEventsFrom, nflEventsFrom, priorityOf, wants } from '../../../../../lib/dash/pushRules'

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

export async function GET(request) {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasVapid()) return Response.json({ skipped: 'vapid-not-configured' })
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

  const events = [...(await mlbEvents(audience)), ...(await nflEvents(audience))]
  if (!events.length) return Response.json({ sent: 0, reason: 'nothing-happening' })

  // Insert-and-see-what-stuck: only rows this run actually created are new.
  // Doing it as one insert with ignoreDuplicates makes the check atomic — two
  // overlapping cron runs cannot both decide the same home run is theirs.
  const { data: claimed } = await db
    .from('dash_push_seen')
    .upsert(events.map((e) => ({ event_key: e.key })), { onConflict: 'event_key', ignoreDuplicates: true })
    .select('event_key')

  const fresh = new Set((claimed || []).map((r) => r.event_key))
  const toSend = events.filter((e) => fresh.has(e.key))
  if (!toSend.length) return Response.json({ sent: 0, seen: events.length, reason: 'all-already-sent' })

  webpush.setVapidDetails(vapidDetails().subject, vapidDetails().publicKey, vapidDetails().privateKey)

  let sent = 0
  let held = 0
  const dead = []
  await Promise.all(subs.map(async (sub) => {
    const state = stateByUser[sub.user_id]
    const mine = toSend.filter((e) => wants(state, e)).sort((a, b) => priorityOf(a) - priorityOf(b))
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

  if (dead.length) await db.from('dash_push_subscriptions').delete().in('endpoint', dead)
  await db.rpc('dash_push_seen_prune')

  return Response.json({ sent, held, events: events.length, fresh: toSend.length, dropped: dead.length })
}
