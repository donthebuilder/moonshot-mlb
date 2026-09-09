// The whole server side of cross-device saving.
//
// GET  /api/dash/state            → every synced key for the signed-in user
// GET  /api/dash/state?key=x      → one key
// PUT  /api/dash/state            → {key, value, updatedAt} upserted with a
//                                   clock guard (see dash_state_put in
//                                   202608280012_dash_user_state.sql)
//
// SIGNED OUT IS NOT AN ERROR. It is the normal state of most of this site —
// MOONSHOT and TUDDY are readable by anyone and always will be — so a request
// with no session answers 200 with {signedIn:false} and an empty bag. The
// client then stays exactly where it already was: localStorage only. Making
// this a 401 would have every page of the network logging failures for the
// majority of its traffic.
//
// NOT CONFIGURED IS NOT AN ERROR EITHER. A deploy without Supabase env vars
// (a preview, a fork, a local checkout) answers the same shape with
// configured:false. Nothing on the site branches on it except the copy that
// explains why saving is off.

import { createSupabaseServerClient } from '../../../../lib/supabase/server'
import { hasSupabaseConfig } from '../../../../lib/supabase/config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const OFFLINE = { signedIn: false, configured: false, state: {} }
const SIGNED_OUT = { signedIn: false, configured: true, state: {} }

// One blob is a watchlist or a picks list, not a database. 128KB is already
// far past anything the client can produce; the table has its own 256KB check
// underneath this one.
const MAX_VALUE_BYTES = 128 * 1024

async function session() {
  if (!hasSupabaseConfig()) return { supabase: null, user: null, configured: false }
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { supabase: null, user: null, configured: false }
  const { data } = await supabase.auth.getUser()
  return { supabase, user: data?.user || null, configured: true }
}

export async function GET(request) {
  const { supabase, user, configured } = await session()
  if (!configured) return Response.json(OFFLINE)
  if (!user) return Response.json(SIGNED_OUT)

  const key = new URL(request.url).searchParams.get('key')
  let query = supabase.from('dash_user_state').select('key,value,updated_at').eq('user_id', user.id)
  if (key) query = query.eq('key', key)
  const { data, error } = await query

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const state = {}
  for (const row of data || []) state[row.key] = { value: row.value, updatedAt: row.updated_at }

  // WHO YOU ARE (2026-09-06). The header's account pill used to be a static
  // "Sign up" whether or not you had -- Donovan: "once signed up make it
  // like your account name or something of the sorts." The same fetch the
  // sync layer already makes on every load now carries the display name, so
  // the pill needs no second request and no client-side Supabase.
  let name = user.user_metadata?.display_name || ''
  try {
    const { data: profile } = await supabase.from('profiles').select('display_name').eq('id', user.id).maybeSingle()
    if (profile?.display_name) name = profile.display_name
  } catch { /* the pill falls back to the email prefix */ }
  const who = { name, email: user.email || '' }
  return Response.json({ signedIn: true, configured: true, state, who })
}

export async function PUT(request) {
  const { supabase, user, configured } = await session()
  if (!configured) return Response.json(OFFLINE)
  if (!user) return Response.json(SIGNED_OUT)

  let body
  try { body = await request.json() } catch { return Response.json({ error: 'Bad JSON' }, { status: 400 }) }

  const key = String(body?.key || '').trim()
  if (!key || key.length > 64) return Response.json({ error: 'Bad key' }, { status: 400 })
  if (body?.value === undefined || body?.value === null) return Response.json({ error: 'Bad value' }, { status: 400 })

  const size = Buffer.byteLength(JSON.stringify(body.value))
  if (size > MAX_VALUE_BYTES) return Response.json({ error: 'Too large', bytes: size }, { status: 413 })

  const updatedAt = new Date(body?.updatedAt || Date.now())
  const stamp = Number.isFinite(updatedAt.valueOf()) ? updatedAt.toISOString() : new Date().toISOString()

  const { data, error } = await supabase.rpc('dash_state_put', {
    p_key: key,
    p_value: body.value,
    p_updated_at: stamp,
  })

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // The row that actually ended up stored — which may be someone else's newer
  // write, not this one. The client compares and takes the winner.
  const stored = Array.isArray(data) ? data[0] : data
  return Response.json({
    signedIn: true,
    configured: true,
    key,
    value: stored?.value ?? body.value,
    updatedAt: stored?.updated_at || stamp,
  })
}
