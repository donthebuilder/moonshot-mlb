'use client'
import MobileTabBar from '../MobileTabBar'
import { useMemo } from 'react'
import { NFL_NAV, NFL_MORE_GROUPS } from '../../lib/routes'
import { worthPolling } from '../../lib/nfl/liveMerge'

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
// nav style." Picks is the one -- MOONSHOT's own bar doesn't carry a
// Picks tab either (demoted to More on 2026-08-30, nav-rename-and-
// grouping doc: "the two navigations were disagreeing about what
// mattered"). Picks stays one tap away in the sheet, same slot as home.
//
// 2026-09-17: Boards is promoted onto the desktop rail (components/nfl/
// NflHeader.js), and this bar follows -- Donovan's own instruction was to
// promote it, not just widen the desktop one. Research trades out to stay
// at four; it was already the one stop the desktop rail carried that this
// bar didn't, so the two bars go on disagreeing about that one stop,
// deliberately, same as they already disagree about Picks. Research isn't
// lost -- it moves into the sheet's own Research group below, unconditionally
// now rather than only on game day (see MORE).
const MAIN_KEYS = ['touchdowns', 'boards', 'games', 'storylines']
// GAME DAY (2026-09-05): while football is on -- or twenty minutes out --
// Live takes a slot on the phone bar. Research is a Tuesday page and Boards
// a pre-game one; the Live page is the one you open with the game on, and
// burying it under More on a Sunday defeats it. This list already excludes
// both Boards and Research, so 2026-09-17's swap above needs no change here.
const GAMEDAY_KEYS = ['touchdowns', 'live', 'games', 'storylines']
const mainFor = (keys) => keys.map((k) => [k, NFL_NAV[k].icon, NFL_NAV[k].label])
const MAIN = mainFor(MAIN_KEYS)

// Grouped, like MOONSHOT's. A group heading is an entry whose key starts '@'.
// This week leads even though it is not on the bar: the sheet calls itself
// "everything on this site", and the front page is part of everything.
//
// Research (2026-09-17) is folded into its own drawer group here, at the
// front of it, rather than left for the shared NFL_MORE_GROUPS table in
// lib/routes.js to carry -- the desktop rail still shows Research on its
// own bar unconditionally, so adding it to that shared table would double-
// list it there for no reason. Only this bar ever drops it, so only this
// bar's own copy of the group gains it.
const MORE = [
  ['@This week', ''],
  ['home', NFL_NAV.home.label, NFL_NAV.home.blurb],
  ['picks', NFL_NAV.picks.label, NFL_NAV.picks.blurb],
  ...NFL_MORE_GROUPS.flatMap(([group, keys]) => {
    const groupKeys = group === 'Research' ? ['research', ...keys] : keys
    return [
      [`@${group}`, ''],
      ...groupKeys.map((k) => [k, NFL_NAV[k].label, NFL_NAV[k].blurb]),
    ]
  }),
]

export default function MobileTabBarNfl({ tab, setTab, data }) {
  const games = data?.games
  const gameday = useMemo(() => worthPolling(games), [games])
  const main = gameday ? mainFor(GAMEDAY_KEYS) : MAIN
  // Research sits in the sheet unconditionally now (see MORE), so the only
  // game-day-specific change left is dropping Live's own drawer entry once
  // it moves to the bar in its place.
  const more = useMemo(() => gameday
    ? MORE.filter(([k]) => k !== 'live' && k !== '@Sunday')
    : MORE, [gameday])
  return <MobileTabBar tab={tab} setTab={setTab} main={main} more={more} brand="TUDDY" />
}
