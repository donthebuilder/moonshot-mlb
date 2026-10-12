// /api/admin/me: "is this browser's session the admin?" (2026-10-12, the admin hub). Answers { admin: boolean } and nothing else: no email, no id, no
// name. The answer comes from the SAME gate as /admin (lib/admin.js isAdminUser on the full auth user: allow-listed email AND confirmed), judged on the
// server from the session cookie; the client never guesses. Signed out, not listed, unconfirmed, no Supabase config, or any error -> { admin: false }.
// Read-only, never cached (private, no-store). The site's admin entry points (header menu, More drawer, search commands) draw only when this says true.
import { hasSupabaseConfig } from '../../../../lib/supabase/config'
import { createSupabaseServerClient } from '../../../../lib/supabase/server'
import { adminSurface } from '../../../../lib/adminHub.js'

export const dynamic = 'force-dynamic'
const HEADERS = { 'Cache-Control': 'private, no-store', 'X-Robots-Tag': 'noindex' }

export async function GET() {
  try {
    if (!hasSupabaseConfig()) return Response.json({ admin: false }, { headers: HEADERS })
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    return Response.json(adminSurface(user), { headers: HEADERS })
  } catch {
    return Response.json({ admin: false }, { headers: HEADERS })
  }
}
