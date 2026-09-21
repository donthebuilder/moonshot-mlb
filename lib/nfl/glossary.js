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
  // ── the player file (2026-09-21) ──────────────────────────────────────
  // Three facts every player row publishes and the card never showed.
  'since last td': 'How many games he has played since the last one he scored in, counted back from his most recent game. 0 means he scored last time out. When the count equals every game we have logged for him, he has not scored in any of them — the card says so rather than printing a number that reads like a drought after a score.',
  'season td': 'Touchdowns he has actually scored this season, from the same game logs the hit-rate chart is drawn from.',
  'logged games': 'How many games of his we hold play-by-play for. Every rate and hit-rate on this card is measured over these games and no others.',
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
  'line': 'The number the streak is counted against. It starts at the bot\u2019s own bar and you can move it — the streak recounts against whatever you pick, which is the point of the page.',
  'streak': 'Consecutive games on the same side of the line, most recent first. It breaks the moment one game lands on the other side.',
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
  // ── the grading vocabulary (The record, Picks) ────────────────────────
  // These are OUR words, not the sport's, which is exactly why they need
  // definitions: a fan knows what a touchdown is and has no reason to know
  // what this site means by a rung.
  'rungs': 'How many published picks are behind a number. Each market publishes five a week, so five rungs is one market, thirty-five is a full week.',
  'clear %': 'The share of graded picks that beat their bar. Void picks are left out, because a scratch says nothing about the model.',
  'graded': 'When the result was locked in. Nothing is regraded after the fact.',
  'market': 'Which of the seven the pick was made for — anytime TD, receiving yards, and so on. Each grades against its own bar.',
  'actual': 'What he actually did in that market, against the bar the pick was made at.',
  'result': 'Hit, miss, or void. Void means there was no line at all — cut, inactive or a bye.',
  'td score': 'Where he sits on this week\u2019s touchdown board. Higher ranks better.',
  'td sc 1': 'The touchdown score of the first man in the pair.',
  'td sc 2': 'The touchdown score of the second man in the pair.',
  'status': 'Where this pick stands right now — still live, already cleared, or out of reach.',

  // ── pairs ─────────────────────────────────────────────────────────────
  'weaker': 'The lower of the two scores in the pair. A pair is only as good as its weaker leg, so this is the number to read first.',
  'gap': 'The distance between the two legs. A wide gap means one strong name carrying one weak one, which is a different bet from two solid ones.',
  'qb pass yds': 'The quarterback\u2019s passing-yards score in this stack.',
  'wr/te rec yds': 'The receiver\u2019s receiving-yards score in this stack.',

  // ── explosive plays ───────────────────────────────────────────────────
  'yds': 'Yards.',
  '10+': 'Plays of 10 yards or more. Higher is better.',
  '30+': 'Plays of 30 yards or more. Higher is better.',
  '40+': 'Plays of 40 yards or more — the game-breakers. Higher is better.',
  'air yds': 'Air yards — how far downfield the ball travels before it is touched, added up. It separates a deep passing game from a short one.',
  'lng': 'His longest play of the season, in yards.',
  'lng td': 'His longest touchdown of the season, in yards.',
  'avg depth': 'Average depth of target — how far past the line of scrimmage the ball is thrown to him, on average. It describes his role, not his quality.',
  'exp%': 'The share of plays that went for 20 yards or more. For a defense, lower is better; for an offense, higher.',
  'deep att': 'Passes thrown 20 or more yards downfield.',
  'deep cmp%': 'The share of those deep passes that were completed. Higher is better for an offense, lower for the defense facing it.',
  'deep td': 'Touchdowns thrown 20 or more yards downfield.',

  // ── the slate ─────────────────────────────────────────────────────────
  'signal': 'What the model noticed about this game worth a look — a soft matchup, a scoring environment, a role change.',
  'matchup': 'The two sides and what the model makes of the meeting.',
  // ── the score breakdown's own labels ──────────────────────────────────
  // components/nfl/ScoreAnatomy.js prints lib/nfl/scoreLabels.js's LABELS in
  // its legend -- "WOPR (opportunity)", "RYOE per attempt (NGS)" -- and those
  // exact strings are what a reader taps. Keyed verbatim rather than matched
  // fuzzily, so a label change is a visible break here instead of a dot that
  // silently stops appearing.
  //
  // scoreLabels.js's WHY already says why each one HELPS ("commands a huge
  // share of his team's targets and air yards"). That is an argument inside a
  // sentence. This is the definition you tap when you do not know the word.
  'wopr (opportunity)': 'One number for how much of the passing game belongs to him, combining his share of the targets with his share of the air yards. Higher is better.',
  'ryoe per attempt (ngs)': 'Rushing yards over expected, per carry — how much more ground he makes than a back in his shoes usually would against that front. Above zero is better.',
  'red-zone touches': 'Carries and targets inside the opponent\u2019s 20, where drives turn into points. Higher is better.',
  'goal-line opportunity': 'Carries inside the 5 and targets inside the 10 — the shortest scoring chances there are. Higher is better.',
  'air yards (depth)': 'How far downfield the ball travels before he touches it. It describes how he is used, not how good he is.',
  'expected tds': 'How many touchdowns the chances he got usually turn into, from where they happened on the field. It says what the opportunity was worth, not what he did with it.',
  'touches (carries + targets)': 'Every time the ball is meant for him, running or throwing. The plainest measure of whether the offense goes through him. Higher is better.',
  'receptions form': 'How many catches he has been making lately, not across the whole season.',
  'receiving yards form': 'His receiving yardage lately, not across the whole season.',
  'rushing yards form': 'His rushing yardage lately, not across the whole season.',
  'passing yards form': 'His passing yardage lately, not across the whole season.',
  'pass attempts': 'How often he throws it. Volume, before anything about accuracy.',
  'carries': 'Handoffs he actually gets. The steadiest thing a running back does.',
  'targets': 'Passes thrown his way, caught or not.',
  'red-zone carries': 'Handoffs inside the opponent\u2019s 20. Higher is better.',
  'defense pass softness': 'How much this defense has been giving up through the air. Higher means a softer matchup for a passer or receiver.',
  'defense td softness': 'How many touchdowns this defense has been giving up. Higher means a softer matchup.',
  'team fg-drive rate': 'How often his offense\u2019s drives end in a field-goal attempt — moving the ball and then stalling, which is what pays a kicker.',
  'team rz td rate (inverted)': 'How often his offense finishes a red-zone trip with a touchdown, counted upside-down because for a KICKER the stalled drives are the ones he kicks on. A low finishing rate scores high here.',
  'team red-zone td rate': 'How often his offense finishes a red-zone trip with a touchdown. For a kicker, LOWER is better: the drives that stall are the ones he kicks on.',
  'team drives': 'How many possessions his offense runs in a game. More drives, more chances for everyone on it.',
  'fg attempts': 'How many field goals he is asked to kick.',
  'kicking environment': 'Whether he is kicking indoors or in wind. It describes the conditions, not the kicker.',
  'td regression (due)': 'The gap between the chances he has had and the touchdowns he has actually scored. It is a description of the gap, not a claim that it closes — measured against the archive this term made the touchdown model worse and was zeroed out of it on 2026-09-14.',
}
