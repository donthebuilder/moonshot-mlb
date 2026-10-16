// /start RETIRED (2026-10-16, Donovan: "that's too many clicks... delete some of them pages and just get to the site").
// It was the explainer between an X click and the app. Anything that still points here lands on the sport's board, which reads free signed out.
import { redirect } from 'next/navigation'
import { BRAND, appHref, isHiddenSport } from '../../lib/routes'

export const dynamic = 'force-dynamic'

export default async function Start({ searchParams }) {
  const p = (await searchParams) || {}
  const sport = String(Array.isArray(p.sport) ? p.sport[0] : p.sport || '').toLowerCase()
  redirect(appHref(BRAND[sport] && !isHiddenSport(sport) ? sport : 'mlb'))
}
