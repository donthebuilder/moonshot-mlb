export const NFL_TEAMS = [
  ['ARI','Arizona Cardinals'],['ATL','Atlanta Falcons'],['BAL','Baltimore Ravens'],['BUF','Buffalo Bills'],
  ['CAR','Carolina Panthers'],['CHI','Chicago Bears'],['CIN','Cincinnati Bengals'],['CLE','Cleveland Browns'],
  ['DAL','Dallas Cowboys'],['DEN','Denver Broncos'],['DET','Detroit Lions'],['GB','Green Bay Packers'],
  ['HOU','Houston Texans'],['IND','Indianapolis Colts'],['JAX','Jacksonville Jaguars'],['KC','Kansas City Chiefs'],
  ['LV','Las Vegas Raiders'],['LAC','Los Angeles Chargers'],['LA','Los Angeles Rams'],['MIA','Miami Dolphins'],
  ['MIN','Minnesota Vikings'],['NE','New England Patriots'],['NO','New Orleans Saints'],['NYG','New York Giants'],
  ['NYJ','New York Jets'],['PHI','Philadelphia Eagles'],['PIT','Pittsburgh Steelers'],['SF','San Francisco 49ers'],
  ['SEA','Seattle Seahawks'],['TB','Tampa Bay Buccaneers'],['TEN','Tennessee Titans'],['WAS','Washington Commanders'],
]

// `perGame` is the payload's team_defense.per_game -- last season's per-game
// sacks, takeaways, touchdowns and points allowed, per team.
//
// Without it every D/ST carried an EMPTY stats object, so projectedFantasyPoints
// fell through to DEF_BASELINE_POINTS_ALLOWED = 21, which sits in the 21-27 tier
// worth zero. All 32 defences projected exactly 0.0 and their order on the draft
// board was alphabetical. With it they run about 2.4 to 8.5, which is the range
// a D/ST actually occupies.
export function fantasyDefenseCatalog(season, perGame = null) {
  return NFL_TEAMS.map(([team, name]) => {
    const d = perGame?.[team] || null
    const stats = d ? {
      points_allowed: d.points_allowed,
      def_sacks: d.def_sacks,
      def_interceptions: d.def_interceptions,
      def_fumble_recoveries: d.def_fumble_recoveries,
      def_touchdowns: d.def_touchdowns,
    } : {}
    return {
      source: 'dash', sourcePlayerId: `DEF-${team}`, season, name: `${name} D/ST`,
      position: 'DEF', team, active: true, injuryStatus: null,
      analytics: { scores: { DEF: 50 }, stats },
    }
  })
}
