// BEST ANGLES ON A GAME CARD (Donovan, owner: "for all sports it should show the BEST ANGLE TO ATTACK", "or team weakness"; "players don't show the
// called picks first ... show the best angled player, and the best player balling out stat-wise").
//
// PURE. The one place that picks the card's two rows, for every sport. Each sport's adapter (lib/nfl/gameAngles.js, lib/mlb/gameAngles.js,
// lib/nhl/gameAngles.js) turns its own data into candidates; this file only chooses.
//
//   row A  the best MATCHUP angle   the man whose role / position meets the game's weak spot best (candidate.fit, higher = better)
//   row B  the man BALLING OUT      the best recent form by the sport's own stat (candidate.form, higher = better), never the same man as row A
//
// THE RULES (scripts/check-angles.mjs holds them):
//   - NOT ORDERED OR CHOSEN BY CALL STATUS. This file never reads a status, a role or a CALLED flag; a called man can be here only because he is
//     genuinely the best angle, and nothing on the row says he is.
//   - THE MEMBER GATE. `hiddenOf(candidate)` is true for a pick a non-member may not read (tonight's not-started CALLED pick outside the free four,
//     lib/members/gate.js lockedFor). A hidden man is skipped, and the next best takes his place. Members / unknown viewers: hiddenOf is false.
//   - NO EDGE, NO ROW. A candidate needs a finite score and a reason in words; no candidate, no row. Nothing is filled in.
//
// candidate = { key, pid, name, team, why, fit?, form?, ... }  (extra fields ride through untouched: href, onClick, tag)

const finite = (v) => v != null && v !== '' && Number.isFinite(Number(v))

function best(list, field, skip) {
  let top = null
  for (const c of Array.isArray(list) ? list : []) {
    if (!c || !c.name || !c.why || !finite(c[field])) continue
    if (skip(c)) continue
    if (!top || Number(c[field]) > Number(top[field])) top = c   // strictly greater: ties keep the given order
  }
  return top
}

/**
 * @param {object} p
 * @param {Array}  [p.matchup]    candidates with `fit`
 * @param {Array}  [p.form]       candidates with `form`
 * @param {(c)=>boolean} [p.hiddenOf]  true for a pick this viewer may not read (skipped)
 * @returns {Array} the rows, in order: [{ ...candidate, kind: 'matchup' | 'form' }]; empty when there is no edge
 */
export function pickAngles({ matchup = [], form = [], hiddenOf = () => false } = {}) {
  const hidden = (c) => Boolean(hiddenOf(c))
  const a = best(matchup, 'fit', hidden)
  const b = best(form, 'form', (c) => hidden(c) || (a != null && c.key === a.key))
  return [a && { ...a, kind: 'matchup' }, b && { ...b, kind: 'form' }].filter(Boolean)
}

/** The words on each row's tag. */
export const ANGLE_TAG = { matchup: 'MATCHUP', form: 'FORM' }
