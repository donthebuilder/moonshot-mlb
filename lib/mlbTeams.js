// ⚾ THE THIRTY, WITH THEIR OWN COLOURS (2026-08-29).
//
// Donovan, on blending FRANCHISE's look into MOONSHOT: team identity marks are
// "the single biggest 'looks modern' win available and it adds zero claims."
// He is right on both counts — and the reason it had not been done is that
// MOONSHOT had no team colour anywhere in the repo. components/fantasy/
// teamIdentity.js is Franchise-only: it reads an owner-picked colour off the
// `fantasy_teams` row and has nothing to say about the Dodgers.
//
// So this is that missing table. One entry per club, keyed by the SAME
// abbreviation the slate rows and lib/gamelogs.js's teamAbbrs() already use,
// carrying the club's primary colour and a short mark.
//
// TWO RULES THIS FILE KEEPS, BOTH BORROWED FROM THE PALETTE WORK:
//
//   1. A TEAM COLOUR IS AN IDENTITY, NOT A DATA COLOUR. Nothing here may be
//      used to shade a value, fill a bar, or rank anything — the moment a club
//      hue lands on a number, the site has two colour systems saying different
//      things in the same cell. These are for marks, chips and labels only.
//      scripts/check-palette.mjs polices the data ramps; this file is
//      deliberately outside them.
//   2. LEGIBILITY BEATS ACCURACY. Several clubs' true primaries (navy, black,
//      deep green) vanish on this site's near-black background. Where that
//      happens the entry carries the club's brighter secondary instead, and
//      says so in a comment. A mark you cannot see is not identity.
//
// Unknown or missing abbreviations fall back to a neutral grey mark rather
// than a guessed colour: the same no-data-no-panel rule the rest of the site
// follows.

export const MLB_TEAMS = {
  // AL East
  BAL: { color: '#DF4601', name: 'Orioles' },
  BOS: { color: '#BD3039', name: 'Red Sox' },
  NYY: { color: '#8FA8C8', name: 'Yankees' },   // navy is invisible here; their secondary grey-blue
  TB:  { color: '#8FBCE6', name: 'Rays' },      // ditto — the light blue, not the navy
  TOR: { color: '#4B92DB', name: 'Blue Jays' },
  // AL Central
  CWS: { color: '#C4CED4', name: 'White Sox' }, // black primary; their silver reads
  CLE: { color: '#E31937', name: 'Guardians' },
  DET: { color: '#FA4616', name: 'Tigers' },    // navy primary; the orange accent reads
  KC:  { color: '#7BB2DD', name: 'Royals' },    // ditto
  MIN: { color: '#D31145', name: 'Twins' },
  // AL West
  ATH: { color: '#EFB21E', name: 'Athletics' }, // green primary is too dark; the gold
  HOU: { color: '#EB6E1F', name: 'Astros' },
  LAA: { color: '#BA0021', name: 'Angels' },
  SEA: { color: '#005C5C', name: 'Mariners' },
  TEX: { color: '#C0111F', name: 'Rangers' },
  // NL East
  ATL: { color: '#CE1141', name: 'Braves' },
  MIA: { color: '#00A3E0', name: 'Marlins' },
  NYM: { color: '#FF5910', name: 'Mets' },
  PHI: { color: '#E81828', name: 'Phillies' },
  WSH: { color: '#AB0003', name: 'Nationals' },
  // NL Central
  CHC: { color: '#CC3433', name: 'Cubs' },      // their red; the blue is too close to the site's own
  CIN: { color: '#C6011F', name: 'Reds' },
  MIL: { color: '#FFC52F', name: 'Brewers' },   // navy primary; the gold reads
  PIT: { color: '#FDB827', name: 'Pirates' },   // black primary; the gold
  STL: { color: '#C41E3A', name: 'Cardinals' },
  // NL West
  ARI: { color: '#A71930', name: 'Diamondbacks' },
  COL: { color: '#C4CED4', name: 'Rockies' },   // purple/black; their silver
  LAD: { color: '#4B8FE2', name: 'Dodgers' },   // brightened from #005A9C so it reads on black
  SD:  { color: '#FFC425', name: 'Padres' },    // brown primary is mud here; the gold
  SF:  { color: '#FD5A1E', name: 'Giants' },
}

// A handful of abbreviations move around between feeds. Mapped rather than
// guessed, so a rename never silently produces a grey mark.
const ALIASES = {
  OAK: 'ATH', AZ: 'ARI', CHW: 'CWS', SDP: 'SD', SFG: 'SF',
  TBR: 'TB', KCR: 'KC', WSN: 'WSH', LA: 'LAD', NY: 'NYY',
}

const NEUTRAL = '#6b7280'

export function teamKey(abbr) {
  const k = String(abbr || '').trim().toUpperCase()
  if (!k) return ''
  return MLB_TEAMS[k] ? k : (ALIASES[k] || '')
}

/** The club's identity colour, or a neutral grey when the club isn't known. */
export function teamColor(abbr) {
  const k = teamKey(abbr)
  return k ? MLB_TEAMS[k].color : NEUTRAL
}

/** The club's name, for a tooltip. Empty when unknown — never guessed. */
export function teamName(abbr) {
  const k = teamKey(abbr)
  return k ? MLB_TEAMS[k].name : ''
}

/** True when this abbreviation is one of the thirty (or a known alias). */
export function isKnownTeam(abbr) {
  return !!teamKey(abbr)
}
