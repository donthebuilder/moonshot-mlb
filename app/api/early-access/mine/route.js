// GET /api/early-access/mine -> { features: [key] } -- the gated features THIS signed-in account holds an active early-access grant for (and that are not yet
// public). Their own keys only: never another user's data, never an email, never an invite. Signed out / no grants / tables not created yet -> { features: [] }.
import { hasSupabaseConfig } from '../../../../lib/supabase/config'
import { createSupabaseServerClient } from '../../../../lib/supabase/server'
import { adminClient } from '../../../../lib/supabase/admin'
import { ownFeatures } from '../../../../lib/earlyAccess/access'

export const dynamic = 'force-dynamic'
const HEADERS = { 'Cache-Control': 'private, no-store' }

export async function GET() {
  try {
    if (!hasSupabaseConfig()) return Response.json({ features: [] }, { headers: HEADERS })
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return Response.json({ features: [] }, { headers: HEADERS })
    return Response.json({ features: await ownFeatures(adminClient(), user.id) }, { headers: HEADERS })
  } catch {
    return Response.json({ features: [] }, { headers: HEADERS })
  }
}
