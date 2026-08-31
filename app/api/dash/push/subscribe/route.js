// Storing (and forgetting) one browser's push subscription.
//
// POST   {subscription} → saved against the signed-in user
// DELETE {endpoint}     → removed
//
// The subscription object comes straight from the browser's PushManager and
// is opaque to us: an endpoint URL at the push service (Google, Mozilla,
// Apple) plus the two keys used to encrypt a payload only that browser can
// read. We never learn who the device is or where it is; we can only hand the
// push service a sealed envelope for that endpoint.
//
// GET answers "is push configured here, and what's the public key" — which
// exists because NEXT_PUBLIC_ variables are inlined at BUILD time, not read at
// runtime. Reading the key straight from process.env in the browser bundle
// means a key added to Vercel after the last deploy silently does nothing
// until someone happens to redeploy, and the symptom is a toggle that isn't
// there with no explanation. Serving it from the server removes that trap
// entirely: set the variable, and the next request sees it.
//
// SIGNED OUT IS A NO, not a crash — but unlike /api/dash/state this one does
// say so, because subscribing is an action a person took and silently doing
// nothing would be a lie. Not configured (no VAPID keys on the deploy) is a
// 503 with a clear reason for the same reason.

import webpush from 'web-push'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import { hasSupabaseConfig } from '../../../../../lib/supabase/config'
import { hasVapid, vapidDetails } from '../../../../../lib/dash/vapid'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function user() {
  if (!hasSupabaseConfig()) return { supabase: null, user: null }
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { supabase: null, user: null }
  const { data } = await supabase.auth.getUser()
  return { supabase, user: data?.user || null }
}

// THE ONE THAT PROVES IT WORKS.
//
// Turning alerts on used to end in silence. Everything had gone right --
// permission granted, service worker registered, subscription stored -- and
// the person had no way to know until a followed player happened to do
// something hours later. If anything HAD gone wrong they would find out at the
// same moment, which is to say: too late to fix it, and indistinguishable from
// nothing happening.
//
// So the first push is sent the moment the subscription is stored. It travels
// the exact path every real alert will travel -- same VAPID keys, same push
// service, same service worker handler -- so arriving is proof of the whole
// round trip, and not arriving points at the step that is actually broken
// rather than at baseball.
//
// ONLY ON A NEW SUBSCRIPTION. The panel re-POSTs whenever it re-registers a
// browser that is already stored; welcoming somebody every time they open the
// site is how a good idea becomes a nuisance.
//
// NEVER FATAL. If the push service is having a bad minute the subscription is
// still saved and the request still succeeds -- the response just says
// welcomed: false. Failing to send a greeting must not cost somebody their
// alerts.
const WELCOME = {
  title: '\u{1F514} Alerts are on',
  body: 'This is what one looks like. Follow a player and you will hear from us when he goes deep.',
  tag: 'dash-welcome',
  url: '/app#sport=mlb&tab=you',
}

async function welcome(sub) {
  try {
    const v = vapidDetails()
    webpush.setVapidDetails(v.subject, v.publicKey, v.privateKey)
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(WELCOME),
    )
    return true
  } catch {
    return false
  }
}

export async function GET() {
  return Response.json({
    configured: hasVapid(),
    publicKey: hasVapid() ? process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY : null,
  })
}

export async function POST(request) {
  if (!hasVapid()) return Response.json({ error: 'Push is not configured on this deploy' }, { status: 503 })
  const { supabase, user: me } = await user()
  if (!me) return Response.json({ error: 'Sign in first — a subscription belongs to an account' }, { status: 401 })

  let body
  try { body = await request.json() } catch { return Response.json({ error: 'Bad JSON' }, { status: 400 }) }

  const sub = body?.subscription
  const endpoint = String(sub?.endpoint || '')
  const p256dh = String(sub?.keys?.p256dh || '')
  const auth = String(sub?.keys?.auth || '')
  if (!endpoint || !p256dh || !auth) return Response.json({ error: 'Incomplete subscription' }, { status: 400 })

  // Was this browser already on file? Asked BEFORE the upsert, because after
  // it the answer is always yes.
  const { data: already } = await supabase
    .from('dash_push_subscriptions')
    .select('endpoint')
    .eq('endpoint', endpoint)
    .maybeSingle()

  const { error } = await supabase.from('dash_push_subscriptions').upsert({
    endpoint,
    user_id: me.id,
    p256dh,
    auth,
    user_agent: String(body?.userAgent || '').slice(0, 300) || null,
    failures: 0,
  }, { onConflict: 'endpoint' })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // `resend` is there so the panel can offer "send me a test" later without a
  // second endpoint, and so this one can be exercised without unsubscribing.
  const first = !already || body?.resend === true
  const welcomed = first ? await welcome({ endpoint, p256dh, auth }) : false
  return Response.json({ ok: true, welcomed })
}

export async function DELETE(request) {
  const { supabase, user: me } = await user()
  if (!me) return Response.json({ ok: true })   // nothing of theirs to remove

  let body = {}
  try { body = await request.json() } catch { /* endpoint may come on the query */ }
  const endpoint = String(body?.endpoint || new URL(request.url).searchParams.get('endpoint') || '')
  if (!endpoint) return Response.json({ error: 'No endpoint' }, { status: 400 })

  const { error } = await supabase.from('dash_push_subscriptions').delete().eq('endpoint', endpoint).eq('user_id', me.id)
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
}
