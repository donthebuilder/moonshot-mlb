// WHAT "CAME TRUE" MEANS, PER STORY TYPE (BATCH-STORYLINES-PAGE step 3).
// Written before any story is graded; pure, no I/O. A story is graded on its
// player's own line for that game. No line (he did not play, or the source
// does not list him) is VOID, never a miss. A game- or team-level story
// (player_id '_game' / 'team:*') is not graded.
//
// MOONSHOT (line: ab, h, hr, tb, r, rbi -- the box score's batting line)
//   history, matchup, b2b, revenge, multi, duel (owns him)  -> he homered   ('hr'; strong: 2+ HR)
//   duel (never solved him)                                  -> 1+ hit      ('hit'; strong: 2+ hits)
//   milestone  -> he reached it that night, for hits / homers / RBI / runs /
//                 total bases (the line carries those); steals, doubles,
//                 triples and extra-base hits are not on the line, so those
//                 grade PRODUCTIVE and say so
//   funfact, birthday, giveaway (his own night)              -> PRODUCTIVE
// TUDDY (line: nfl_results.json lines -- TD, REC_YDS, RUSH_YDS, REC, ...)
//   history, b2b, revenge, due, redzone, multi               -> he scored a TD ('td'; strong: 2+ TD)
//   streak     -> it extended: his line clears the streak's own market bar
//   model, birthday                                          -> PRODUCTIVE
//   list_td (a TD in every game)                             -> he scored a TD (the list goes on)
//   list_100 (100+ yards 3+ straight)                        -> PRODUCTIVE
// LAMP (line: the NHL box score -- goals, assists, points, shots)
//   history, hot, multi, goal_streak                         -> he scored   ('goal'; strong: 2+ goals)
//   point_streak (a point in every game)                     -> PRODUCTIVE: 1+ point = the streak goes on
//   iron_man                                                 -> PRODUCTIVE
//   (team-level rest / special teams: not graded)
// BUCKETS (line: the ESPN box -- pts, reb, ast, tpm)
//   run, hot                                                 -> 25+ points ('pts25'; strong: 30+)
//   (team-level defense / rest: not graded)  PRODUCTIVE: 15+ points, strong 25+
//
// PRODUCTIVE, for a type with no outcome of its own (Donovan 09-27: "2 hits
// or something productive, even a hit is cool"), at two bars:
//   MLB  1+ hit                          strong: 2+ hits
//   NFL  a TD or 10+ scrimmage yards     strong: a TD or 50+ scrimmage yards
//   NHL  1+ point                        strong: 2+ points or a goal
// NFL's bars checked against week 3's graded lines on 09-27 (scripts/check-stories-grade.mjs
// prints how many players clear each): a touch that gains 10 is "something",
// 50 is a real day.

const scrim = (l) => (Number(l.REC_YDS) || 0) + (Number(l.RUSH_YDS) || 0)
const td = (l) => Number(l.TD) || 0

export const PRODUCTIVE = {
  mlb: { base: (l) => l.h >= 1, strong: (l) => l.h >= 2 },
  nfl: { base: (l) => td(l) >= 1 || scrim(l) >= 10, strong: (l) => td(l) >= 1 || scrim(l) >= 50 },
  nhl: { base: (l) => l.pts >= 1, strong: (l) => l.pts >= 2 || l.g >= 1 },
  // BUCKETS (2026-10-03): 15 points is a real night, 25 a big one
  nba: { base: (l) => l.pts >= 15, strong: (l) => l.pts >= 25 },
}
// The per-event bars, by name (storyline_base_nights uses the same names).
export const BARS = {
  mlb: { hr: [(l) => l.hr >= 1, (l) => l.hr >= 2], hit: [(l) => l.h >= 1, (l) => l.h >= 2] },
  nfl: { td: [(l) => td(l) >= 1, (l) => td(l) >= 2] },
  nhl: { goal: [(l) => l.g >= 1, (l) => l.g >= 2] },
  nba: { pts25: [(l) => l.pts >= 25, (l) => l.pts >= 30] },
}

const MLB_MILESTONE_KEY = { hits: 'h', homers: 'hr', RBI: 'rbi', runs: 'r', 'total bases': 'tb' }
const TYPE_BAR = {
  mlb: { history: 'hr', matchup: 'hr', b2b: 'hr', revenge: 'hr', multi: 'hr', funfact: 'productive', birthday: 'productive', giveaway: 'productive' },
  nfl: { history: 'td', b2b: 'td', revenge: 'td', due: 'td', redzone: 'td', multi: 'td', model: 'productive', birthday: 'productive', list_td: 'td', list_100: 'productive' },
  nhl: { history: 'goal', hot: 'goal', multi: 'goal', goal_streak: 'goal', point_streak: 'productive', iron_man: 'productive' },
  // BUCKETS: a run of 25s or a surge came true if he scored 25+ (strong: 30+)
  nba: { run: 'pts25', hot: 'pts25' },
}

// The types whose bar depends on the story's own numbers.
const BAR_OF = {
  'mlb:duel': (n) => (n.own ? 'hr' : 'hit'),
  'mlb:milestone': (n) => {
    const word = String(n.word || '').replace(/^career /, '').replace(/ this season$/, '')
    return MLB_MILESTONE_KEY[word] ? `milestone:${MLB_MILESTONE_KEY[word]}` : 'productive'
  },
  'nfl:streak': (n) => (n.market ? `streak:${n.market}` : 'productive'),
}

const yes = (b) => (b ? 'hit' : 'miss')
const graded = (bar, base, strong) => ({ bar, outcome: yes(base), outcome_strong: strong == null ? null : yes(strong) })

/**
 * @param s     a frozen story row ({ sport, type, player_id, numbers })
 * @param line  his line for that game, or null
 * @returns { bar, outcome, outcome_strong } | null (not graded: game/team-level)
 */
export function gradeStory(s, line) {
  if (!s?.player_id || /^(_game|team:)/.test(String(s.player_id))) return null
  const sport = s.sport
  const n = s.numbers || {}
  const bar = (BAR_OF[`${sport}:${s.type}`] || (() => TYPE_BAR[sport]?.[s.type] || null))(n)
  if (!bar) return null
  if (!line) return { bar, outcome: 'void', outcome_strong: null }
  if (bar === 'productive') return graded(bar, PRODUCTIVE[sport].base(line), PRODUCTIVE[sport].strong(line))
  if (bar.startsWith('milestone:')) return graded(bar, (Number(line[bar.slice(10)]) || 0) >= Number(n.need), null)
  if (bar.startsWith('streak:')) return graded(bar, (Number(line[bar.slice(7)]) || 0) >= Number(n.bar ?? 1), null)
  const [b, st] = BARS[sport][bar]
  return graded(bar, b(line), st(line))
}

/** Every bar a night's base rate is kept for (storyline_base_nights). */
export function baseBars(sport) {
  return [
    ['productive', PRODUCTIVE[sport].base], ['productive_strong', PRODUCTIVE[sport].strong],
    ...Object.entries(BARS[sport]).flatMap(([k, [b, st]]) => [[k, b], [`${k}_strong`, st]]),
  ]
}
