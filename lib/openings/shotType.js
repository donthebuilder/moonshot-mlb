// SHOT TYPE, ONE WORD A SPORT (2026-10-26). opening_games.first_att_type / first_score_type hold what the game's first attempt and first
// score WERE, in each sport's own vocabulary, written by that sport's parser (lib/<sport>/openings.js) and read back through
// shotTypeWord() for the page:
//   nba  '3PT' · '2PT Jumper' · 'Layup' · 'Dunk' · 'Hook' · 'Tip'                    (ESPN's play type + text)
//   nhl  the league's own shot type: wrist · snap · slap · backhand · tip-in · deflected · wrap-around · ...
//   nfl  'rush' · 'pass' · 'return'                                                   (what the touchdown was)
//   mlb  the play's result: single · double · triple · home_run · walk · sac_fly ...  (what the first plate appearance / first run was)
// Pure. A play whose type can't be read stays null: never a guess.

const has = (re, s) => re.test(String(s || ''))

/** One ESPN NBA shooting play -> '3PT' | '2PT Jumper' | 'Layup' | 'Dunk' | 'Hook' | 'Tip' | null. */
export function nbaShotType(p) {
  const t = `${p?.type?.text || ''} ${p?.text || ''}`
  if (has(/dunk/i, t)) return 'Dunk'
  if (has(/layup|lay-up|finger roll/i, t)) return 'Layup'
  if (has(/hook/i, t)) return 'Hook'
  if (has(/tip (?:shot|in)|putback|put-back/i, t)) return 'Tip'
  if (Number(p?.pointsAttempted) === 3 || has(/three point/i, t)) return '3PT'
  if (has(/jump|pullup|fadeaway|step ?back|floating|turnaround|bank/i, t)) return '2PT Jumper'
  return null
}

const WORDS = {
  nba: (v) => v,
  nhl: (v) => ({ 'tip-in': 'Tip-in', 'wrap-around': 'Wrap-around' })[v] || (v ? v[0].toUpperCase() + v.slice(1) : null),
  nfl: (v) => ({ rush: 'Rush', pass: 'Pass', return: 'Return' })[v] || null,
  mlb: (v) => ({ home_run: 'Home run', single: 'Single', double: 'Double', triple: 'Triple', walk: 'Walk', sac_fly: 'Sac fly', field_out: 'Out', strikeout: 'Strikeout' })[v] || (v ? String(v).replace(/_/g, ' ').replace(/^./, (c) => c.toUpperCase()) : null),
}

/** The stored word -> the word the page shows, or null. */
export const shotTypeWord = (sport, v) => (v ? (WORDS[sport] || ((x) => x))(v) : null)
