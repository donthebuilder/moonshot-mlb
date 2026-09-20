// 📖 GLOSSARY-ON-TAP, FOOTBALL EDITION (2026-09-20).
//
// components/Explain.js built this for MOONSHOT and states the problem it
// solves better than a summary would:
//
//   "every explanation on this site lives in a title= attribute, and a title
//    attribute is a HOVER tooltip. Touch devices have no hover. So on a phone
//    -- which is where the owner's Discord says people actually read this --
//    literally every explanation we have written is invisible."
//
// MLB uses that component in eight places including its player card. TUDDY
// used it in exactly one: the tab explainer. Every stat label on the football
// side has been untappable since the product shipped, and the per-game tiles
// on the player card are 23 bare abbreviations -- SEP, YACOE, TDoE, CPOE,
// WOPR -- with no explanation anywhere on the site.
//
// WHAT THIS FILE IS NOT. lib/nfl/scoreLabels.js already holds LABELS (what a
// score component is called) and WHY (a clause saying why it helps: "commands
// a huge share of his team's targets and air yards"). Those are good and this
// does not restate them. A WHY is an argument inside a sentence; a glossary
// entry is a definition you tap when you do not know the word. The overlap is
// deliberate only where a component is ALSO a number people read on its own.
//
// THE RULES, copied from Explain.js's own header because they are what make
// the difference between this and a stats appendix:
//   · one sentence, then "Higher is better" / "Lower is better" if it applies
//   · no jargon inside the definition of the jargon
//   · never claim a number is predictive; say what it measures
//
// Written for someone who watches football and has never heard of Next Gen
// Stats. Not "WOPR -- 1.5 x target share + 0.7 x air yards share". That
// sentence is for people who already know.

// ── A SCORE IS A RANK, NOT A PERCENTAGE ─────────────────────────────────────
// The MLB twin of this line quotes a measured 29% hit rate for its headline
// picks. TUDDY has two graded weeks of its own season, which is not enough to
// quote a rate from and pretending otherwise would be inventing the one number
// this caveat exists to be honest about (#16). So it makes the same point
// without a figure, and the record is one tab away for anyone who wants it.
export const NFL_RANK_NOT_PERCENT =
  'This is a ranking, not a percentage — an 82 sits above a 64, it is not an '
  + '82% chance of anything. What the board has actually hit is on The record.'

// Terms that get NFL_RANK_NOT_PERCENT attached automatically.
export const NFL_SCORE_TERMS = new Set([
  'score', 'tuddy score', 'td score', 'grade', 'moonshot score',
  'anytime td', 'receiving yards', 'receptions', 'rushing yards',
  'rushing attempts', 'passing yards', 'kicking points',
])

