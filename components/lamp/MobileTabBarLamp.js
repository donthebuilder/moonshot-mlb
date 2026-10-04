'use client'
import { BAR_KEYS } from '../../lib/routes'
import MobileTabBar from '../MobileTabBar'
import { C } from '../../lib/nhl/theme'
import { NHL_NAV, NHL_MORE_GROUPS } from '../../lib/nhl/routes'

// LAMP's phone bar: the shared MobileTabBar with hockey's words, read from
// the one table in lib/nhl/routes.js — same shape as MobileTabBarNfl.js.
// The wordmark is home, as on the other two bars.
// Four stops plus More, the same count MOONSHOT's bar carries (2026-09-25:
// Players joined once the directory existed).
// Board · Scores · Schedule · Standings, the board first (batch 3); Players
// moved to the sheet, the same slot it holds on MOONSHOT's bar.
// Props · Boards · Live · Slate, the words MOONSHOT's and TUDDY's bars use (2026-10-02;
// Shots is the board's SHOTS chip, and still in More)
// One bar everywhere (2026-10-04, Donovan): Tonight · Props · Rankings · Live.
const MAIN_KEYS = BAR_KEYS.nhl   // lib/routes.js, the one list
const MAIN = MAIN_KEYS.map((k) => [k, NHL_NAV[k].icon, NHL_NAV[k].label])

const MORE = [
  // Tonight is on the bar (2026-10-04); More starts with the groups.
  ...NHL_MORE_GROUPS.flatMap(([group, keys]) => [
    [`@${group}`, ''],
    ...keys.map((k) => [k, NHL_NAV[k].label, NHL_NAV[k].blurb]),
  ]),
]

export default function MobileTabBarLamp({ tab, setTab }) {
  return <MobileTabBar tab={tab} setTab={setTab} main={MAIN} more={MORE} brand="LAMP" accent={C.ice} />
}
