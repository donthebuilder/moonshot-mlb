// HEAD TO HEAD: THE SMALL EXPLICIT LISTS (2026-10-13). Pure data, no feed.
//
// RIVALRIES. Real, widely named rivalries only, written out by hand, one line each. Nothing is computed ("they play
// often" is not a rivalry) and nothing is guessed: if a pairing is not obviously a rivalry it is NOT here. `name` is the
// series' own name where it has one everyone uses; otherwise null and the tag just says RIVALS. Codes are the site's own
// per sport (lib/mlbTeams.js, lib/nfl/teams.js, lib/nhl/teams.js, lib/nba/teams.js). Adding one is one line.
const R = (a, b, name = null) => ({ a, b, name })

export const RIVALRIES = {
  mlb: [
    R('NYY', 'BOS'), R('LAD', 'SF'), R('CHC', 'STL'), R('NYY', 'NYM', 'Subway Series'), R('CHC', 'CWS', 'Crosstown Classic'),
    R('LAA', 'LAD', 'Freeway Series'), R('HOU', 'TEX'), R('KC', 'STL'), R('BAL', 'WSH'), R('LAD', 'SD'),
  ],
  nfl: [
    R('GB', 'CHI'), R('DAL', 'PHI'), R('DAL', 'WAS'), R('DAL', 'NYG'), R('NYG', 'PHI'), R('PIT', 'BAL'), R('PIT', 'CLE'),
    R('KC', 'LV'), R('KC', 'DEN'), R('SF', 'SEA'), R('GB', 'DET'), R('DET', 'CHI'), R('NE', 'NYJ'), R('NE', 'BUF'),
  ],
  nhl: [
    R('TOR', 'MTL'), R('BOS', 'MTL'), R('NYR', 'NYI'), R('PIT', 'PHI'), R('PIT', 'WSH'), R('EDM', 'CGY', 'Battle of Alberta'),
    R('CHI', 'DET'), R('LAK', 'ANA', 'Freeway Face-Off'), R('BOS', 'TOR'),
  ],
  nba: [
    R('LAL', 'BOS'), R('LAL', 'LAC'), R('NY', 'BKN'), R('NY', 'BOS'), R('BOS', 'PHI'), R('CHI', 'DET'), R('MIA', 'NY'),
    R('DAL', 'SA'), R('DAL', 'HOU'), R('HOU', 'SA'), R('LAL', 'GS'),
  ],
}

/** The explicit rivalry between two clubs, or null. Order of the two codes does not matter. */
export function rivalryOf(sport, a, b) {
  const A = String(a || '').toUpperCase(); const B = String(b || '').toUpperCase()
  if (!A || !B || A === B) return null
  const hit = (RIVALRIES[sport] || []).find((r) => (r.a === A && r.b === B) || (r.a === B && r.b === A))
  return hit ? { name: hit.name, tag: hit.name || 'RIVALS' } : null
}

/** What each sport's record words are. `third`: the column that is not a win or a plain loss (NHL: OT/SO loss, NFL: tie). */
export const SPORT_RULES = {
  mlb: { unit: 'run', third: null, lossExtra: false, recordWords: 'Wins-losses', rareMeetings: false },
  nfl: { unit: 'point', third: 'T', lossExtra: false, recordWords: 'Wins-losses-ties', rareMeetings: true },   // clubs meet once or twice a season
  nhl: { unit: 'goal', third: 'OTL', lossExtra: true, recordWords: 'Wins-losses-overtime losses', rareMeetings: false },
  nba: { unit: 'point', third: null, lossExtra: false, recordWords: 'Wins-losses', rareMeetings: false },
}

/** Fewest meetings before an average is printed. Under it the cell says nothing and the table says "not enough yet". */
export const MIN_MEETINGS = 3
/** Seasons read for a pair: this season and the two before it. */
export const SEASONS_BACK = 3
