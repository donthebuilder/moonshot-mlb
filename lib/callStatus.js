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
// lib/dash/mlbhr.js keeps its narrower TOP/HR gate for WHO gets a reply --
// that is a posting decision, not a label, and it is documented there.
//
// Roles arrive as a primary role ("HR") or a slash list ("HR/CONTACT").

export const CALL_ROLES = ['TOP', 'HR', 'HIT', 'HRR']
const CALLED_RE = /\b(TOP|HR|HIT|HRR)\b/

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
