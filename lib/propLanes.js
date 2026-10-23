// 🧭 THE PROP LANES, ONE LIST PER SPORT (2026-10-22, Donovan: "We need to have a core system. I didn't build this to be all over the
// place." Decision: claude/CORE-LANES-2026-10-22.txt). Every prop lane a sport has is written ONCE here: its key, its words,
// its lines, the bar its board calls, and how to read it off a game-log row and off a live line. Everything else reads this:
//   MOONSHOT  lib/gamelogs MARKETS · components/ThresholdGrid (lines, words, values) · lib/liveStatus MLB_LANES
//   TUDDY     lib/nfl/theme MARKETS + MARKET_SHORT · components/nfl/HitRate PRESETS + STAT_KEY · lib/liveStatus NFL_UNIT
//   LAMP      lib/nhl/goalLog GOAL_MARKETS · lib/liveStatus NHL_LANE (units and bars)
//   BUCKETS   components/buckets/PlayerBars MARKETS · lib/liveStatus NBA_LANE   (lib/nba/model NBA_MARKETS keeps its versions and
//             legs; its bars are checked against these by scripts/check-prop-lanes.mjs)
// A new lane is one entry here. scripts/check-prop-lanes.mjs holds every reader to what it produced before this file existed.
// Pure data and accessors: no fetch, no React. Lane `core` (CORE-LANES): scorer · volume · firsts · opening · game.
import { tensIn } from './nba/ddtd'

const sumHrr = (g) => g.h + g.r + g.rbi

