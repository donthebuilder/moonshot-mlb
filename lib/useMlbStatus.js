'use client'
// One night's CALLED / ON THE BOARD / NOT ON THE BOARD for every MLB homer, as /called prints it
// (2026-10-06, ledger audit P0-1): GET /api/mlb/call-status (lib/record/mlbStatus.js) -> that
// night's { of, st }, or null while it loads / when the read fails (the graded file's own
// role is then run through the same lib/callStatus.js).
import { useLiveFetch } from './useLiveFetch'

export function useMlbStatusNight(date) {
  const { data } = useLiveFetch(date ? `/api/mlb/call-status?from=${date}&to=${date}` : null, { tap: true })
  return data?.days?.[date] || null
}
