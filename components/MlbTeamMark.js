'use client'
import { teamColor, teamName, isKnownTeam } from '../lib/mlbTeams'

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
export default function MlbTeamMark({ abbr, size = 'sm', dim = false, style }) {
  const code = String(abbr || '').trim().toUpperCase()
  if (!code) return null
  const col = teamColor(code)
  const known = isKnownTeam(code)
  const name = teamName(code)
  const big = size === 'md'
  return (
    <span
      title={name ? `${name} (${code})` : code}
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        minWidth: big ? 34 : 28, height: big ? 20 : 17, padding: '0 5px',
        borderRadius: 5, flexShrink: 0,
        border: `1px solid ${known ? `${col}66` : 'rgba(255,255,255,.14)'}`,
        background: known ? `${col}1f` : 'rgba(255,255,255,.05)',
        color: col,
        fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
        fontSize: big ? 10.5 : 9.5, fontWeight: 900, letterSpacing: '.02em',
        opacity: dim ? 0.55 : 1,
        ...style,
      }}
    >{code}</span>
  )
}