export const PROP_LANES = {
  // MOONSHOT · game-log rows are lib/gamelogs thresholdRates rows (h, tb, hr, r, rbi, bb, k); live lines are lib/liveSlate lines
  mlb: [
    { key: 'hit', word: 'Hit', label: '1+ Hit', unit: 'H', core: 'volume', lines: [1, 2], bar: 1, stat: (g) => g.h, live: (l) => l.h },
    { key: 'tb2', word: 'TB', label: '2+ TB', unit: 'TB', core: 'volume', lines: [2, 3, 4], bar: 2, stat: (g) => g.tb, live: (l) => l.tb },
    { key: 'hr', word: 'HR', label: '1+ HR', unit: 'HR', core: 'scorer', lines: [1, 2], bar: 1, stat: (g) => g.hr, live: (l) => l.hr },
    // HRR = hits + runs + RBI, the book's "H+R+RBI" and the bot's HRR pick category; the board calls it at 2+
    { key: 'hrr', word: 'HRR', label: '1+ HRR', unit: 'H+R+RBI', core: 'volume', lines: [1, 2, 3], bar: 2, stat: sumHrr, live: (l) => (l.h || 0) + (l.r || 0) + (l.rbi || 0) },
    { key: 'run', word: 'Run', label: '1+ Run', unit: 'R', core: 'volume', lines: [1, 2], bar: 1, stat: (g) => g.r },
    { key: 'rbi', word: 'RBI', label: '1+ RBI', unit: 'RBI', core: 'volume', lines: [1, 2], bar: 1, stat: (g) => g.rbi },
    { key: 'bb', word: 'BB', label: '1+ BB', unit: 'BB', core: 'volume', lines: [1, 2], bar: 1, stat: (g) => g.bb },
    // K reads INVERTED from every other lane (the pitcher's prop): the grid shades it the same, the read flips
    { key: 'k1', word: 'K', label: '1+ K', unit: 'K', core: 'volume', lines: [1, 2], bar: 1, stat: (g) => g.k },
  ],
  // TUDDY · board order; stat = the player file's game-log field (g_*); presets = the line chips; unit = the live cell's word.
  // TD2 is the board's 2+ TD lane: live only (not in MARKETS). DEF_TD is the v1 team-defense lane: no player log, no live count.
  // Mirrors MARKETS in the bot's nfl_scoring.py (add one there, add it here). DEF_TD (2026-09-21, Donovan: "everyone ranked ...
  // and special teams and defense") is nfl_scoring.py's V1_MODELS: one real component (each team's trailing def + return TDs),
  // flagged "v1" in the payload and on Boards; pos is Team DEF, never an individual defender.
  nfl: [
    { key: 'TD', label: 'Anytime TD', note: '1+ rush or rec TD', short: 'ANY TD', core: 'scorer', stat: 'g_td', presets: [0.5], unit: 'TD' },
    { key: 'REC_YDS', label: 'Receiving yards', note: 'default bar 40', short: 'REC YDS', core: 'volume', stat: 'g_recyd', presets: [24.5, 59.5, 99.5], unit: 'YDS' },
    { key: 'REC', label: 'Receptions', note: 'default bar 4', short: 'REC', core: 'volume', stat: 'g_rec', presets: [2.5, 3.5, 4.5, 6.5], unit: 'REC' },
    { key: 'RUSH_YDS', label: 'Rushing yards', note: 'default bar 50', short: 'RUSH YDS', core: 'volume', stat: 'g_ruyd', presets: [49.5, 79.5, 99.5], unit: 'YDS' },
    { key: 'RUSH_ATT', label: 'Rush attempts', note: 'default bar 12', short: 'RUSH ATT', core: 'volume', stat: 'g_car', presets: [9.5, 11.5, 14.5], unit: 'ATT' },
    { key: 'PASS_YDS', label: 'Passing yards', note: 'default bar 225', short: 'PASS YDS', core: 'volume', stat: 'g_payd', presets: [224.5, 274.5, 299.5], unit: 'YDS' },
    { key: 'KICK_PTS', label: 'Kicking points', note: 'FG×3 + PAT, bar 6', short: 'KICK PTS', core: 'volume', stat: 'g_kick', presets: [5.5, 8.5], unit: 'PTS' },
    { key: 'DEF_TD', label: 'Defense/ST TD', note: '1+ def or return TD', short: 'DEF TD', core: 'scorer', stat: null, presets: null, unit: null },
    { key: 'TD2', label: '2+ TD', liveOnly: true, core: 'scorer', unit: 'TD' },
  ],
  // LAMP · stat = the game-log row's field (lib/nhl/goalLog rows); one = the singular word; lines + first = the bar chips.
  // live = the live cell's key, unit and bar (counted off the game's goal list in lib/liveStatus, SOG off the graded value)
  nhl: [
    { key: 'g', label: 'Goals', one: 'goal', core: 'scorer', stat: 'g', lines: [1, 2], first: 1, live: [['GOAL', 'G', 1], ['G2', 'G', 2]] },
    { key: 'sog', label: 'Shots', one: 'shot', core: 'volume', stat: 'shots', lines: [2, 3, 4], first: 2, live: [['SOG', 'SOG', 3]] },
    { key: 'pts', label: 'Points', one: 'point', core: 'volume', stat: 'pts', lines: [1, 2], first: 1, live: [['PTS', 'PTS', 1]] },
    { key: 'a', label: 'Assists', one: 'assist', core: 'volume', stat: 'a', lines: [1, 2], first: 1, live: [['AST', 'A', 1]] },
    { key: 'ppp', label: 'PP points', one: 'PP point', core: 'volume', stat: 'ppp', lines: [1], first: 1 },
  ],
  // BUCKETS · bar = the board's call (lib/nba/model NBA_MARKETS); lines + first = the bar chart's chips; stat = the game-log
  // row (ESPN log: pts, reb, ast, tpm, tpa); live = the /api/buckets/live box line; chance = the hollow bar behind (3PA)
  nba: [
    { key: 'pts', label: 'PTS', unit: 'PTS', core: 'volume', bar: 25, lines: [10, 15, 20, 25, 30], first: 15, rank: 'pts', stat: (g) => g.pts, live: (b) => b.pts },
    { key: 'reb', label: 'REB', unit: 'REB', core: 'volume', bar: 10, lines: [4, 6, 8, 10], first: 6, rank: 'reb', stat: (g) => g.reb, live: (b) => b.reb },
    { key: 'ast', label: 'AST', unit: 'AST', core: 'volume', bar: 8, lines: [3, 5, 8], first: 5, rank: 'ast', stat: (g) => g.ast, live: (b) => b.ast },
    { key: '3pm', label: '3PM', unit: '3PM', core: 'volume', bar: 4, lines: [1, 2, 3, 4], first: 2, rank: 'tpm', stat: (g) => g.tpm, chance: (g) => g.tpa, live: (b) => b.tpm },
    { key: 'pra', label: 'PRA', unit: 'PRA', core: 'volume', bar: 35, lines: [20, 25, 30, 35, 40], first: 25, rank: 'pra',
      stat: (g) => (g.pts == null ? null : (g.pts ?? 0) + (g.reb ?? 0) + (g.ast ?? 0)), live: (b) => (b.pts == null ? null : b.pts + (b.reb || 0) + (b.ast || 0)) },
    { key: 'dd', label: 'DD', unit: '10+', core: 'volume', bar: 2, lines: [2], first: 2, word: 'cats at 10+', stat: (g) => tensIn(g), live: (b) => b.tens },
    { key: 'td', label: 'TD', unit: '10+', core: 'volume', bar: 3, lines: [3], first: 3, word: 'cats at 10+', stat: (g) => tensIn(g), live: (b) => b.tens },
    { key: 'first', label: 'FIRST BASKET', core: 'firsts', bar: null, board: true, bars: false },
  ],
}

/** One sport's prop lanes, in order. (Not lib/lanes.js: that file is MOONSHOT's PICKS / BOARD / RATED lanes.) */
export const propLanesOf = (sport) => PROP_LANES[sport] || []
/** One prop lane by key (null when the sport has no such lane). */
export const propLane = (sport, key) => propLanesOf(sport).find((l) => l.key === key) || null

// MOONSHOT's BOARD LANES (the call lanes the live cell reads): board key -> [registry lane, bar override]
export const MLB_BOARD_LANES = { hr: ['hr'], top: ['hr'], hr2: ['hr', 2], hit: ['hit'], hrr: ['hrr'], contact: ['tb2'], tb: ['tb2'] }
