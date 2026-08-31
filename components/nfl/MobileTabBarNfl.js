'use client'
import MobileTabBar from '../MobileTabBar'

// C3's NFL half: "if it feels right, NFL copies it" (dash-network-master-
// plan-2026-08-28.md). MOONSHOT's mobile bar shape is 4 essential
// destinations + a "More" catch-all, so this picks NFL's 4 most-reached-for
// tabs the same way -- Home/Boards/Games/Picks, now genuinely matching
// NflHeader.js's PRIMARY_TABS order (the header was reordered 2026-08-29 to
// agree with this bar) minus 'research' (which drops into More here to
// keep the 4+More shape MOONSHOT's bar uses, rather than force-fitting 5
// primaries into a bar built for 4). Icons are reused 1:1 from MOONSHOT's
// own MAIN (⌂ home, ▥ boards, ◉ live/rundown, ✦ picks) on purpose -- same
// glyph, same meaning, cross-sport, matching the shared DASH Network design
// language rather than inventing a second icon vocabulary.
// The house belongs to the front door, network-wide (2026-08-31). See the
// note on MAIN in components/MobileTabBar.js.
const MAIN = [
  ['home', '◎', 'Tonight'],
  ['boards', '▥', 'Boards'],
  ['games', '◉', 'Games'],
  ['picks', '✦', 'Picks'],
]

// Everything else NflHeader.js's own MORE_TABS already lists, plus
// 'research' (bumped out of MAIN above), each with a short detail line in
// the same style MOONSHOT's MORE list uses.
const MORE = [
  ['research', 'Research', 'HR-style scoring breakdowns and highlights'],
  ['players', 'Player Portal', 'Every player, full stat portal'],
  ['watchlist', 'Watchlist', 'Your starred players'],
  ['matchups', 'Matchups', 'Defense-vs-position and game scripts'],
  ['report', 'Report Card', "The model's own grades, week over week"],
  ['accountability', 'Results', 'Graded calls, settled outcomes'],
  ['pairs', 'Pairs', 'Two-leg prop combinations'],
  ['guide', 'Guide', 'How every part of TUDDY works'],
]

export default function MobileTabBarNfl({ tab, setTab }) {
  return <MobileTabBar tab={tab} setTab={setTab} main={MAIN} more={MORE} brand="TUDDY" />
}
