// ONE DEFINITION OF "CALLED" (2026-09-24 audit, DATA-1).
//
// Three coexisted: the homer tweet, /called and the recap counted ANY role
// (WATCH, CONTACT, TOP15 included) as "CALLED IT … The call is in."; the
// Called Ledger counted TOP/HR/HIT/HRR; the @MLBHR reply counted TOP/HR. The
// same homer read "called" on one surface and "on the board" on another, and
// the four public pages quoted four different numbers for one question.
//
// The rule is the Ledger's, which is Donovan's on record (2026-09-15):
//
//   CALLED        TOP, HR, HIT or HRR -- a designated pick with its own lane
//                 and its own graded hit rate.
//   ON THE BOARD  any other role (WATCH is explicitly "not a call"; CONTACT
//                 and TOP15 are ranking bands), or a rated hitter with no role.
//   NOT ON BOARD  never surfaced.
//
// 2026-09-26, Donovan: CONTACT IS A CALL. It was already one of the bot's
// four graded pick types (the front door's record grades "Contact calls" on
// 2+ total bases) while this file filed it as a ranking band -- the same
// homer read "called" on the front door and "no call" on /called. CONTACT
// joins the list, for EVERY night: homer_feed stores the pregame role and
// the label is read from it, so past nights relabel too. Nothing stored
// changes; every CONTACT pick was made before first pitch.
//
//   CALLED        TOP, HR, HIT, HRR or CONTACT (2026-09-26)
//   ON THE BOARD  WATCH, TOP15, or a rated hitter with no role
//
// lib/dash/mlbhr.js keeps its narrower TOP/HR gate for WHO gets a reply --
// that is a posting decision, not a label, and it is documented there.
//
// Roles arrive as a primary role ("HR") or a slash list ("HR/CONTACT").

export const CALL_ROLES = ['TOP', 'HR', 'HIT', 'HRR', 'CONTACT']
const CALLED_RE = /\b(TOP|HR|HIT|HRR|CONTACT)\b/

/** True when the role string carries a designated call. */
export function isCalledRole(role) {
  return CALLED_RE.test(String(role || '').toUpperCase())
}

/**
 * @param {{ role?: string, on_board?: boolean }} row  a homer_feed row or a
 *   live event -- `role` as stored, `on_board` as stored.
 * @returns {'called'|'board'|'off'}
 */
export function callStatus(row) {
  if (isCalledRole(row?.role)) return 'called'
  if (row?.on_board || String(row?.role || '').trim()) return 'board'
  return 'off'
}

/**
 * TUDDY's three states, from an nfl_td_feed row (Batch 3, 2026-09-26). Was
 * written inline twice -- tdCaptureFrom and /called's row mapper -- now here
 * beside MOONSHOT's, the one place the labels come from.
 *   CALLED        on_bot: the scorer was one of the bot's designated TD picks
 *   ON THE BOARD  td_board: rated on the pregame board, no call
 *   NOT ON BOARD  neither
 * @param {{ on_bot?: object|null, td_board?: object|null }} row
 * @returns {'called'|'board'|'off'}
 */
export function tdCallStatus(row) {
  if (row?.on_bot) return 'called'
  if (row?.td_board) return 'board'
  return 'off'
}
