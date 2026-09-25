// The 32 NHL clubs, generated from api-web.nhle.com (standings/now for
// names, conference and division; schedule for the team ids) on 2026-09-25.
// Real league data, not typed from memory (STATUS rule 11). Regenerate with
// the same two endpoints if a club moves or renames; nothing else edits it.
//
//   [abbrev, id, place, nickname, conference, division]
export const NHL_TEAMS = [
  ['BOS', 6, "Boston", "Bruins", 'E', 'Atlantic'],
  ['BUF', 7, "Buffalo", "Sabres", 'E', 'Atlantic'],
  ['DET', 17, "Detroit", "Red Wings", 'E', 'Atlantic'],
  ['FLA', 13, "Florida", "Panthers", 'E', 'Atlantic'],
  ['MTL', 8, "Montr\u00e9al", "Canadiens", 'E', 'Atlantic'],
  ['OTT', 9, "Ottawa", "Senators", 'E', 'Atlantic'],
  ['TBL', 14, "Tampa Bay", "Lightning", 'E', 'Atlantic'],
  ['TOR', 10, "Toronto", "Maple Leafs", 'E', 'Atlantic'],
  ['CAR', 12, "Carolina", "Hurricanes", 'E', 'Metropolitan'],
  ['CBJ', 29, "Columbus", "Blue Jackets", 'E', 'Metropolitan'],
  ['NJD', 1, "New Jersey", "Devils", 'E', 'Metropolitan'],
  ['NYI', 2, "NY Islanders", "Islanders", 'E', 'Metropolitan'],
  ['NYR', 3, "NY Rangers", "Rangers", 'E', 'Metropolitan'],
  ['PHI', 4, "Philadelphia", "Flyers", 'E', 'Metropolitan'],
  ['PIT', 5, "Pittsburgh", "Penguins", 'E', 'Metropolitan'],
  ['WSH', 15, "Washington", "Capitals", 'E', 'Metropolitan'],
  ['CHI', 16, "Chicago", "Blackhawks", 'W', 'Central'],
  ['COL', 21, "Colorado", "Avalanche", 'W', 'Central'],
  ['DAL', 25, "Dallas", "Stars", 'W', 'Central'],
  ['MIN', 30, "Minnesota", "Wild", 'W', 'Central'],
  ['NSH', 18, "Nashville", "Predators", 'W', 'Central'],
  ['STL', 19, "St. Louis", "Blues", 'W', 'Central'],
  ['UTA', 68, "Utah", "Mammoth", 'W', 'Central'],
  ['WPG', 52, "Winnipeg", "Jets", 'W', 'Central'],
  ['ANA', 24, "Anaheim", "Ducks", 'W', 'Pacific'],
  ['CGY', 20, "Calgary", "Flames", 'W', 'Pacific'],
  ['EDM', 22, "Edmonton", "Oilers", 'W', 'Pacific'],
  ['LAK', 26, "Los Angeles", "Kings", 'W', 'Pacific'],
  ['SEA', 55, "Seattle", "Kraken", 'W', 'Pacific'],
  ['SJS', 28, "San Jose", "Sharks", 'W', 'Pacific'],
  ['VAN', 23, "Vancouver", "Canucks", 'W', 'Pacific'],
  ['VGK', 54, "Vegas", "Golden Knights", 'W', 'Pacific'],
]

const BY_ABBREV = Object.fromEntries(NHL_TEAMS.map((t) => [t[0], t]))
const BY_ID = Object.fromEntries(NHL_TEAMS.map((t) => [t[1], t]))

/** One club, by abbreviation or id. Null for anything unmapped — never a guess. */
export function nhlTeam(key) {
  const t = BY_ABBREV[String(key || '').toUpperCase()] || BY_ID[Number(key)]
  if (!t) return null
  const [abbrev, id, place, nickname, conference, division] = t
  return { abbrev, id, place, nickname, name: `${place} ${nickname}`, conference, division }
}

/** "TOR" -> "MAPLE LEAFS". Falls back to the abbreviation for anything unmapped. */
export function nhlNickname(key) {
  const t = nhlTeam(key)
  return (t ? t.nickname : String(key || '')).toUpperCase()
}

/** Light-background SVG mark from the league's own asset host. */
export const nhlLogo = (abbrev, dark = false) =>
  `https://assets.nhle.com/logos/nhl/svg/${String(abbrev || '').toUpperCase()}_${dark ? 'dark' : 'light'}.svg`

export const NHL_DIVISIONS = {
  E: ['Atlantic', 'Metropolitan'],
  W: ['Central', 'Pacific'],
}
