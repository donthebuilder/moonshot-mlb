// One club code per club, across ESPN's injury feed and our own boards. Both sides go through canonTeam(), so a
// code that differs between ESPN and the site (WSH / WAS, LA / LAK) still meets in the middle.
const ALIAS = {
  nfl: { WSH: 'WAS', LAR: 'LA' },
  nhl: { LA: 'LAK', NJ: 'NJD', SJ: 'SJS', TB: 'TBL' },
  mlb: { CHW: 'CWS', AZ: 'ARI', TBR: 'TB', SDP: 'SD', SFG: 'SF', KCR: 'KC', WAS: 'WSH' },
  nba: { GSW: 'GS', SAS: 'SA', NYK: 'NY', NOP: 'NO', UTA: 'UTAH', PHO: 'PHX' },
}
export const canonTeam = (sport, abbr) => {
  const a = String(abbr == null ? '' : abbr).trim().toUpperCase()
  return (ALIAS[sport] && ALIAS[sport][a]) || a
}
