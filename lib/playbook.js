// THE PLAYBOOK (2026-09-30, BATCH-PLAYBOOK P1): how to research a pick with
// DASH, one page per market. Teaches the workflow -- FIND -> VERIFY ->
// INVESTIGATE -> MATCHUP -> DECIDE -- in the site's own words, so the page is
// useful even on a night the call misses. Core line, everywhere:
//   "Use the board to find the player. Use the data to understand the
//    player. You make the read."
//
// RULES. Every stop says what to open, what to look at, what it tells you and
// what it does NOT. No numbers live in this file: a stop that wants one links
// to the page that prints it (the record, the board). Links are built from
// lib/routes.js (appHref / playerHref), never typed as a hash; a stop that
// needs a player links to tonight's real #1 when the page has one (`ex`),
// else to the board. The words CALLED / ON THE BOARD are lib/callStatus.js's.
import { appHref, playerHref } from './routes'

export const CORE_LINE = 'Use the board to find the player. Use the data to understand the player. You make the read.'
export const STEPS = ['FIND', 'VERIFY', 'INVESTIGATE', 'MATCHUP', 'DECIDE']

const mlbCard = (ex, view = '') => (ex?.id != null ? `${playerHref('mlb', ex.id)}${view ? `&view=${view}` : ''}` : appHref('mlb', 'fullboard'))
const nflFile = (ex, extra = '') => (ex?.id != null ? `${playerHref('nfl', ex.id)}${extra}` : appHref('nfl', 'players'))
const nhlFile = (ex) => (ex?.id != null ? playerHref('nhl', ex.id) : appHref('nhl', 'players'))
const exName = (ex, fallback) => (ex?.name ? `${ex.name}'s` : fallback)

// The shared MLB walk-through; each market only changes its board lens, its
// bar and the stat that matters on the card.
function mlbStops({ ex, lens, bar, cardLook, evLook, matchLook }) {
  return [
    { step: 'FIND', title: 'The board', open: { label: lens === 'The Board' ? 'Open The Board' : `Open the board, then the ${lens} lens`, href: appHref('mlb', lens === 'The Board' ? 'fullboard' : 'board') },
      look: `Every rated hitter tonight, ranked. The ${lens === 'The Board' ? 'rank' : `${lens} score`} puts the pool in order; the WHY column (desktop) or the card's WHY block (phone) says in numbers why a name is up there.`,
      tells: 'Who the model rates highest tonight, and the two or three published numbers behind each name.',
      not: "That #1 is a lock. It's a ranking of tonight's pool, not a promise. Don't take the top name on sight." },
    { step: 'VERIFY', title: 'The record', open: { label: 'Open the public record', href: '/called?sport=mlb' },
      look: `How this market's calls have done against their bar (${bar}): every night graded in public, hits and misses, with the number of nights next to every rate.`,
      tells: 'What the board has actually done, and over how many nights.',
      not: 'What happens tonight. A rate over a handful of nights is a handful of nights; read the n before the percentage.' },
    { step: 'INVESTIGATE', title: 'The player card', open: { label: ex?.name ? `Open ${ex.name}'s card` : 'Open a card from the board', href: mlbCard(ex) },
      look: cardLook,
      tells: 'Who he is tonight: his role on the board (CALLED or ON THE BOARD), his recent line, and why the model rates him.',
      not: 'How the game goes. The card is the evidence, not the outcome.' },
    { step: 'INVESTIGATE', title: 'The EV log', open: { label: `Open ${exName(ex, 'his')} EV log`, href: mlbCard(ex, 'ev') },
      look: evLook,
      tells: 'Whether the contact under the numbers is real: how hard and how far he has been hitting it lately.',
      not: 'That hard contact turns into a result tonight. A loud ball caught at the wall still counts as an out.' },
    { step: 'MATCHUP', title: 'Pitch mix and matchup', open: { label: `Open ${exName(ex, 'his')} pitch tab`, href: mlbCard(ex, 'pitch') },
      look: matchLook,
      tells: "What tonight's starter throws against what this hitter does damage on, plus the park and the hand he faces.",
      not: 'How long the starter lasts, or who comes out of the bullpen.' },
    { step: 'DECIDE', title: 'Your read', open: { label: 'Back to the board', href: appHref('mlb', 'fullboard') },
      look: 'Put the four stops together. Do the board, the record, the card and the matchup tell the same story, or does one of them argue against it? The WATCH line on a card is the number that argues against him.',
      tells: "DASH gives you the information, in the order a researcher would read it.",
      not: 'The decision. That part is yours.' },
  ]
}

