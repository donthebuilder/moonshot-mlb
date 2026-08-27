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

export function fantasyDefenseCatalog(season) {
  return NFL_TEAMS.map(([team, name]) => ({
    source: 'dash', sourcePlayerId: `DEF-${team}`, season, name: `${name} D/ST`,
    position: 'DEF', team, active: true, injuryStatus: null,
    analytics: { scores: { DEF: 50 }, stats: {} },
  }))
}
