import { createSupabaseServerClient } from '../../../../lib/supabase/server'
import LeagueMobileNav from './LeagueMobileNav'

// The phone bar needs to know whether to list Commissioner in its More sheet.
// The desktop rail has always gated that link on the same fact; the phone bar
// used to show all nine stops to everyone, so a member could tap through to a
// control room that is not theirs and be refused there instead of here.
// One cheap read, and a failure just means the link is not offered.
export default async function LeagueLayout({ children, params }) {
  const { leagueId } = await params
  let role = null
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase.from('fantasy_league_memberships')
        .select('role').eq('league_id', leagueId).eq('user_id', user.id).maybeSingle()
      role = data?.role ?? null
    }
  } catch { role = null }
  return <>{children}<LeagueMobileNav leagueId={leagueId} role={role} /></>
}
