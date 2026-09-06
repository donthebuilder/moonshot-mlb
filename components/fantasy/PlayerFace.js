import { nflTones } from '../../lib/nfl/teamColors'
import { defenseTeamOf, nflHeadshot, nflTeamLogo } from '../../lib/nfl/nflAssets'
import { headshotIdFor } from '../../lib/nfl/headshotIds'

// A player's face, with his club on it.
//
// Franchise identified every player by a three-letter monogram tile. That is
// the same tile for all fifty-three men on a roster, so a list of players read
// as a list of team names -- you could not find your own running back by
// looking, only by reading. A face is the fastest identifier a fantasy row has;
// it is why every competing product puts one there.
//
// THREE LAYERS, DEGRADING QUIETLY IN THIS ORDER:
//   1. club-coloured tile with the team abbreviation -- always rendered;
//   2. the ESPN headshot, if this man's GSIS id bridges to an ESPN id;
//   3. a small club logo badge in the corner, so the row still says which team
//      even when the face fills the tile.
// A defence row (`DEF-<TEAM>`) has no person, so it renders the club logo big
// and skips the badge.
//
// Layers 2 and 3 are `alt=""` images. If ESPN has no asset the image collapses
// to nothing and layer 1 -- today's monogram tile -- is what shows. That is the
// whole fallback strategy: no client JS, no onError, nothing to hydrate. This
// stays a server component and adds zero bytes to the browser bundle beyond the
// images themselves (~7 KB a face, ~2 KB a logo, both lazy).
export default function PlayerFace({ player, size = 34 }) {
  const team = String(player?.team || 'FA').toUpperCase()
  const [primary, secondary] = nflTones(team)
  const defenseTeam = defenseTeamOf(player?.source_player_id)
  const headshotId = defenseTeam ? null : headshotIdFor(player?.source_player_id)
  const face = headshotId ? nflHeadshot(headshotId, size, size) : null
  const logo = nflTeamLogo(defenseTeam || team, size)
  const badge = Math.round(size * 0.46)

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
        boxShadow: `inset 0 1px 0 rgba(255,255,255,.12),0 4px 12px ${primary}33`,
        color: '#fff', textShadow: '0 1px 3px #000',
        font: `900 ${Math.max(7, Math.round(size * 0.26))}px/1 monospace`,
        letterSpacing: '-.04em', overflow: 'hidden',
      }}
    >
      {team.slice(0, 3)}
      {defenseTeam
        ? logo && <img alt="" src={logo} loading="lazy" decoding="async"
            width={Math.round(size * 0.78)} height={Math.round(size * 0.78)}
            style={{ position: 'absolute', inset: 0, margin: 'auto', objectFit: 'contain',
                     filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.55))' }}/>
        : <>
            {face && <img alt="" src={face} loading="lazy" decoding="async"
              width={size} height={size}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%',
                       objectFit: 'cover', objectPosition: 'top center' }}/>}
            {logo && <img alt="" src={logo} loading="lazy" decoding="async"
              width={badge} height={badge}
              style={{ position: 'absolute', right: -1, bottom: -1, width: badge, height: badge,
                       objectFit: 'contain',
                       filter: 'drop-shadow(0 0 2px rgba(0,0,0,.9)) drop-shadow(0 1px 2px rgba(0,0,0,.7))' }}/>}
          </>}
    </span>
  )
}