export const PLAYBOOKS = {
  hr: {
    sport: 'mlb', product: 'MOONSHOT', market: 'home run', title: 'How to research a home run',
    lede: 'Six stops, the order a researcher reads them in. The board finds the name; the card, the EV log and the matchup tell you whether to believe it.',
    stops: (ex) => mlbStops({
      ex, lens: 'The Board', bar: '1+ HR',
      cardLook: 'The verdict at the top, the stat strip (barrel rate, ISO, fly balls, the starter\'s HR/9, the park, exit velo), the home-run boxes for his last 5 and 10 games and the season, and the WHY / WATCH block.',
      evLook: 'Every recent batted ball: exit velocity, launch angle, distance, and which ones left the park.',
      matchLook: 'The starter\'s mix by pitch type beside what this hitter does against each type; the park\'s home-run factor; which hand he faces.',
    }),
  },
  hit: {
    sport: 'mlb', product: 'MOONSHOT', market: 'hit', title: 'How to find a hit',
    lede: 'Same frame as a home run, a different bar: one hit. Contact and the matchup matter more than raw power here.',
    stops: (ex) => mlbStops({
      ex, lens: 'Hits', bar: '1+ hit',
      cardLook: 'His slash line and stat strip, the hit-rate boxes, and his strikeout rate (the board\'s K% column; a high one shows up as his WATCH line).',
      evLook: 'How often he puts the ball in play hard. Line drives and hard grounders find holes; weak contact and strikeouts don\'t.',
      matchLook: 'The starter\'s strikeout rate and swinging-strike rate (the WATCH line flags a bat-missing arm), and the hitter\'s average against this hand.',
    }),
  },
  hrr: {
    sport: 'mlb', product: 'MOONSHOT', market: 'hits + runs + RBI', title: 'How to research hits + runs + RBI',
    lede: 'HRR counts hits, runs and runs batted in together; the bar is 2+. Where he bats in the lineup matters as much as how he hits.',
    stops: (ex) => mlbStops({
      ex, lens: 'HRR', bar: '2+ H+R+RBI',
      cardLook: 'His lineup spot (the # beside his team at the top of the card) and his recent runs and RBI (the HRR box in The Four prints them for its #1).',
      evLook: 'Recent hard contact. Extra-base hits score runners and score him.',
      matchLook: 'The starter\'s numbers against the whole lineup, not just this hitter: HRR needs teammates on base and behind him.',
    }),
  },
  bases: {
    sport: 'mlb', product: 'MOONSHOT', market: 'total bases', title: 'How to research 2+ total bases',
    lede: 'The Contact call: 2+ total bases. A double clears it alone; so do two singles. Contact plus some pop.',
    stops: (ex) => mlbStops({
      ex, lens: 'Contact', bar: '2+ TB',
      cardLook: 'His slash line (slugging is the third number), the stat strip, and the hand he faces (at the top of the card).',
      evLook: 'Balls hit hard into the gaps as well as over the fence. Distance and exit velocity both count.',
      matchLook: 'Whether the starter gets hit hard: the board\'s P HH% and P Brl% columns (hard-hit and barrel rate allowed), and the park.',
    }),
  },
  td: {
    sport: 'nfl', product: 'TUDDY', market: 'touchdown', title: 'How to research a touchdown',
    lede: 'Touchdowns follow opportunity: who gets the ball near the goal line, how often, and against whom.',
    stops: (ex) => [
      { step: 'FIND', title: 'The Six', open: { label: 'Open TUDDY tonight', href: appHref('nfl', 'home') },
        look: 'The Six: six markets, three deep, the card\'s calls. The touchdown box leads; its WHY line says what lifts the #1.',
        tells: 'Who the card calls this week, ranked, with the reason in numbers.',
        not: 'That #1 scores. Scores are league rankings, 0-100, not probabilities.' },
      { step: 'VERIFY', title: 'The record', open: { label: 'Open the public record', href: '/called?sport=nfl' },
        look: 'Every touchdown call graded against its bar, week by week, with the weeks counted.',
        tells: 'What the card has done, and over how many weeks.',
        not: 'This week. Early in a season the sample is small; it says so.' },
      { step: 'INVESTIGATE', title: 'The player file', open: { label: ex?.name ? `Open ${ex.name}'s file` : 'Open a player file', href: nflFile(ex) },
        look: 'His stat strip, hit-rate boxes and the card\'s why line; his role and his usage.',
        tells: 'How much of the offence runs through him.',
        not: 'How the game script goes. A blowout changes who touches the ball.' },
      { step: 'INVESTIGATE', title: 'Red zone, role and usage', open: { label: 'Open the red zone', href: appHref('nfl', 'redzone') },
        look: 'Every touch inside the 20, by distance to the goal line; for a receiver, The Field on his file shows every target at its depth.',
        tells: 'Whether he gets the ball where touchdowns happen.',
        not: 'Whether the play call goes to him on the one snap that matters.' },
      { step: 'MATCHUP', title: 'The defence', open: { label: 'Open Matchups', href: appHref('nfl', 'matchups') },
        look: 'Where this week\'s defence gives up yards and touchdowns by zone and by position.',
        tells: 'Whether his role lines up with where the defence is soft.',
        not: 'Injuries and coverage changes made after the numbers were published.' },
      { step: 'DECIDE', title: 'Your read', open: { label: 'Back to The Six', href: appHref('nfl', 'home') },
        look: 'Does the opportunity (red zone, targets, carries) line up with the matchup? If one stop argues against the others, that is the read.',
        tells: 'DASH gives you the information.', not: 'The decision. That part is yours.' },
    ],
  },
  goal: {
    sport: 'nhl', product: 'LAMP', market: 'goal', title: 'How to research a goal',
    lede: 'A goal model with three legs: goals a game, shots on goal a game, ice time. Volume first, then the opponent.',
    stops: (ex) => [
      { step: 'FIND', title: 'The board', open: { label: 'Open the goal board', href: appHref('nhl', 'board') },
        look: 'Three called per game, locked before puck drop. Before a game locks, its rows are a PREVIEW, not a call.',
        tells: 'Who the model calls in each game tonight.',
        not: 'That a called skater scores. Goals are rare; the record says how rare.' },
      { step: 'VERIFY', title: 'The record', open: { label: 'Open the public record', href: '/called?sport=nhl' },
        look: 'Every graded night: who scored, and whether the board had him.',
        tells: 'What the board has done, night by night.',
        not: 'Tonight. A few nights is a few nights.' },
      { step: 'INVESTIGATE', title: 'The player page', open: { label: ex?.name ? `Open ${ex.name}'s page` : 'Open a player page', href: nhlFile(ex) },
        look: 'The board\'s word for him (CALLED / ON THE BOARD), the WHY block (the model\'s three legs, ranked against tonight), his season line and last five games.',
        tells: 'How much he shoots and how much he plays.',
        not: 'Line changes and power-play units made at the morning skate.' },
      { step: 'INVESTIGATE', title: 'Shots, ice time, power play', open: { label: 'Open Power', href: appHref('nhl', 'power') },
        look: 'Who shoots most, who is heating up, who finishes; special teams for power-play time.',
        tells: 'Whether his volume is real and recent.',
        not: 'Shooting luck. A hot finishing run can cool.' },
      { step: 'MATCHUP', title: 'The goalie and the opponent', open: { label: 'Open Matchups', href: appHref('nhl', 'matchups') },
        look: 'Tonight\'s defences ranked by goals allowed: power play against penalty kill, the net, rest.',
        tells: 'Whether the other side gives up chances.',
        not: 'Which goalie starts, until it is confirmed.' },
      { step: 'DECIDE', title: 'Your read', open: { label: 'Back to the board', href: appHref('nhl', 'board') },
        look: 'Volume, minutes and a soft opponent together. If one of them is missing, weigh it.',
        tells: 'DASH gives you the information.', not: 'The decision. That part is yours.' },
    ],
  },
  shots: {
    sport: 'nhl', product: 'LAMP', market: 'shots on goal', title: 'How to research 3+ shots on goal',
    lede: 'The shots board: 3+ shots on goal, three called per game. Shots are volume, so minutes and the opponent\'s shots allowed lead.',
    stops: (ex) => [
      { step: 'FIND', title: 'The shots board', open: { label: 'Open the shots board', href: appHref('nhl', 'shots') },
        look: 'Three called per game for 3+ shots on goal, locked before puck drop.',
        tells: 'Who the model expects to shoot most in each game.',
        not: 'A guarantee. Shots board calls are graded like every other call.' },
      { step: 'VERIFY', title: 'The record', open: { label: 'Open the public record', href: '/called?sport=nhl' },
        look: 'The graded record. The shots board says when it has no graded nights yet.',
        tells: 'What the board has done, with its n.', not: 'Tonight.' },
      { step: 'INVESTIGATE', title: 'The player page', open: { label: ex?.name ? `Open ${ex.name}'s page` : 'Open a player page', href: nhlFile(ex) },
        look: 'Shots a game, ice time and the last five games.', tells: 'His volume.', not: 'Line changes made after the numbers were published.' },
      { step: 'INVESTIGATE', title: 'Shot map', open: { label: 'Open the shot map', href: appHref('nhl', 'shotmap') },
        look: 'Where he shoots from: every attempt on one attacking half.', tells: 'Whether his shots are real chances or volume from the point.', not: 'How tonight\'s defence plays him.' },
      { step: 'MATCHUP', title: 'The opponent', open: { label: 'Open Matchups', href: appHref('nhl', 'matchups') },
        look: 'Matchups ranks tonight\'s defences; the shots board\'s own line prints the opponent\'s shots against per 60.', tells: 'Whether the other side gives up shots.', not: 'Game state. A big lead slows a team down.' },
      { step: 'DECIDE', title: 'Your read', open: { label: 'Back to the shots board', href: appHref('nhl', 'shots') },
        look: 'Minutes, recent volume and the opponent together.', tells: 'DASH gives you the information.', not: 'The decision. That part is yours.' },
    ],
  },
}

export const MARKETS = Object.keys(PLAYBOOKS)
export const SPORT_MARKETS = { mlb: ['hr', 'hit', 'hrr', 'bases'], nfl: ['td'], nhl: ['goal', 'shots'] }
