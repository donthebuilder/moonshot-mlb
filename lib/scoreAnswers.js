// S4: "WHAT AM I LOOKING AT?" (2026-10-01, from claude/S4-DRAFT.md v2, with
// Donovan's own lines for DC and the goal score). Six answers for every
// proprietary number, shown when its ⓘ opens (ExplainBanner, via a column's
// `answers` id). One place for the words; a column only names the id.
//
// Rules carried from the draft:
//  - every "Measured" line is the locked pregame record only (por_rows,
//    Sep 9-30: 21 nights, 4,096 hitter-games, 11.5% base), with its n; where
//    there is no clean number, it says so instead of quoting a dirty one.
//  - nothing here claims a hit rate the record doesn't hold.
// Corrections vs the v1 draft (from the 10-01 model audit): the TD score's
// inputs are the six weighted parts the model actually uses (the "defense TD
// softness" term carries no weight), and a TD grade is a league rank on a
// fixed curve -- the week's #1 reads about 80 -- not proof of elite evidence.

const CLEAN = 'clean pregame record, 21 nights'

export const ANSWERS = {
  'mlb-hr': {
    name: 'HR score',
    what: 'How good tonight looks for him to go deep: his power, the arm he faces, the park and weather, and his recent form. A ranking, 0–100.',
    why: 'It’s the main score behind the HR board and the picks. A 70 is a lean, not a lock, and it’s a power score — don’t read it as “good hitter tonight.”',
    goesIn: 'Season power (ISO, HR per PA, slugging — the biggest single part), damage conversion, the starter’s HR damage, pitch-type fit, pull and launch, recent homers and extra-base hits, park and weather, the pitcher’s numbers against his side, strikeout rate.',
    read: 'A ranking, not a percent: a 78 sits above a 62, it isn’t a 78% chance. Bands: 70+ · 50–70 · 30–50 · under 30.',
    time: 'Built for tonight: season stats to date, plus his last ~8 games of contact and last 5–20 PA of results.',
    how: 'A weighted blend of those inputs, with penalties for trap profiles (heavy ground-ball contact, an ace on the mound), capped at 59 unless three strong signals line up. The final number leans 70% on that blend and 30% on recent home-run form.',
    measured: `70+ homered 25.0% (14 of 56); under 30 homered 8.6% (184 of 2,130), against an 11.5% base — ${CLEAN}. Small at the top.`,
  },
  'mlb-p3': {
    name: 'Power-3',
    what: 'Who hits it hardest and farthest all season: HR per batted ball, average exit velo, max exit velo.',
    why: 'Season power is the strongest single input in the clean record; this is it on its own scale.',
    goesIn: 'Season HR per batted ball, season average exit velo, season max exit velo.',
    read: '100 means best on tonight’s slate in all three.',
    time: 'Season to date, ranked on tonight’s slate.',
    how: 'Each of the three is ranked within tonight’s slate and the ranks are averaged.',
    measured: 'None clean yet — it’s logged pregame from Oct 1 on.',
  },
  'mlb-hrw': {
    name: 'HRW — the HR window',
    what: 'How his bat has looked lately: recent contact quality plus recent results. 0–88.',
    why: 'A hot window is the short-term half of a home-run read. The season half is the HR score and Power-3.',
    goesIn: 'Last 20 PA: ideal-HR contact, barrels, 350 and 375 ft balls, hard-hit, exit velo, fly balls, pull, xwOBA. Last 7 games: HR, XBH, hits, AVG, R+RBI. Last 5 games, as confirmation.',
    read: '🌋 80+ · 🚀 70+ · ⚡ 55+ · 🌤️ 45+ · 🧊 below.',
    time: 'His last 20 plate appearances and his last 5–7 games.',
    how: '42% recent contact, 38% last-7 results, 20% last-5 confirmation, plus a bump for recent homers — scaled by how much recent data there is, capped at 88.',
    measured: `80+ homered 17.0% (46 of 271); under 45 homered 9.9% (262 of 2,637) — ${CLEAN}.`,
  },
  'mlb-dc': {
    name: 'DC — damage conversion',
    what: 'When he squares one up, how often it becomes damage instead of an out.',
    why: 'It separates loud contact from loud outs. Two hitters can square it up the same amount; this says whose hard contact turns into extra bases. Weak on its own — read it next to the HR score, not instead of it.',
    goesIn: 'His damage on the pitch types he’ll see (ISO, SLG, barrels, hard-hit), his recent batted-ball shape (375+ ft balls, max EV, launch angle, pull-air), the starter’s mistakes (barrels and hard-hit allowed, HR/9), how the two overlap, the park.',
    read: '0–100, higher is better.',
    time: 'Season and pitch-type history, plus his last ~8 games of batted balls.',
    how: '30% his pitch damage, 24% recent shape, 22% pitcher mistakes, 14% overlap, 10% park and weather; points off for heavy ground-ball contact, high strikeouts or a thin sample.',
    measured: `Its top ten each night homered 15.2% (32 of 210) — ${CLEAN}. A weak signal.`,
  },
  'mlb-rank': {
    name: 'Board rank (#)',
    what: 'His place on tonight’s board, #1 first, over the whole slate.',
    why: 'It’s the same order as the full board, the alerts and the posts.',
    goesIn: 'HR score, season home runs, season average exit velo.',
    read: '#1 first. Filtering hides rows; it never renumbers them.',
    time: 'Tonight.',
    how: 'Each of the three is ranked within tonight’s slate and the ranks are averaged.',
    measured: 'None clean yet — board rank is logged pregame from Oct 1 on.',
  },
  'nfl-td': {
    name: 'TD score',
    what: 'How good this week looks for him to score a touchdown, ranked against the league: how often he gets the ball near the end zone, how much his offense is expected to score, and how much he’s on the field.',
    why: 'It’s the score behind the TD board and MOONSHOT’s TD picks. A grade is a rank on a fixed curve — the week’s #1 always reads about 80 — not a promise.',
    goesIn: 'Red-zone chances (22%), expected TDs (16%), goal-line chances (15%), his team’s implied points (18%), touches (16%), snap share (13%).',
    read: 'A rank, not a probability: a 67 doesn’t mean 67%. Grades: A+ 78 · A 70 · A- 62 · B+ 54 · B 46.',
    time: 'This week. Early in the season it leans on last season’s per-game baseline.',
    how: 'Each part is ranked against every qualified player in the league, the parts are blended by those weights, and the blend is ranked league-wide on the same scale as MOONSHOT’s.',
    measured: 'None quoted yet on purpose — three graded weeks isn’t enough. Every pick so far is on the record.',
  },
  'nhl-goal': {
    name: 'Goal score',
    what: 'Tonight’s goal-board score: three percentile ranks averaged — shots, goals and ice time per game.',
    why: 'Who gets the most shots, who’s been finishing them, and who’s on the ice the most — ranked against everyone playing tonight. It’s the first filter for a goal; the goalie and the matchup aren’t in it yet.',
    goesIn: 'Shots, goals and ice time per game.',
    read: 'Ranks tonight’s pool, 0–100; not a probability.',
    time: 'His last 82 NHL games, this season first.',
    how: 'Three percentile ranks among tonight\u2019s scored skaters, averaged. The call is the top skater on each team (two a game, lamp-goal-v2 from Oct 1); ON THE BOARD is the top third of tonight\u2019s board.',
    measured: 'None quoted yet — two nights of regular season isn’t enough. Every call is on the record.',
  },
  called: {
    name: 'CALLED',
    what: 'CALLED is one of MOONSHOT’s designated picks. ON THE BOARD is rated but not a call. NOT ON THE BOARD wasn’t surfaced. Same words, same meaning, on all three sports.',
    why: 'A call is graded; a high rank on its own is not a call.',
    goesIn: 'MOONSHOT: a TOP, HR, HIT, HRR or CONTACT pick. TUDDY: MOONSHOT’s TD picks (ON THE BOARD is the top third of the TD board). LAMP: the top skater on each team in every game (from Oct 1; the top three a game before), or a SHOTS 3+ call.',
    read: 'The tag is frozen when it’s made and never re-graded.',
    time: 'Before first pitch, kickoff or puck drop.',
    how: 'The pregame role, stored at the time; nothing is re-derived after.',
    measured: 'Live on the public record (/called).',
  },
}

/** The order the six answers read in. */
export const ANSWER_ROWS = [
  ['what', 'What it is'], ['read', 'How to read it'], ['measured', 'Measured'],
  ['why', 'Why it matters'], ['goesIn', 'What goes in'], ['time', 'Timeframe'], ['how', 'How it’s calculated'],
]
/** Shown before "The full read". */
export const ANSWER_FIRST = 3
