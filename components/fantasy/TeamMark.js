import { teamColor, teamMonogram } from './teamIdentity'
import { emblemPath } from './emblems'

// The colored monogram medallion that stands in for a team logo. Renders for
// EVERY team — owner-picked identity when it exists, deterministic fallback
// when it doesn't (see teamIdentity.js) — so no screen has a mix of marked
// and unmarked rows. Inline-styled on purpose: it appears on pages styled by
// fantasy.module.css and on the Franchise home, and a self-contained span
// works identically in all of them, server-rendered, with no CSS coupling.
export default function TeamMark({ team, size = 26 }) {
  const color = teamColor(team)
  const monogram = teamMonogram(team)
  // An emblem replaces the monogram rather than joining it -- two marks in one
  // 26px medallion is no mark at all. A team with no emblem, or one this build
  // does not draw, keeps the initials it has always had.
  const path = emblemPath(team?.emblem)
  return (
    <span
      aria-hidden="true"
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, borderRadius: '32%', flex: 'none',
        background: `color-mix(in srgb, ${color} 20%, #141210)`,
        border: `1px solid color-mix(in srgb, ${color} 55%, #2a2724)`,
        color,
        font: `900 ${Math.max(8, Math.round(size * (monogram.length > 2 ? 0.3 : 0.38)))}px/1 monospace`,
        letterSpacing: monogram.length > 1 ? '.02em' : '0',
        verticalAlign: 'middle',
      }}
    >{path
      ? <svg aria-hidden="true" viewBox="0 0 24 24" width={Math.round(size * 0.62)} height={Math.round(size * 0.62)} fill="currentColor"><path d={path}/></svg>
      : monogram}</span>
  )
}
