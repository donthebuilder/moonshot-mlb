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
import { timingSafeEqual } from 'node:crypto'

import { fetchLiveSlate } from '../../../../../lib/liveSlate'
import { fetchNflLive } from '../../../../../lib/nfl/liveSlate'
import { hasVapid, vapidDetails } from '../../../../../lib/dash/vapid'
import { mlbEventsFrom, nflEventsFrom, wants } from '../../../../../lib/dash/pushRules'

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

const today = () => new Date().toLocaleDateString('en-CA')

async function mlbEvents() {
  const snap = await fetchLiveSlate({ force: true }).catch(() => null)
  return mlbEventsFrom(snap, today())
}

async function nflEvents() {
  const snap = await fetchNflLive({ force: true }).catch(() => null)
  return nflEventsFrom(snap, today())
}

export async function GET(request) {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  if (!hasVapid()) return Response.json({ skipped: 'vapid-not-configured' })
  const db = service()
  if (!db) return Response.json({ skipped: 'supabase-service-key-missing' })

  const { data: subs } = await db.from('dash_push_subscriptions').select('endpoint,user_id,p256dh,auth')
  if (!subs?.length) return Response.json({ sent: 0, reason: 'no-subscriptions' })

  const events = [...(await mlbEvents()), ...(await nflEvents())]
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

  webpush.setVapidDetails(vapidDetails().subject, vapidDetails().publicKey, vapidDetails().privateKey)

  let sent = 0
  const dead = []
  await Promise.all(subs.map(async (sub) => {
    const state = stateByUser[sub.user_id]
    const mine = toSend.filter((e) => wants(state, e))
    // Three at most per run per device. A six-homer inning should be a nudge,
    // not a takeover of somebody's lock screen.
    for (const event of mine.slice(0, 3)) {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify({ title: event.title, body: event.body, tag: event.key, url: event.url }),
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

  return Response.json({ sent, events: events.length, fresh: toSend.length, dropped: dead.length })
}
