// THE LOCKED MLB RECORD'S TWO RULES, ONCE (2026-10-06, calibration view).
// por_rows_<date>.jsonl is the board as it stood at each game's lock;
// outcome_log_<date>.jsonl is what happened. lib/botOnHim.js read them with
// these two rules inline; the calibration table needs the same two, so they
// live here and both import them -- one definition of "a graded player-game".
//
//   finalOutcomes  the latest FINAL revision of each player-game
//   played         counts only if he is not void and had a plate appearance
//                  (a void or a 0-PA game is never a hit and never a miss)
//
// Pure: no fetch, no framework imports (the check script loads it in plain node).

export const LOCKED_SINCE = '2026-09-09'      // the locked record's window starts here (read by lib/calibration/readMlbCalibration.js; the printed window comes from the data)

const i0 = (v) => { const x = Number(v); return Number.isFinite(x) ? x : 0 }

/** A jsonl text -> rows (a bad line is skipped, never fatal). */
export const parseJsonl = (txt) => String(txt || '').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l) } catch { return null } }).filter(Boolean)

/** outcome rows -> Map('game_pk|player_id' -> the latest FINAL revision). */
export function finalOutcomes(rows) {
  const fin = new Map()
  for (const r of rows || []) {
    if (!r?.is_final) continue
    const key = `${r.game_pk}|${r.player_id}`
    if (!fin.has(key) || i0(r.revision) > i0(fin.get(key).revision)) fin.set(key, r)
  }
  return fin
}

/** True when the outcome is a real game line: final, not void, at least one plate appearance. */
export const played = (o) => Boolean(o) && !o.void && i0(o.plate_appearances) > 0

/** THE LOCK RULE, ONCE: a por_rows row is a pregame call only if the run that wrote it (`generated_at`)
 *  is stamped BEFORE the game's scheduled first pitch (ms). A row stamped at or after it is not a call. */
export const lockedBeforeFirstPitch = (row, firstPitchMs) => {
  const at = Date.parse(row?.generated_at)
  return Number.isFinite(at) && Number.isFinite(firstPitchMs) && at < firstPitchMs
}
