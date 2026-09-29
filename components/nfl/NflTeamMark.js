'use client'
import TeamMark from '../TeamMark'

// 🏈 THE TEAM MARK — TUDDY's twin of components/MlbTeamMark.js, built for the
// shared ScoreRail (2026-09-16, the "shell it out" pass).
//
// Not the same file as components/fantasy/NflTeamMark.js — that one is a
// FRANCHISE roster badge (square, gradient, no dim state, sized in px for a
// draft grid) built for a different job. This one matches MlbTeamMark's exact
// contract instead — {abbr, size: 'sm'|'md', dim} — because that is the
// contract the rail actually calls: a losing team has to be able to dim, and
// a roster badge was never asked to.
//
// Same chip, same sizing, same "identity colour, never a data colour" rule as
// the original — only the colour source changes: lib/nfl/teamColors.js's own
// nflTones() instead of lib/mlbTeams.js's teamColor(). No logo, same reasoning
// as the original: a rail this fast can't afford thirty-two image requests.
export default function NflTeamMark(props) {
  // One chip for every sport now (components/TeamMark.js), with readable ink
  // for the dark clubs; this name stays for the call sites that already use it.
  return <TeamMark sport="nfl" {...props} />
}
