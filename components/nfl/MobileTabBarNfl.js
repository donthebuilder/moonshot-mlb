'use client'
import MobileTabBar from '../MobileTabBar'
import { NFL_NAV, NFL_MORE_GROUPS } from '../../lib/routes'

// C3's NFL half: "if it feels right, NFL copies it" (dash-network-master-
// plan-2026-08-28.md). MOONSHOT's mobile bar shape is 4 essential destinations
// + a "More" catch-all, and this is NFL's four.
//
// ── 2026-09-03: ONE TABLE, AND THE TWO BARS AGREE ──────────────────────────
//
// This file used to spell its own labels out, NflHeader.js spelled them out
// differently, and lib/routes.js had a third set -- `home` was "Tonight" here,
// "Home" there and "This week" in the table. Worse, "Tonight" was borrowed
// from a baseball product: football's unit is a week.
//
// The four are now the same four the desktop rail carries. They used to
// differ: Research was primary on desktop and buried in this sheet, because
// this bar dropped it to keep a 4+More shape while the rail kept five. The
// fifth slot is not needed any more -- This week left both bars and lives on
// the TUDDY wordmark in the header, the same move MOONSHOT made.
//
// Icons come from NFL_NAV, which reuses MOONSHOT's glyph vocabulary 1:1
// (◎ home, ▥ boards, ◉ games/live, ✦ picks) on purpose -- same glyph, same
// meaning, cross-sport, one design language rather than two.
const MAIN_KEYS = ['boards', 'games', 'picks', 'research']
const MAIN = MAIN_KEYS.map((k) => [k, NFL_NAV[k].icon, NFL_NAV[k].label])

// Grouped, like MOONSHOT's. A group heading is an entry whose key starts '@'.
// This week leads even though it is not on the bar: the sheet calls itself
// "everything on this site", and the front page is part of everything.
const MORE = [
  ['@This week', ''],
  ['home', NFL_NAV.home.label, NFL_NAV.home.blurb],
  ...NFL_MORE_GROUPS.flatMap(([group, keys]) => [
    [`@${group}`, ''],
    ...keys.map((k) => [k, NFL_NAV[k].label, NFL_NAV[k].blurb]),
  ]),
]

export default function MobileTabBarNfl({ tab, setTab }) {
  return <MobileTabBar tab={tab} setTab={setTab} main={MAIN} more={MORE} brand="TUDDY" />
}
