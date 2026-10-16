// /c -- RETIRED AS A STEP (2026-10-16, Donovan: "that's too many clicks... just get to the site"). It was the card landing between an X post and
// the app (post -> /c -> sign up -> app). Posts now link straight to the board, which reads free signed out and carries "Sign up · free" in its
// header. Links already out in the wild still work: /c sends the person to the same place the landing's sign-up would have, with no page between.
import { redirect } from 'next/navigation'
import { BRAND, appHref, playerHref, isHiddenSport } from '../../lib/routes'

export const dynamic = 'force-dynamic'

const one = (v) => String(Array.isArray(v) ? v[0] : v || '').slice(0, 120)

export default async function CardLanding({ searchParams }) {
  const params = (await searchParams) || {}
  const sport = one(params.sport).toLowerCase()
  const known = BRAND[sport] && !isHiddenSport(sport)
  const kind = one(params.kind)
  const id = one(params.id)
  // a pick or a starter opens his page, everything else the sport's board
  redirect(known && (kind === 'pick' || kind === 'pitcher') && id ? playerHref(sport, id) : appHref(known ? sport : 'mlb'))
}
