// THE WORDS OF EACH SPORT'S OPENINGS PAGE (2026-10-26): what "the jump" is, what "scores first" is called, which windows the sport stores.
// One table, read by the shared tab (components/openings/OpeningsTab.js) for LAMP and TUDDY. Counts and rates of what happened, never a
// chance.
export const OPENING_WORDS = {
  nhl: {
    sport: 'nhl', eyebrow: 'LAMP · OPENINGS', title: 'The faceoff, the first goal, the first period',
    note: 'What happened in the opening of every game. The first goal, who scores it, and how fast. Counts, not a chance.',
    jumpLabel: 'FACEOFF %', jumpTitle: 'How often the club won the opening faceoff', jumpStat: 'Wins the faceoff',
    firstLabel: '1ST GOAL %', firstTitle: 'How often the club scored the game’s first goal', firstStat: 'Scores first', firstWord: 'First goal',
    afterLabel: 'AFTER FACEOFF %', afterTitle: 'How often they scored first in games they won the opening faceoff', afterStat: 'First, after the faceoff',
    afterLostLabel: 'IF LOST %', afterLostTitle: 'How often they scored first in games they lost the opening faceoff', afterLostStat: 'First, after losing it',
    leagueStat: 'Faceoff winner scores first',
    shotsLabel: 'SHOTS TO 1ST', shotsTitle: 'Their shots on goal before the game’s first goal (that goal counts), a game; fewer is quicker', shotsStat: 'Shots to 1st goal',
    windows: [['w1', 'First 5 min', '5 MIN'], ['w2', 'First 10 min', '10 MIN'], ['p1', 'Period 1', 'P1']],
    scorersTitle: 'WHO SCORES FIRST MOST', scorersNote: 'Skaters ranked by first goals of the game. Share = of his club’s games on file.',
    wall: { ring: 'faceoff', first: 'Scored the first goal', other: 'They scored it', both: 'First goal + opening faceoff', wasted: 'Won the faceoff, not the goal', none: 'Neither' },
    wallTitle: 'First goal · by game', gameWord: 'Tonight', typeLabel: 'BY SHOT', lastOptions: ['10', '20'],
  },
  nfl: {
    sport: 'nfl', eyebrow: 'TUDDY · OPENINGS', title: 'The opening drive, the first touchdown, the first quarter',
    note: 'What happened in the opening of every game. Who gets the ball, who scores the first touchdown, and how many plays it takes. Counts, not a chance.',
    jumpLabel: 'BALL 1ST %', jumpTitle: 'How often the club got the ball to open the game', jumpStat: 'Gets the ball first',
    firstLabel: '1ST TD %', firstTitle: 'How often the club scored the game’s first touchdown', firstStat: 'Scores first TD', firstWord: 'First TD',
    afterLabel: 'AFTER BALL %', afterTitle: 'How often they scored the first touchdown in games they got the ball first', afterStat: 'First TD, after the ball',
    afterLostLabel: 'IF NOT %', afterLostTitle: 'How often they scored the first touchdown in games the other club got the ball first', afterLostStat: 'First TD, if the other club had the ball',
    leagueStat: 'Club with the ball first scores the first TD',
    shotsLabel: 'PLAYS TO 1ST', shotsTitle: 'Their scrimmage plays before the game’s first touchdown (that play counts), a game; fewer is quicker', shotsStat: 'Plays to 1st TD',
    windows: [['p1', 'Quarter 1', 'Q1']],
    scorersTitle: 'WHO SCORES FIRST MOST', scorersNote: 'Players ranked by first touchdowns of the game. Share = of his club’s games on file.',
    wall: { ring: null, first: 'Scored the first TD', other: 'They scored it' },
    wallTitle: 'First TD · by game', gameWord: 'This week', typeLabel: 'BY TD TYPE', lastOptions: ['5', '10'],
  },
}
