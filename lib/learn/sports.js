// THE LOOP'S PER-SPORT TABLE (2026-10-12, accuracy loop). Words and shapes only; no number lives here.
// Keys are the registry's (lib/routes.js ALL_SPORT_KEYS): scripts/check-learn.mjs checks they match.
//   unit      the grading unit the Record page counts in
//   markets   [{ key, label, bar, lead }]  one analysis per market, each on its own bar. `lead` is the one the Record page shows first.
//   hidden    BUCKETS stays out of every public surface until Donovan says go; the engine is the same, the loader is not built
//   windowDays  the "this week" the Record page's counts are over (NFL counts its last graded week)
export const LEARN_SPORTS = {
  mlb: {
    name: 'MOONSHOT', unit: 'night', windowDays: 7, producedWord: 'homered',
    markets: [
      { key: 'HR', label: 'Home run', bar: '1+ HR', lead: true },
      { key: 'HIT', label: 'Hit', bar: '1+ hit' },
      { key: 'HRR', label: 'H+R+RBI', bar: '2+ H+R+RBI' },
      { key: 'CONTACT', label: 'Contact', bar: '2+ total bases' },
    ],
  },
  nfl: {
    name: 'TUDDY', unit: 'week', windowDays: 7, producedWord: 'cleared',
    markets: [
      { key: 'TD', label: 'Touchdown', bar: '1+ TD', lead: true },
      { key: 'REC_YDS', label: 'Receiving yards', bar: '40+' },
      { key: 'REC', label: 'Receptions', bar: '4+' },
      { key: 'RUSH_YDS', label: 'Rushing yards', bar: '50+' },
      { key: 'PASS_YDS', label: 'Passing yards', bar: '225+' },
    ],
  },
  nhl: {
    name: 'LAMP', unit: 'night', windowDays: 7, producedWord: 'scored',
    markets: [
      { key: 'GOAL', label: 'Goal', bar: '1+ goal', lead: true },
      { key: 'SOG', label: 'Shots', bar: '3+ shots' },
      { key: 'PTS', label: 'Points', bar: '1+ point', public: false },   // a hidden shadow model: analysed privately, never published
      { key: 'AST', label: 'Assists', bar: '1+ assist', public: false },
    ],
  },
  nba: { name: 'BUCKETS', unit: 'night', windowDays: 7, producedWord: 'cleared', hidden: true, markets: [] },
}

export const learnSport = (sport) => LEARN_SPORTS[String(sport)] || null