export const NFL_GLOSSARY = {
  // ── the seven markets ─────────────────────────────────────────────────
  // Each one says what the bot is ranking FOR and what counts as clearing it.
  'anytime td': 'Ranks the slate on how good this week looks for him to score a touchdown — how often he gets the ball near the end zone, how much his offense is expected to score, and the defense he faces. Clears at 1 touchdown. Higher ranks better.',
  'receiving yards': 'Ranks pass catchers on receiving yardage this week — his share of the targets, how deep they come, and how the defense has handled the pass. Clears at 40 yards. Higher ranks better.',
  'receptions': 'Ranks pass catchers on catches, not yards — the short-and-busy role scores here where the deep threat does not. Clears at 4 catches. Higher ranks better.',
  'rushing yards': 'Ranks runners on ground yardage — volume first, then what he has been doing with it. Clears at 50 yards. Higher ranks better.',
  'rushing attempts': 'Ranks runners on how many times he actually gets handed the ball, which is a steadier thing than what he does with it. Clears at 12 carries. Higher ranks better.',
  'passing yards': 'Ranks quarterbacks on throwing yardage — how much the game is expected to turn into a shootout, how often he throws, and the secondary he faces. Clears at 225 yards. Higher ranks better.',
  'kicking points': 'Ranks kickers on points from field goals and extra points, which needs an offense that moves the ball and then stalls. Clears at 6 points. Higher ranks better.',

  // ── how to read the card ──────────────────────────────────────────────
  'bar': 'The number this market grades against — clear it and the pick hit, miss it and it did not. The same bar for everyone, set by the bot, not by a sportsbook.',
  'score': 'Where he sits on this week’s board for this market. Higher ranks better.',
  'grade': 'A letter for the score, so a board can be read without comparing numbers. A+ is the top band; C+ is the bottom one the bot publishes.',
  'the board': 'Everyone the model surfaced for a market this week, in order. Being on it is not the same as being called — the card is the five it actually picked.',
  'rung': 'One pick on the card. Each market publishes five, ranked, and every one gets graded.',
  'void': 'No line at all — cut, inactive, or on a bye. Left out of the hit rate, because a scratched pick says nothing about the model.',
  'carryover': 'His numbers lean on last season’s per-game baseline, because this season has not given him enough games yet. It clears on its own as he plays.',
  'low sample': 'There is not much football behind this number yet — read it as a hint, not a finding.',
  'watch': 'Saved to your watchlist on this device. Nothing is sent anywhere.',

  // ── the per-game tiles, the worst offenders ───────────────────────────
  // 23 bare abbreviations on the player card with no explanation on the site.
  'tgt': 'Targets — passes thrown his way, caught or not. It measures how often the offense looks for him. Higher is better.',
  'tgt%': 'His share of his team’s targets. A high number means the offense runs through him rather than spreading it around. Higher is better.',
  'target share': 'His share of his team’s targets. A high number means the offense runs through him rather than spreading it around. Higher is better.',
  'rec': 'Catches.',
  'recyd': 'Receiving yards.',
  'airyd': 'Air yards — how far downfield the ball travels before he touches it, added up. It separates a deep threat from a checkdown, whether or not the passes are caught. Higher means he is used further downfield, which is not automatically better.',
  'wopr': 'One number for how much of the passing game belongs to him, combining his share of the targets with his share of the air yards. Higher is better.',
  'sep': 'Separation — how far from the nearest defender he is when the ball arrives, on average, in yards. Higher is better.',
  'yacoe': 'Yards after catch above expectation — yards he makes after the ball is in his hands, compared with what a receiver in that exact spot usually gets. Above zero is better.',
  'car': 'Carries — handoffs he actually got.',
  'ruyd': 'Rushing yards.',
  'ryoe': 'Rushing yards over expected, per carry — how much more ground he makes than a back in his shoes usually would against that front. Above zero is better.',
  'att': 'Pass attempts.',
  'payd': 'Passing yards.',
  'patd': 'Passing touchdowns.',
  'cpoe': 'Completion percentage over expectation — how much more often he completes a pass than the difficulty of his throws calls for. Above zero is better.',
  'td': 'Touchdowns, rushing and receiving together.',
  'xtd': 'Expected touchdowns — how many the chances he got usually turn into, from where they happened on the field. It says what the opportunity was worth, not what he did with it.',
  'tdoe': 'Touchdowns over expected — what he actually scored against what his chances were worth. Above zero means he has finished more than the openings alone explain; below zero means he has not, which is not a promise either way.',
  'rz': 'Red-zone touches — carries and targets inside the opponent’s 20, where drives turn into points. Higher is better.',
  'gl': 'Goal-line opportunity — carries inside the 5 and targets inside the 10, the shortest scoring chances there are. Higher is better.',
  'fgm': 'Field goals made.',
  'pat': 'Extra points made.',
  '20+': 'Plays of 20 yards or more — the explosive ones. Higher is better.',

  // ── matchup vocabulary ────────────────────────────────────────────────
  'dvp': 'Defense vs position — what this defense has allowed to the role your player actually plays, not to his position in general. A WR1 and a fourth receiver are different jobs and this keeps them apart.',
  'rank': 'Where that defense sits among all 32 in what it allows. Rank 1 means it allows the most, which is the softest matchup — the direction a bettor reads.',
  'man': 'Man coverage — a defender assigned to a receiver and following him. Beaten by separation.',
  'zone': 'Zone coverage — defenders guarding an area instead of a man. Beaten by finding the gaps between them.',
  'shell': 'The coverage shape behind the line — Cover 2, Cover 3 and the rest, counted by how many deep defenders there are and who has what.',
  'pressure created': 'How often this defense gets to the quarterback, as a share of the dropbacks it faced. Higher is better for the defense.',
  'pressure allowed': 'How often this team’s own quarterback gets hit or hurried. This is a line read, not a defensive one. Lower is better.',
  'charting': 'Coverage, route and pressure numbers come from league charting, which is published once a year after the season ends. They are real, and they are last season’s.',
  'snap share': 'The share of his offense’s plays he was on the field for. It is the denominator behind everything else — a man on the sideline cannot be targeted. Higher is better.',
  'implied team total': 'How many points the betting market expects his team to score. It is context for how much scoring there is to go around, not a prediction about him.',
  'game total': 'How many points the market expects both teams to score combined. A high one means a game expected to stay open.',
}
