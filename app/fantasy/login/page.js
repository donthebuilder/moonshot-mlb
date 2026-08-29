// /fantasy/login — the URL people guess when Franchise asks them to sign in.
// It 404'd until 2026-08-29 (the review found the bare default Next 404 with
// no way home). It is an alias, not a second login: the canonical page is
// /login, told to come back to Franchise afterwards.

import { redirect } from 'next/navigation'

export default function FantasyLoginRedirect() {
  redirect('/login?next=/fantasy')
}
