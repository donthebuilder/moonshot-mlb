// WHO IS LOOKING, ON THE SERVER (2026-10-17, "fix all the other pages the same way"). SERVER-ONLY: reads the request's cookies, so a page or route that calls it is
// dynamic. The same check the front page makes (lib/members/access.js isMember on the Auth server's own user), FAILING CLOSED: no Supabase here, no session, an
// unconfirmed address or any error is "not a member", so a hidden pick is never printed by mistake.
import { createSupabaseServerClient } from '../supabase/server'
import { hasSupabaseConfig } from '../supabase/config'
import { isMember } from './access'

export async function viewerIsMember() {
  try {
    if (!hasSupabaseConfig()) return false
    const supabase = await createSupabaseServerClient()
    if (!supabase) return false
    const { data } = await supabase.auth.getUser()
    return await isMember(data?.user)
  } catch { return false }
}
