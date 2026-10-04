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
// THE THREE WORDS, ONCE (2026-10-01, BATCH-TABLE-SKIN-V2 step 4; R2 reuses
// it). Every status label on the site is one of these, in capitals.
export const STATUS_WORD = { called: 'CALLED', board: 'ON THE BOARD', off: 'NOT ON THE BOARD' }
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
// THE TOP THIRD, MLB TOO (2026-10-01, 0c; Donovan "2 yes"): a rated hitter
// with no call is ON THE BOARD only when his board rank at lock is inside the
// top third of that night's board (rank <= ceil(n/3), the same cut TUDDY
// uses); the rest of the rated board reads NOT ON THE BOARD. n is the board's
// size, stored with the row (stats.board_of, written since 10-01; older
// nights backfilled from that night's pregame board). A row with no n keeps
// the old rule (rated = on the board) rather than guessing one. A WATCH /
// TOP15 role is a ranking band and stays ON THE BOARD.
export const BOARD_SHARE = 1 / 3
export function boardCut(of) {
  const n = Number(of)
  return n > 0 ? Math.ceil(n * BOARD_SHARE) : null
}
/** A night's board size, ONE way everywhere (bot audit 10-03 #3: the members
 *  post, the Scoreboard, Storylines and Longshots each counted rows their own
 *  way, doubleheaders twice). The bot publishes it on every board row
 *  (board_of = distinct hitters); without it, count distinct rated players. */
export function boardOfRows(rows) {
  for (const r of rows || []) { const n = Number(r?.board_of ?? r?.stats?.board_of); if (n > 0) return n }
  const ids = new Set()
  for (const r of rows || []) if (r?.player_id != null && Number.isFinite(Number(r?.hr_score))) ids.add(String(r.player_id))
  return ids.size || null
}
export function callStatus(row) {
  if (isCalledRole(row?.role)) return 'called'
  if (String(row?.role || '').trim()) return 'board'
  const rank = Number(row?.board_rank)
  const cut = boardCut(row?.board_of ?? row?.stats?.board_of)
  if (cut != null && rank > 0) return rank <= cut ? 'board' : 'off'
  if (row?.on_board) return 'board'
  return 'off'
}

/**
 * TUDDY's three states, from an nfl_td_feed row (Batch 3, 2026-09-26). Was
 * written inline twice -- tdCaptureFrom and /called's row mapper -- now here
 * beside MOONSHOT's, the one place the labels come from.
 *   CALLED        on_bot: the scorer was one of the bot's designated TD picks
 *   ON THE BOARD  td_board in the TOP THIRD of the pregame TD board
 *   NOT ON BOARD  neither -- including a man the board rated lower down
 *
 * THE TOP THIRD (2026-09-29, Donovan picked it from the queue's batch 7).
 * "On the board" used to mean "rated at all", and the week file rates ~560
 * men, so nearly every touchdown read ON THE BOARD and the label said nothing.
 * Now it is the top third of that week's TD board, by the rank stored on the
 * row at the touchdown (td_board.rank of td_board.of) -- nothing stored
 * changes, past weeks relabel from their own frozen ranks, and the cut is
 * printed wherever the label is (tdBoardCut). Only the TD market carries the
 * tag; no other market (kicking points included) has an ON THE BOARD state.
 * @param {{ on_bot?: object|null, td_board?: {rank:number, of:number}|null }} row
 * @returns {'called'|'board'|'off'}
 */
export const TD_BOARD_SHARE = 1 / 3

/** The last rank inside the top third of a board of `of` players. */
export function tdBoardCut(of) {
  const n = Number(of)
  return n > 0 ? Math.ceil(n * TD_BOARD_SHARE) : null
}

/** True when a stored board rank is inside the top third. */
export function tdOnBoard(board) {
  const rank = Number(board?.rank)
  const cut = tdBoardCut(board?.of)
  return rank > 0 && cut != null && rank <= cut
}

export function tdCallStatus(row) {
  if (row?.on_bot) return 'called'
  if (tdOnBoard(row?.td_board)) return 'board'
  return 'off'
}
