// The public record line, one reader for every public page that prints it (the card landing /c and the phone app's Record tab).
// MLB's comes from the locked record (lockedRecordFrom via readLockedRecord); a failed read answers null and the caller leaves the line off.
import { readLockedRecord } from '../calibration/readMlbCalibration'
import { lockedCallsLine } from './lockedRecord'

export async function mlbRecordLine() {
  try {
    const rec = await readLockedRecord(new Date().toISOString().slice(0, 10))
    if (!rec) return null
    const calls = Object.values(rec.picks || {}).reduce((a, r) => a + (r?.n || 0), 0)
    return calls ? lockedCallsLine(rec, calls) : null
  } catch { return null }
}
// a sport's own record line, by sport key (a table, not a ternary); a sport without one shows the link to its record only
export const RECORD_LINE = { mlb: mlbRecordLine }
