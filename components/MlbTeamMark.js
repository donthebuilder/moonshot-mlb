'use client'
import TeamMark from './TeamMark'

// ⚾ THE TEAM MARK (2026-08-29).
//
// FRANCHISE has had TeamMark since the identity pass — an owner-picked colour
// and monogram on every fantasy roster. MOONSHOT had nothing: the score rail
// was bare abbreviations in grey, thirty clubs rendered identically.
//
// This is the MLB half. Deliberately the plainest thing that works: the
// abbreviation, in the club's colour, on a tinted chip. No logos (licensing,
// and thirty image requests on a rail that has to stay fast), no gradients,
// no per-club typography.
//
// THE RULE IT KEEPS: a club colour is an IDENTITY, never a data colour. This
// component may sit beside a number; it may never shade one. See lib/
// mlbTeams.js for why that line matters on a site whose every other colour
// means magnitude.
//
// An unknown abbreviation renders in neutral grey rather than a guess, and
// keeps the abbreviation visible — the same "no data, no panel, but never a
// blank" rule the rest of the site follows.
export default function MlbTeamMark(props) {
  // One chip for every sport now (components/TeamMark.js); this name stays for
  // the call sites that already use it.
  return <TeamMark sport="mlb" {...props} />
}
