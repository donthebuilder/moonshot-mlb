// GET /api/dash/push/log  →  { rows: [...] }  the signed-in user's recent alerts
//
// What actually reached this account's devices, and what did not. Read off
// dash_push_log, which the push cron writes one row per event per device with
// the outcome: sent alone, sent inside a bundle, dropped for losing its lane,
// or failed at the push service (2026-09-14, notification audit -- "a user who
// turned on multihit and never sees one has no way to know it lost the slot
// forty times").
//
// The table is service-role only (RLS on, no policies), so this reads it with
// the service key and filters by the SIGNED-IN user's id -- the auth check is
// the whole route. No user, no rows. Missing table (migration not run) is an
// empty list, not an error: the panel says "nothing yet" and moves on.

import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import { hasSupabaseConfig } from '../../../../../lib/supabase/config'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const LIMIT = 60

const service = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function GET() {
  if (!hasSupabaseConfig()) return Response.json({ rows: [], reason: 'not-configured' })
  const supabase = await createSupabaseServerClient()
  const { data: auth } = supabase ? await supabase.auth.getUser() : { data: null }
  const user = auth?.user
  if (!user) return Response.json({ rows: [], reason: 'signed-out' }, { status: 401 })

  const db = service()
  if (!db) return Response.json({ rows: [], reason: 'service-key-missing' })

  const { data, error } = await db
    .from('dash_push_log')
    .select('event_key,category,sport,priority,lane,title,body,outcome,at,endpoint_hash')
    .eq('user_id', user.id)
    .order('at', { ascending: false })
    .limit(LIMIT)
  if (error) {
    // 42P01 is "relation does not exist" -- the migration has not run yet.
    if (error.code !== '42P01') console.error(`[push/log] read failed: ${error.message}`)
    return Response.json({ rows: [], reason: error.code === '42P01' ? 'no-table' : 'read-failed' })
  }
  return Response.json({ rows: data || [] }, { headers: { 'Cache-Control': 'private, no-store' } })
}
