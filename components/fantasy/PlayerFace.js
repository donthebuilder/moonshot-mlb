import { nflTones } from '../../lib/nfl/teamColors'
import NflFace from '../nfl/NflFace'
import { defenseTeamOf, nflTeamLogo } from '../../lib/nfl/nflAssets'
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
// R10 STEP 3 (2026-10-05): ONE FACE. A man's face is TUDDY's NflFace -- the round cutout, no box
// (Donovan 10-04: "same PlayerFace component everywhere"); this file is only the resolver, so
// the 72 KB GSIS->ESPN map still never reaches the browser.
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
  const defenseTeam = defenseTeamOf(player?.source_player_id)
  if (!defenseTeam) {
    return <NflFace player={{ espn_id: headshotIdFor(player?.source_player_id), team, name: player?.name }} size={size} />
  }
  // a defence has no person: its club logo, on the same round disc a face sits on
  const [primary] = nflTones(defenseTeam)
  const logo = nflTeamLogo(defenseTeam, size)
  return (
    <span
      aria-label={player?.name ? `${player.name}, ${team}` : team}
      title={player?.name || team}
      style={{ position: 'relative', display: 'inline-grid', placeItems: 'center', flex: '0 0 auto', width: size, height: size, borderRadius: '50%', background: `${primary}40`, overflow: 'hidden' }}
    >
      {logo && <img alt="" src={logo} loading="lazy" decoding="async"
        width={Math.round(size * 0.78)} height={Math.round(size * 0.78)}
        style={{ objectFit: 'contain', filter: 'drop-shadow(0 1px 2px rgba(0,0,0,.55))' }} />}
    </span>
  )
}
