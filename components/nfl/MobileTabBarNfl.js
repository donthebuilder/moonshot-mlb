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
// Icons come from NFL_NAV, which reuses MOONSHOT's glyph vocabulary 1:1
// (🌙 home, 📊 boards, 🏈 games, 📡 live, 🎯 picks -- colour emoji since 2026-09-06; the old
// ◎ ▥ ◉ ✦ text glyphs vanished on the bar next to real emoji) -- same glyph, same
// meaning, cross-sport, one design language rather than two.
// 2026-09-16, Donovan: "trim something that doesn't match the moonshot
// nav style" -- Picks came off this bar then, and stays off: MOONSHOT's own
// phone bar doesn't carry Picks either. Both bars now carry the identical
// four (2026-09-18).
// The same four stops MOONSHOT's phone bar carries, in its order, under its
// words (2026-09-18, see lib/routes.js's NFL_NAV note): Props · Boards · Live
// · Slate, with Picks one tap into the sheet exactly as MOONSHOT keeps its
// own. Live is here every day now, so the game-day swap this file used to do
// is gone -- the bar never changes shape mid-day on either product.
const MAIN_KEYS = ['touchdowns', 'boards', 'live', 'games']
const mainFor = (keys) => keys.map((k) => [k, NFL_NAV[k].icon, NFL_NAV[k].label])
const MAIN = mainFor(MAIN_KEYS)

// Grouped, like MOONSHOT's. A group heading is an entry whose key starts '@'.
// This week leads even though it is not on the bar: the sheet calls itself
// "everything on this site", and the front page is part of everything.
//
// Research and Storylines live in the shared NFL_MORE_GROUPS table now
// (2026-09-18) -- neither bar carries them, so neither bar needs its own copy
// of the group.
const MORE = [
  ['@This week', ''],
  ['home', NFL_NAV.home.label, NFL_NAV.home.blurb],
  ['picks', NFL_NAV.picks.label, NFL_NAV.picks.blurb],
  ...NFL_MORE_GROUPS.flatMap(([group, keys]) => [
    [`@${group}`, ''],
    ...keys.map((k) => [k, NFL_NAV[k].label, NFL_NAV[k].blurb]),
  ]),
]

export default function MobileTabBarNfl({ tab, setTab }) {
  return <MobileTabBar tab={tab} setTab={setTab} main={MAIN} more={MORE} brand="TUDDY" />
}
