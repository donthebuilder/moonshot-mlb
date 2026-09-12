import { createSupabaseServerClient } from '../../../../lib/supabase/server'
import LeagueMobileNav from './LeagueMobileNav'

// The phone bar needs to know whether to list Commissioner in its More sheet.
// The desktop rail has always gated that link on the same fact; the phone bar
// used to show all nine stops to everyone, so a member could tap through to a
// control room that is not theirs and be refused there instead of here.
// One cheap read, and a failure just means the link is not offered.
//
// READS commissioner_id, NOT membership.role (2026-09-12, OPEN-ITEMS #2).
// role was a second, one-time snapshot of the same fact -- set once when a
// membership row is created, never updated again anywhere in this codebase.
// fantasy_leagues.commissioner_id is the one place every RPC actually checks
// (see e.g. 202608250002's "Commissioner access required"), so it is the
// only value that can never disagree with itself. Every commissioner check
// across the room now reads this one column instead of nine copies of a
// column that could only ever drift further from it.
export default async function LeagueLayout({ children, params }) {
  const { leagueId } = await params
  let isCommissioner = false
  try {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      const { data } = await supabase.from('fantasy_leagues')
        .select('commissioner_id').eq('id', leagueId).maybeSingle()
      isCommissioner = data?.commissioner_id === user.id
    }
  } catch { isCommissioner = false }
  return <>{children}<LeagueMobileNav leagueId={leagueId} isCommissioner={isCommissioner} /></>
}
