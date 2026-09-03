// ── ONE ANSWER TO "IS THIS ARM LEAKY" (2026-09-03) ──────────────────────────
//
// Flagged twice in earlier passes as a colour bug on the Slate page: the duel
// strip's HR/9 TEXT went warm at 1.30 with the tooltip "higher favors the
// bats", while the BAR six pixels to its right went red at the same 1.30, red
// being the colour this site uses for the losing side. Same number, two
// opposite readings, side by side.
//
// It is not a colour bug. Counting the comparisons across the MLB components:
//
//     hot  >= 1.6, 1.5, 1.40, 1.4, 1.3, 1.25, 1.20, 1.2, 1.05
//     cold <= 1.0, 0.95, 0.9, 0.85, 0.8, 0.78
//
// Fifteen hardcoded thresholds for one statistic. So the same starter reads
// LEAKY on the Pitchers tab, neutral on the game card, and warm-but-not-hot in
// the deep dive, and none of those pages is wrong about anything except each
// other. That is the nav-label drift again in a different costume, and it gets
// the same fix: one table, many readers.
//
// THE NUMBERS, AND WHY THESE ONES.
//
// 1.25 is the league line, and it is not invented here -- ProjectedOutput's
// armOf() already normalises against it, GameDeepDive already PRINTS it ("the
// league line is 1.25 -- warm is over it, and over it is good for the bats"),
// and lib/bullpen.js already uses exactly 1.25 / 0.95. GameDeepDive's own
// tiles then went hot at 1.4, contradicting the sentence in their own tooltip.
// So the honest threshold is the one the product already says out loud: at or
// over the league line is trouble for him.
//
// 0.95 is bullpen.js's cold end, kept for the same reason -- it is the only
// cold threshold on the site that was chosen against the league line rather
// than by eye.
//
// THE DIRECTION, ONCE, SO IT CANNOT FLIP AGAIN. This is a site about backing
// HITTERS. A high HR/9 is GOOD NEWS for the reader and BAD for the pitcher.
// 'hot' therefore means "trouble for him, good for the bats" and is warm;
// 'cold' means "his weapon" and is cool. That is already the stated language
// in PitcherProfile ("Warm = trouble for him -- good for the bats; cool = his
// weapon"). Red for a high HR/9 says the opposite and is the reading that has
// to go.
import { C } from './theme'

/** The reference every page normalises against. */
export const LEAGUE_HR9 = 1.25

/** Cold end. Below this he is genuinely suppressing the ball. */
export const WALL_HR9 = 0.95

/**
 * 'hot' | 'cold' | null.
 *
 * null is a real answer, not a failure: an arm between the two lines is
 * ordinary, and saying so with a neutral colour is more useful than forcing
 * every pitcher onto one end of a ladder.
 */
export function hr9Tone(v) {
  const x = Number(v)
  if (!Number.isFinite(x) || x <= 0) return null
  if (x >= LEAGUE_HR9) return 'hot'
  if (x <= WALL_HR9) return 'cold'
  return null
}

/** The colour that tone wears. Warm = good for the bats. */
export function hr9Color(v, neutral = C.text) {
  const t = hr9Tone(v)
  return t === 'hot' ? C.orange : t === 'cold' ? C.blue : neutral
}

/** For a bar or a meter, where "neutral" still has to be visible. */
export const hr9Fill = (v) => hr9Color(v, C.text3)

/** How far along a 0–2.00 bar this arm sits. */
export const hr9Pct = (v) => {
  const x = Number(v)
  if (!Number.isFinite(x) || x <= 0) return 0
  return Math.min(100, (x / 2) * 100)
}

/**
 * The three words the site uses for the three tones.
 *
 * MatchupPitcher wrote these by hand against its own 1.4/0.9 pair, so the arm
 * described as "league-ish" there could be printed warm on the next page. One
 * function, so the word and the colour cannot come apart.
 */
export function hr9Word(v) {
  const t = hr9Tone(v)
  return t === 'hot' ? 'gives them up' : t === 'cold' ? 'suppresses them' : 'league-ish'
}

/**
 * Is this arm a target?
 *
 * The prose/band surfaces (Pitchers' TARGET/LEAKY/WALL, PitcherRead's
 * leaky/wall, ProjectedOutput's "Leaky arms" filter) each carried their own
 * cut. They ask the same question as the colour does and now get the same
 * answer; the extra terms they blend in -- weak-spot counts, barrel rates --
 * are untouched, because those are what make the bands different from a
 * colour in the first place.
 */
export const isLeaky = (v) => hr9Tone(v) === 'hot'
export const isWall = (v) => hr9Tone(v) === 'cold'

/** The sentence, so a tooltip cannot describe a different threshold than the
 *  colour it is attached to. */
export function hr9Title(v) {
  const t = hr9Tone(v)
  return `Homers allowed per nine innings. The league line is ${LEAGUE_HR9.toFixed(2)}${
    t === 'hot' ? ' — he is over it, which is good for the bats'
      : t === 'cold' ? ' — he is well under it; this is his weapon'
        : ' — he is between the lines, neither a target nor a wall'
  }.`
}

// ── WHAT THIS FILE DELIBERATELY DOES NOT TOUCH ──────────────────────────────
//
// Presentation reads from here. MODEL LOGIC KEEPS ITS OWN NUMBERS, and that is
// not an oversight -- a threshold inside a score is a tuned parameter that was
// measured against graded outcomes, and quietly moving it would change which
// players the bot puts on the board while every backtest on file still
// describes the old one. A colour being wrong is a cosmetic bug; a scoring cut
// being wrong is a different product.
//
// Left alone on purpose, with their own values:
//   lib/scoring.js               target lane          >= 1.2
//   lib/scoring_additions.js     two signal gates     >= 1.40, >= 1.20
//   lib/verdict.js               pitch/mix + arm      >= 1.20
//   lib/matchupStory.js          story weight on L3   >= 1.5
//   lib/pairEvidence.js          both arms leak       >= 1.4
//   lib/pitcherTags.js           the WALL tag         <= 0.78 AND barrel <= .027
//   components/tabs/Results.js   'targeted' in grading>= 1.2
//   components/tabs/Leaders.js   collision pool       >= 1.3
//   components/tabs/Pitchers.js  the weak-arm filter  >= 1.25  (already the league line)
//   components/ProjectedOutput.js armOf() normaliser   / 1.25  (already the league line)
//   components/BoardFilters.js   the chip LABELLED "Arm >= 1.4" -- the number
//                                is in the label, so it cannot mislead anyone
//   components/HotZoneMap.js     HR/9 vs one hand >= 0.75 -- a per-hand
//                                threshold is a different question from a
//                                season rate and has no business sharing a line
//
// If any of those should move, move it deliberately and re-run the backtest.
