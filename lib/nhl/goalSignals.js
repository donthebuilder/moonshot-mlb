// THE GOAL BOARD'S OWN FACTS FOR ONE SKATER (moved out of components/lamp/GoalCompare.js 2026-10-17 so the compare, the player card's chips and the
// card's Compare read ONE rule): called, and each of the three legs (shots a game, goals a game, ice time) in the top fifth of tonight's board.
// Nothing here is a new model; every test reads a field of a scored board row (lib/nhl/goalModel.js scoreNight).
export const TOP = 80
export const SIGNALS = [
  ['called', 'Called', 'one of the two the board called in his game', (p) => p.status === 'called'],
  ['shots', 'Shooter', `shots per game in the top fifth tonight (${TOP}th percentile+)`, (p) => (p.pct?.shotsPg ?? 0) >= TOP],
  ['goals', 'Finisher', `goals per game in the top fifth tonight (${TOP}th percentile+)`, (p) => (p.pct?.goalsPg ?? 0) >= TOP],
  ['toi', 'Big minutes', `ice time in the top fifth tonight (${TOP}th percentile+)`, (p) => (p.pct?.toi ?? 0) >= TOP],
]
