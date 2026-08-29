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

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import { hasSupabaseConfig } from '../../../../../lib/supabase/config'
import { hasVapid } from '../../../../../lib/dash/vapid'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function user() {
  if (!hasSupabaseConfig()) return { supabase: null, user: null }
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { supabase: null, user: null }
  const { data } = await supabase.auth.getUser()
  return { supabase, user: data?.user || null }
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

  const { error } = await supabase.from('dash_push_subscriptions').upsert({
    endpoint,
    user_id: me.id,
    p256dh,
    auth,
    user_agent: String(body?.userAgent || '').slice(0, 300) || null,
    failures: 0,
  }, { onConflict: 'endpoint' })

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json({ ok: true })
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
