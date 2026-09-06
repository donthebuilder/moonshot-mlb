// ESPN's public image CDN, as the two URLs Franchise actually needs.
//
// WHY AN OUTSIDE CDN AND NOT OUR OWN FILES: a headshot per active player plus
// thirty-two club logos is roughly 40 MB of PNG that would have to be fetched,
// cropped, committed, and re-committed every time a man is traded. ESPN already
// hosts all of it, resizes on demand, and is the same source every fantasy site
// on the internet points at. Nothing here is scraped or stored -- these are
// <img src> values, built from an id.
//
// EVERY URL GOES THROUGH THE COMBINER. The raw asset is 200-300 KB for a
// headshot and 30-40 KB for a 500px logo; at the row counts the Wire renders
// that is megabytes of image for a phone. The combiner's w/h/cquality knobs cut
// the same headshot to ~7 KB and a logo to ~2 KB, which is what makes putting a
// face on eighty rows a mobile-safe idea rather than a mobile-hostile one.

const COMBINER = 'https://a.espncdn.com/combiner/i?img='

// nflverse abbreviations are not ESPN's for three clubs. Everything else --
// GB, KC, LV, NE, NO, SF, TB, JAX, LAC -- already matches, so this map is
// exactly the disagreements and nothing else.
const CDN_TEAM_CODE = {
  WAS: 'wsh',  // nflverse WAS, ESPN WSH
  LA: 'lar',   // the slate uses both LA and LAR for the Rams
  ARZ: 'ari',
}

/** ESPN's lowercase club code, or null for FA / an unknown code. */
export function cdnTeamCode(team) {
  const code = String(team || '').trim().toUpperCase()
  if (!code || code === 'FA') return null
  return CDN_TEAM_CODE[code] || code.toLowerCase()
}

/**
 * A club logo, sized. `dark: true` returns the light-on-dark variant ESPN
 * publishes for exactly this situation -- Franchise is a dark app, and a few
 * clubs (NYJ, NO, PIT, LV) have near-black primary marks that vanish on it.
 */
export function nflTeamLogo(team, size = 48, dark = true) {
  const code = cdnTeamCode(team)
  if (!code) return null
  const px = Math.max(24, Math.round(size * 2)) // 2x for retina
  return `${COMBINER}/i/teamlogos/nfl/500${dark ? '-dark' : ''}/${code}.png&w=${px}&h=${px}`
}

/** A player headshot, cropped to the tile it sits in. */
export function nflHeadshot(headshotId, width = 48, height = 35) {
  if (!headshotId) return null
  return `${COMBINER}/i/headshots/nfl/players/full/${headshotId}.png`
    + `&w=${Math.round(width * 2)}&h=${Math.round(height * 2)}&scale=crop&cquality=60`
}

/** Defence rows carry `DEF-<TEAM>` as their source id, not a person's. */
export function defenseTeamOf(sourcePlayerId) {
  const match = /^DEF-([A-Z]{2,3})$/.exec(String(sourcePlayerId || '').toUpperCase())
  return match ? match[1] : null
}
