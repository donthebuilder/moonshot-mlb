import { teamColor, teamMonogram } from './teamIdentity'

// The colored monogram medallion that stands in for a team logo. Renders for
// EVERY team — owner-picked identity when it exists, deterministic fallback
// when it doesn't (see teamIdentity.js) — so no screen has a mix of marked
// and unmarked rows. Inline-styled on purpose: it appears on pages styled by
// fantasy.module.css and on the Franchise home, and a self-contained span
// works identically in all of them, server-rendered, with no CSS coupling.
export default function TeamMark({ team, size = 26 }) {
  const color = teamColor(team)
  const monogram = teamMonogram(team)
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
    >{monogram}</span>
  )
}
