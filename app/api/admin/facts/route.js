// /admin's fact-engine controls (BATCH-FACT-ENGINE): the kill switch and
// DELETE (removes a fact post from X). Signed-in admins only (ADMIN_EMAILS).
import { hasSupabaseConfig } from '../../../../lib/supabase/config'
import { createSupabaseServerClient } from '../../../../lib/supabase/server'
import { adminClient } from '../../../../lib/supabase/admin'
import { isAdminEmail } from '../../../../lib/admin'
import { deleteFromX } from '../../../../lib/dash/xPost'

export const dynamic = 'force-dynamic'

export async function POST(request) {
  if (!hasSupabaseConfig()) return Response.json({ error: 'not found' }, { status: 404 })
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) return Response.json({ error: 'not found' }, { status: 404 })
  const db = adminClient()
  const body = await request.json().catch(() => ({}))
  // the switches in dash_flags this route may flip (the write-ups' joined 2026-10-04)
  const FLAGS = { facts: 'facts_autopost', writeups: 'writeups_autopost' }
  if (body.action === 'autopost' && ['on', 'off'].includes(body.value) && FLAGS[body.flag || 'facts']) {
    const r = await db.from('dash_flags').upsert([{ key: FLAGS[body.flag || 'facts'], value: body.value, updated_at: new Date().toISOString(), updated_by: user.email }], { onConflict: 'key' })
    return r.error ? Response.json({ error: r.error.message }, { status: 500 }) : Response.json({ ok: true, value: body.value })
  }
  if (body.action === 'delete' && body.id) {
    const row = await db.from('fact_posts').select('id, x_post_id, status').eq('id', body.id).maybeSingle()
    if (row.error || !row.data) return Response.json({ error: 'no such fact post' }, { status: 404 })
    if (!row.data.x_post_id) return Response.json({ error: 'never reached X' }, { status: 400 })
    const x = await deleteFromX(row.data.x_post_id)
    if (!x.ok) return Response.json({ error: `X: ${x.error || x.status}` }, { status: 502 })
    await db.from('fact_posts').update({ status: 'deleted', deleted_at: new Date().toISOString() }).eq('id', body.id)
    return Response.json({ ok: true })
  }
  return Response.json({ error: 'unknown action' }, { status: 400 })
}
