// The 30 NBA clubs, generated from ESPN's public site API on 2026-10-02
// (/teams for ids, codes and names; /groups for conference and division).
// Real league data, not typed from memory. Regenerate from the same two
// endpoints if a club moves or renames; nothing else edits it.
//
//   [abbrev, espnId, place, nickname, conference, division]
export const NBA_TEAMS = [
  ["BKN", "17", "Brooklyn", "Nets", "E", "Atlantic"],
  ["BOS", "2", "Boston", "Celtics", "E", "Atlantic"],
  ["NY", "18", "New York", "Knicks", "E", "Atlantic"],
  ["PHI", "20", "Philadelphia", "76ers", "E", "Atlantic"],
  ["TOR", "28", "Toronto", "Raptors", "E", "Atlantic"],
  ["CHI", "4", "Chicago", "Bulls", "E", "Central"],
  ["CLE", "5", "Cleveland", "Cavaliers", "E", "Central"],
  ["DET", "8", "Detroit", "Pistons", "E", "Central"],
  ["IND", "11", "Indiana", "Pacers", "E", "Central"],
  ["MIL", "15", "Milwaukee", "Bucks", "E", "Central"],
  ["ATL", "1", "Atlanta", "Hawks", "E", "Southeast"],
  ["CHA", "30", "Charlotte", "Hornets", "E", "Southeast"],
  ["MIA", "14", "Miami", "Heat", "E", "Southeast"],
  ["ORL", "19", "Orlando", "Magic", "E", "Southeast"],
  ["WSH", "27", "Washington", "Wizards", "E", "Southeast"],
  ["DEN", "7", "Denver", "Nuggets", "W", "Northwest"],
  ["MIN", "16", "Minnesota", "Timberwolves", "W", "Northwest"],
  ["OKC", "25", "Oklahoma City", "Thunder", "W", "Northwest"],
  ["POR", "22", "Portland", "Trail Blazers", "W", "Northwest"],
  ["UTAH", "26", "Utah", "Jazz", "W", "Northwest"],
  ["GS", "9", "Golden State", "Warriors", "W", "Pacific"],
  ["LAC", "12", "LA", "Clippers", "W", "Pacific"],
  ["LAL", "13", "Los Angeles", "Lakers", "W", "Pacific"],
  ["PHX", "21", "Phoenix", "Suns", "W", "Pacific"],
  ["SAC", "23", "Sacramento", "Kings", "W", "Pacific"],
  ["DAL", "6", "Dallas", "Mavericks", "W", "Southwest"],
  ["HOU", "10", "Houston", "Rockets", "W", "Southwest"],
  ["MEM", "29", "Memphis", "Grizzlies", "W", "Southwest"],
  ["NO", "3", "New Orleans", "Pelicans", "W", "Southwest"],
  ["SA", "24", "San Antonio", "Spurs", "W", "Southwest"],
]
const BY = Object.fromEntries(NBA_TEAMS.map(([a, id, place, nick, conf, div]) => [a, { abbrev: a, id, place, nick, conf, div }]))
const BY_ID = Object.fromEntries(NBA_TEAMS.map(([a, id]) => [id, a]))
/** One club by its code (ESPN's: NY, SA, GS, NO, UTAH, WSH ...), or null. */
export const nbaTeam = (abbrev) => BY[String(abbrev || '').toUpperCase()] || null
/** ESPN team id -> code. */
export const nbaAbbrevOf = (id) => BY_ID[String(id || '')] || null
/** The club's logo on ESPN's CDN (dark-background version for the site). */
export const nbaLogo = (abbrev, dark = true) => (nbaTeam(abbrev) ? `https://a.espncdn.com/i/teamlogos/nba/500${dark ? '-dark' : ''}/${String(abbrev).toLowerCase()}.png` : null)
