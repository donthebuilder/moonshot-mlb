// 🏒 LAMP's dictionary — what a column header means, in plain words.
//
// Same binding DenseTable uses on the other two products (components/
// Explain.js explainFrom: a column earns a ⓘ by having an entry for its key
// or its label, and nothing else). Only NON-OBVIOUS headers are here —
// Team / GP / W / L stay bare, because a dot on every header is noise on a
// phone (Donovan, 2026-09-20). Standard NHL language first (rule 26).
export const NHL_GLOSSARY = {
  otl: 'Overtime losses. A game lost in overtime or a shootout still earns one point, so it is counted apart from a regulation loss.',
  pts: 'Points. Two for a win, one for an overtime or shootout loss, none for a regulation loss. The standings are ordered by these first.',
  'p%': 'Points percentage — points earned divided by the points available (two per game). Lets teams with different games played be compared.',
  rw: 'Regulation wins — wins inside 60 minutes, no overtime or shootout. The league’s first tiebreaker when two teams have the same points.',
  row: 'Regulation plus overtime wins — every win except a shootout win. The second tiebreaker.',
  gf: 'Goals for — goals the team has scored this season.',
  ga: 'Goals against — goals the team has allowed this season.',
  diff: 'Goal differential — goals for minus goals against. Above zero means the team outscores its opponents over the season.',
  l10: 'The record over the last ten games, written wins-losses-overtime losses.',
  strk: 'The current streak: W3 is three straight wins, L2 two straight losses, OT1 one straight overtime loss.',
  home: 'The team’s record in home games, wins-losses-overtime losses.',
  road: 'The team’s record on the road, wins-losses-overtime losses.',
  sog: 'Shots on goal — shots that would have gone in if the goalie had not stopped them. Blocked shots and shots that miss the net do not count.',
  pp: 'Power play — goals scored on the power play over the power-play chances, written goals/chances.',
  'fo%': 'Faceoff win percentage — the share of faceoffs the team won.',
  pim: 'Penalty minutes — the total minutes of penalties the team took.',
  blk: 'Blocked shots — opponent shot attempts the team’s skaters got in front of.',
  gv: 'Giveaways — times a player handed the puck to the other team by his own mistake.',
  tk: 'Takeaways — times a player took the puck off an opponent.',
  str: 'Strength when the goal was scored: EV is even strength, PP a power play, SH short-handed. EN is an empty-net goal.',
  // ── batch 2: the player file, the roster table, the leaders ──
  '+/-': 'Plus-minus. Up one for every even-strength or short-handed goal his team scores while he is on the ice, down one for every one it allows. Power-play goals do not count.',
  'ppg': 'Power-play goals — goals scored while his team had the man advantage.',
  'ppp': 'Power-play points — goals and assists on the power play.',
  'shg': 'Short-handed goals — scored while his team was killing a penalty.',
  'gwg': 'Game-winning goals — the goal that put his team ahead for good.',
  's': 'Shots on goal — shots that would have gone in without the goalie.',
  's%': 'Shooting percentage — goals divided by shots on goal.',
  'toi': 'Time on ice per game, minutes:seconds. Twenty minutes is a first-line forward or a top-pair defenceman.',
  'gs': 'Games started — games he was the goalie at puck drop, as opposed to coming in from the bench.',
  'gaa': 'Goals-against average — goals allowed per sixty minutes of ice time. Lower is better; under 2.50 is very good.',
  'sv%': 'Save percentage — saves divided by shots faced. .900 is a working goalie, .915 a good season, .925 elite.',
  'sa': 'Shots against — shots on goal he faced.',
  'sv': 'Saves.',
  'so': 'Shutouts — full games with no goals allowed.',
  'dec': 'The decision he was charged with: W, L, or OTL (an overtime or shootout loss).',
  'shifts': 'Shifts per game — how many times he came over the boards.',
  'pos': 'Position: C centre, L left wing, R right wing, D defence, G goalie.',
  'sh': 'Shoots (or, for a goalie, catches): left or right.',
  'age': 'Age today, from his date of birth.',
  wc: 'Wild card. The top three in each division make the playoffs; the next two best records in the conference get in as wild cards.',
}
