'use client'
import { useMemo } from 'react'
import { C, NUM_FONT } from '../../lib/nfl/theme'
import HeadlineStrip from '../HeadlineStrip'
import { buildNflHeadlines } from '../../lib/nfl/headlines'

// ── THE HEADLINE STRIP (moved out of tabs/Home.js 2026-09-25) ───────────────
// Donovan's 09-25 pass: Live before kickoff opens the way MOONSHOT's Morning
// Edition does -- headline cards first. The strip and its CSS lived inside
// Home.js; Live needed it too, so it is its own component now and Home
// imports it back. The original note follows.
// ── THE ROTATING HEADLINE STRIP (parity pass, 2026-09-16) ─────────────────
// Donovan, side by side with MOONSHOT: TUDDY's home page needs "the same
// exact build as moonshot home page look wise and everything with the
// rotating headliner." MOONSHOT's Home leads with a self-scrolling row of
// headline cards (components/tabs/Home.js's own <Headlines>, built from
// lib/headlines.js's buildHeadlines()) that rolls right-to-left on its own,
// pauses under the pointer, and where every card is a tap. The Six's own
// "headliner" treatment (below) is a different pattern -- one card pulled
// out of a fixed six-up grid, not a rolling strip of several -- so it stays
// exactly as it is; this is the strip MOONSHOT's Home actually has and
// TUDDY's didn't. Same card shape (icon + tag + name + why + stat, 232px,
// two copies back to back for a seamless loop), built from
// lib/nfl/headlines.js's buildNflHeadlines() -- the bot's #1, the
// high-confidence flag, the aligned-signal stack, the softest matchup, the
// game to circle.
// 2026-09-26: the strip itself is shared (components/HeadlineStrip.js) --
// MOONSHOT's render, which is the reference; this file keeps TUDDY's cards
// (buildNflHeadlines) and what a tap opens. The card now draws exactly as
// MOONSHOT's (glass fill, 232px on a phone too) where the old private CSS
// used bg2 and a 200px phone width.
export default function NflHeadlineStrip({ players, games, markets, matchup, onPlayerClick, setTab }) {
  const cards = useMemo(
    () => buildNflHeadlines({ players, games, markets, matchup }),
    [players, games, markets, matchup],
  )
  const open = (c) => (c.p ? onPlayerClick?.(c.p, 'TD') : c.nav ? setTab?.(c.nav) : null)
  return <HeadlineStrip cards={cards} onOpen={open} theme={C} numFont={NUM_FONT} accent={C.green} speed={30} />
}
