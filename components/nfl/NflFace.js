'use client'
import { nflTones } from '../../lib/nfl/teamColors'
import { nflHeadshot, nflTeamLogo } from '../../lib/nfl/nflAssets'

// A TUDDY player's face. The client-safe twin of components/fantasy/PlayerFace.
//
// WHY THIS EXISTS RATHER THAN REUSING PlayerFace.
// PlayerFace is a server component and its own header says so: it imports
// lib/nfl/headshotIds.js, a 3,252-entry GSIS->ESPN map that is ~72 KB and
// "imported by server components only -- it never reaches the browser bundle".
// Every TUDDY tab is a client component, so importing it here would ship 72 KB
// to the browser to avoid publishing an eight-byte field.
//
// So the bot publishes `espn_id` on the player row instead (nfl_injuries.py's
// espn_ids(), the injury crosswalk read the other way round -- 528 of 529 slate
// players carry one). This component is then just an <img> and a coloured tile.
//
// THE FALLBACK IS THE TILE, AND IT COSTS NOTHING.
// Same strategy PlayerFace uses: the club-coloured monogram is always rendered,
// the headshot lays over it, and an image that 404s collapses to nothing so the
// tile shows through. No onError handler, no state, no hydration. A player with
// no espn_id (a UDFA the registry has not caught up with) simply keeps his tile.
//
// Sized through ESPN's combiner at 2x for retina: ~8 KB a face, measured, not
// the 200-300 KB raw asset.
export default function NflFace({ player, size = 40 }) {
  const team = String(player?.team || 'FA').toUpperCase()
  const [primary, secondary] = nflTones(team)
  const face = player?.espn_id ? nflHeadshot(String(player.espn_id), size, size) : null
  const logo = nflTeamLogo(team, Math.round(size * 0.44))
  const badge = Math.round(size * 0.44)

  return (
    <span
      aria-label={player?.name ? `${player.name}, ${team}` : team}
      title={player?.name || team}
      style={{
        position: 'relative', display: 'inline-grid', placeItems: 'center', flex: '0 0 auto',
        width: size, height: size,
        borderRadius: Math.max(7, Math.round(size * 0.26)),
        border: `1px solid ${secondary}55`,
        background: `linear-gradient(160deg,${primary}dd 0 62%,${secondary}dd 63% 100%)`,
        boxShadow: `inset 0 1px 0 rgba(255,255,255,.12)`,
        color: '#fff', textShadow: '0 1px 3px #000',
        font: `900 ${Math.max(7, Math.round(size * 0.26))}px/1 monospace`,
        letterSpacing: '-.04em', overflow: 'hidden',
      }}
    >
      {team.slice(0, 3)}
      {face && (
        <img alt="" src={face} loading="lazy" decoding="async" width={size} height={size}
             style={{
               position: 'absolute', inset: 0, width: '100%', height: '100%',
               objectFit: 'cover', objectPosition: 'top center',
             }} />
      )}
      {logo && (
        <img alt="" src={logo} loading="lazy" decoding="async" width={badge} height={badge}
             style={{
               position: 'absolute', right: -1, bottom: -1, width: badge, height: badge,
               objectFit: 'contain', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.6))',
             }} />
      )}
    </span>
  )
}
