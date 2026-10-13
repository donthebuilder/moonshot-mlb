// /api/admin/early-access: THE EARLY-ACCESS CARD IN THE ADMIN HUB (2026-10-12). Admin only: a signed-in account whose email is in ADMIN_EMAILS AND confirmed
// (lib/admin.js isAdminUser); anyone else gets a 404, so nobody learns it exists. Writes are same-origin JSON only (CSRF). Never cached.
//   GET                                        the features, the invites (code last 4 only; who redeemed, masked), the grant holders (masked), the counts
//   POST { action:'create_invite', feature, uses:1|5|25, expires:'24h'|'7d'|'30d'|'never', note }   the link, shown ONCE (the table keeps a hash)
//   POST { action:'revoke_invite', id }        POST { action:'revoke_grant', id }
// Until supabase/migrations/202610121500_early_access.sql is run: GET says { installed:false }, a write answers 409 { needs_sql } and stores nothing.
import { hasSupabaseConfig } from '../../../../lib/supabase/config'
import { createSupabaseServerClient } from '../../../../lib/supabase/server'
import { adminClient } from '../../../../lib/supabase/admin'
import { isAdminUser, adminDenyReason, sameOriginJson } from '../../../../lib/admin'
import { overview, act } from '../../../../lib/earlyAccess/admin'

export const dynamic = 'force-dynamic'
const HEADERS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }
const no = () => Response.json({ error: 'not found' }, { status: 404, headers: HEADERS })

async function admin() {
  if (!hasSupabaseConfig()) return null
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (user && isAdminUser(user)) return user
  console.warn(`[admin/early-access api] 404: ${adminDenyReason(user)}`)   // the reason code only (never an email), for the server log
  return null
}

function originOf(request) {
  const env = String(process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/+$/, '')
  if (/^https?:\/\//.test(env)) return env
  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || ''
  const proto = request.headers.get('x-forwarded-proto') || (host.startsWith('localhost') ? 'http' : 'https')
  return host ? `${proto}://${host}` : ''
}

export async function GET() {
  if (!(await admin())) return no()
  const r = await overview(adminClient())
  return Response.json(r.json, { status: r.status, headers: HEADERS })
}

export async function POST(request) {
  const user = await admin()
  if (!user) return no()
  if (!sameOriginJson(request)) return Response.json({ error: 'bad request' }, { status: 400, headers: HEADERS })
  let body = null
  try { body = await request.json() } catch { body = null }
  if (!body || typeof body !== 'object') return Response.json({ error: 'bad request' }, { status: 400, headers: HEADERS })
  const r = await act(adminClient(), body, { origin: originOf(request), by: user.id })
  return Response.json(r.json, { status: r.status, headers: HEADERS })
}
