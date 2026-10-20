// CHAMPIONSHIP ODDS, ONE CONTRACT PER SPORT (2026-10-13).
//
// Donovan: "we need model predictions for the championship just like the MLB did."
// MLB has had it since 2026-09-03: bots/playoff_odds.py simulates the rest of the
// season ten thousand times, runs the bracket each time, and publishes
// current/playoff_odds.json; components/PennantRace.js reads it. This file is the same
// idea for the other three leagues, with the SPORT'S WORDS in one registry so the panel
// is one component (PennantRace) and never a sport ternary.
//
// THE FILE CONTRACT (the bot writes it; spec: AUDITS-TO-READ/BOT-TASK-CHAMPIONSHIP-ODDS.md).
// MLB's file is the shape every other sport's file copies. Shares are 0-1, never percents:
//   {
//     schema: 1,
//     season: 2026,                     // the season the odds are for
//     as_of: '2026-10-13T04:22:00Z',    // when the standings were read (MLB: built_at -- both are read)
//     sims: 10000,
//     model_version: 'championship-v1', // new model = new version, never an edit
//     method: '...',                    // REQUIRED, plain words, what it knows and does not know
//     note: '...',                      // optional (a data caveat, e.g. a feed that was down)
//     teams: [{
//       team_id, abbr, name, conference, division,
//       wins, losses, otl|ties,         // NHL otl, NFL ties; absent otherwise
//       strength, proj_wins,
//       make_playoffs, win_division, top_seed,
//       seeds: { '1': .31, '2': .2 ... },           // chance of finishing each seed
//       win_round1 .. win_round4,       // chance to WIN that round (a bye counts as advancing)
//       win_champion,                   // = win_round4. MLB's own names: win_league, win_world_series.
//       race: { clinch: ''|'x'|'y'|'z'|'w', eliminated, seed, division_rank, games_back }   // optional, bot-side snapshot
//     }]
//   }
// A file that is missing, malformed, or fails the checks in readChampionship is the EMPTY
// state: the panel shows nothing (new sports) or its "fills in with the next update" line
// (MLB, unchanged). Nothing here ever invents a number.
import { championshipPaths } from './dataSource'
import { fetchJSON } from './data'
import { sportKey } from './routes'

/** Per sport: the words and the columns. `cols` are the round columns between Playoffs and the champion column. */
export const CHAMPIONSHIP = {
  mlb: {
    icon: '🏆',
    foldId: 'october',
    foldTitle: '🏆 October odds',
    foldMeta: 'playoff field and a World Series pick, simulated',
    trophy: 'World Series',
    champion: 'win_world_series', championLabel: 'Series', championTitle: 'Win the World Series',
    cols: [
      { field: 'win_division', label: 'Division', title: 'Win the division' },
      { field: 'win_league', label: 'Pennant', title: 'Win the league pennant' },
    ],
    fieldSize: 12, fieldWord: 'twelve',
    teamMark: 'mlb',
    liveStandings: true,      // the league's own standings feed, read live in the browser (PennantRace.js)
    tableAccent: null,        // MOONSHOT's table keeps its own default
    shownMax: 16, previewRows: 16,
    captionWords: 'Playoff, pennant and World Series',
    notePx: 9.5, tagPx: 9, recordW: 54,   // MOONSHOT's panel is drawn exactly as it was
    strictSum: false,
    reality: 'A 15–20% favourite is what a real baseball October looks like. The best team usually does not win it — that is the sport, not a weakness in the number.',
    empty: 'No playoff odds yet. They fill in with the next update.',
  },
  nfl: {
    icon: '🏆',
    foldId: 'super-bowl',
    foldTitle: '🏆 Super Bowl odds',
    foldMeta: 'playoff field and a Super Bowl pick, simulated',
    trophy: 'Super Bowl',
    champion: 'win_champion', championLabel: 'Super Bowl', championTitle: 'Win the Super Bowl',
    cols: [
      { field: 'win_division', label: 'Division', title: 'Win the division' },
      { field: 'top_seed', label: 'Top seed', title: 'Finish as the No. 1 seed, the only first-round bye' },
      { field: 'win_round3', label: 'Reach SB', title: 'Win the conference championship and reach the Super Bowl' },
    ],
    fieldSize: 14, fieldWord: 'fourteen',
    teamMark: 'nfl',
    liveStandings: false,
    tableAccent: 'sport',
    shownMax: 20, previewRows: 10,
    captionWords: 'Playoff, conference and Super Bowl',
    notePx: 12, tagPx: 11, recordW: 62,   // the phone floors: 12px reading text, 11px tags
    strictSum: true,
    reality: null,
    empty: null,
  },
  nhl: {
    icon: '🏆',
    foldId: 'stanley-cup',
    foldTitle: '🏆 Stanley Cup odds',
    foldMeta: 'playoff field and a Cup pick, simulated',
    trophy: 'Stanley Cup',
    champion: 'win_champion', championLabel: 'Cup', championTitle: 'Win the Stanley Cup',
    cols: [
      { field: 'win_division', label: 'Division', title: 'Win the division' },
      { field: 'win_round1', label: 'Rd 2', title: 'Win the first round' },
      { field: 'win_round2', label: 'Rd 3', title: 'Win the second round and reach the conference final' },
      { field: 'win_round3', label: 'Final', title: 'Win the conference final and reach the Stanley Cup Final' },
    ],
    fieldSize: 16, fieldWord: 'sixteen',
    teamMark: 'nhl',
    liveStandings: false,
    tableAccent: 'sport',
    shownMax: 24, previewRows: 10,
    captionWords: 'Playoff, round-by-round and Stanley Cup',
    notePx: 12, tagPx: 11, recordW: 70,
    strictSum: true,
    reality: null,
    empty: null,
  },
  nba: {
    icon: '🏆',
    foldId: 'nba-title',
    // built on the site, not by the bot (2026-10-20): lib/nba/titleSim.js; the first build of a day reads 60 club schedules, so it may take a while
    source: '/api/buckets/championship', sourceTimeoutMs: 45000,
    foldTitle: '🏆 Title odds',
    foldMeta: 'play-in, playoff field and a champion, simulated',
    trophy: 'NBA title',
    champion: 'win_champion', championLabel: 'Title', championTitle: 'Win the NBA title',
    cols: [
      { field: 'top_seed', label: 'Top seed', title: 'Finish as the No. 1 seed in the conference' },
      { field: 'win_round1', label: 'Rd 2', title: 'Win the first round' },
      { field: 'win_round2', label: 'Rd 3', title: 'Win the second round and reach the conference final' },
      { field: 'win_round3', label: 'Finals', title: 'Win the conference final and reach the Finals' },
    ],
    fieldSize: 16, fieldWord: 'sixteen',
    teamMark: 'nba',
    liveStandings: false,
    tableAccent: 'sport',
    shownMax: 24, previewRows: 10,
    captionWords: 'Playoff, round-by-round and title',
    notePx: 12, tagPx: 11, recordW: 62,
    strictSum: true,
    reality: null,
    empty: null,
  },
}

