'use client'
import { nflTones, NFL_TEAM_TONES } from '../../lib/nfl/teamColors'

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
export default function NflTeamMark({ abbr, size = 'sm', dim = false, style }) {
  const code = String(abbr || '').trim().toUpperCase()
  if (!code) return null
  const known = Object.prototype.hasOwnProperty.call(NFL_TEAM_TONES, code) && code !== 'FA'
  const [col] = nflTones(code)
  const big = size === 'md'
  return (
    <span
      title={code}
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
