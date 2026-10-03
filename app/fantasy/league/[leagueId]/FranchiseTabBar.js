'use client'

import { usePathname, useSearchParams } from 'next/navigation'

import MobileTabBar from '../../../../components/MobileTabBar'
import { FRANCHISE_BAR, FRANCHISE_MORE, FRANCHISE_NAV, franchiseHref, franchiseKeyOf } from '../../../../lib/fantasy/nav'
import { ACCENT } from '../../../../lib/fantasy/theme'

// FRANCHISE'S PHONE BAR, ON MOONSHOT'S (2026-10-03, COMPONENT-REUSE R10 step 2).
// It was its own copy (LeagueMobileNav.js): the same four-stops-and-More
// shape, but a bottom card instead of the side drawer, no Escape or swipe
// to close, no hide-on-scroll, a 32px close button -- and Players and Draft
// never lit up, because their links carry a query string and it compared the
// pathname exactly. Now it is components/MobileTabBar.js in link mode, the
// same component the four sports use, fed lib/fantasy/nav.js (the desktop
// rail's table, so the two navs still can't drift). Phone only: the room
// has its own desktop rail. No network row: the room header carries the
// switch. Gold is the accent; the active words read --fx-gold so light mode
// keeps its darkened, 4.5:1 gold.

export default function FranchiseTabBar({ leagueId, isCommissioner }) {
  const pathname = usePathname()
  const search = useSearchParams()
  const tab = franchiseKeyOf(leagueId, pathname, search?.toString())
  const main = FRANCHISE_BAR.map((k) => [k, FRANCHISE_NAV[k].icon, FRANCHISE_NAV[k].label])
  const more = [...FRANCHISE_MORE, ...(isCommissioner ? ['settings'] : [])].map((k) => [k, FRANCHISE_NAV[k].label, FRANCHISE_NAV[k].blurb])
  return (
    <MobileTabBar
      tab={tab}
      main={main}
      more={more}
      brand="FRANCHISE"
      accent={ACCENT}
      accentText="var(--fx-gold)"
      hrefOf={(k) => franchiseHref(leagueId, k)}
      network={false}
      desktop={false}
      title="Everything in this league"
      lede="Every page in this league and what each one is for."
    />
  )
}