export const championshipConfig = (sport) => CHAMPIONSHIP[sportKey(sport)]

/** A share as a number the way the panel prints it. Below 1% it says "<1%" (at 10,000 simulations the
 *  difference between 0.4% and 0.9% is noise); at the top it says ">99%" and never rounds a team that is
 *  not locked up to a sure thing. A zero is a dash. */
export function sharePct(v) {
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) return '—'
  if (n < 0.01) return '<1%'
  if (n >= 1) return '100%'
  if (n >= 0.995) return '>99%'
  return `${Math.round(n * 100)}%`
}

const isShare = (v) => v == null || (Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) <= 1.0001)

export const EMPTY_CHAMPIONSHIP = Object.freeze({ ok: false, teams: [], sims: 0, season: null, asOf: null, method: '', note: '', modelVersion: '' })

/** Validate and normalise one sport's file. Anything that does not look right is the EMPTY state, never a guess:
 *  no method line, shares outside 0-1 (a percent written as a share), no teams, or (new sports) champion shares that
 *  do not add to about one. */
export function readChampionship(sport, j) {
  const cfg = championshipConfig(sport)
  if (!j || typeof j !== 'object' || !Array.isArray(j.teams) || !j.teams.length) return EMPTY_CHAMPIONSHIP
  const method = typeof j.method === 'string' ? j.method.trim() : ''
  if (!method) return EMPTY_CHAMPIONSHIP
  const sims = Number(j.sims)
  if (!Number.isFinite(sims) || sims <= 0) return EMPTY_CHAMPIONSHIP
  const share = [cfg.champion, 'make_playoffs', 'win_division', 'top_seed', ...cfg.cols.map((c) => c.field)]
  const teams = j.teams.filter((t) => t && typeof t === 'object' && t.team_id != null && Number.isFinite(Number(t[cfg.champion])) && Number.isFinite(Number(t.make_playoffs)))
  if (!teams.length) return EMPTY_CHAMPIONSHIP
  for (const t of teams) for (const f of share) if (!isShare(t[f])) return EMPTY_CHAMPIONSHIP
  if (cfg.strictSum) {
    const total = teams.reduce((a, t) => a + Number(t[cfg.champion]), 0)
    if (total < 0.95 || total > 1.05) return EMPTY_CHAMPIONSHIP
  }
  return {
    ok: true,
    teams,
    sims,
    season: Number(j.season) || null,
    asOf: j.as_of || j.built_at || null,
    method,
    note: typeof j.note === 'string' ? j.note.trim() : '',
    modelVersion: typeof j.model_version === 'string' ? j.model_version : '',
  }
}

// One fetch per sport per page load. The fold wrapper (does the file exist at all?) and the panel inside it
// ask the same question; the answer is shared. Failures are remembered too, so a missing file costs one request.
const CACHE = new Map()
export function loadChampionship(sport) {
  const k = sportKey(sport)
  if (!CACHE.has(k)) {
    // a sport whose odds are built on the site names its route in the registry (`source`); the rest read the bot's file
    const cfg = CHAMPIONSHIP[k]
    CACHE.set(k, fetchJSON(cfg?.source ? [cfg.source] : championshipPaths(k), null, { timeoutMs: cfg?.sourceTimeoutMs || 8000 })
      .then((j) => readChampionship(k, j))
      .catch(() => EMPTY_CHAMPIONSHIP))
  }
  return CACHE.get(k)
}
/** Forget the cached answer (a manual refresh, a test). */
export const resetChampionshipCache = () => CACHE.clear()
