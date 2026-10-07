// MLB's CALLED / ON THE BOARD / NOT ON THE BOARD for every home run, per
// night, as /called prints it (2026-10-06, ledger audit P0-1).
//
// /called reads homer_feed and runs each row through lib/callStatus.js
// callStatus() (the top third of that night's board; nights with no board
// size stored: anyone the board rated). The in-app ledger, the Record page and
// the header read the bot's graded files, which carry no board size, so they
// used to call "on the sheet" ON THE BOARD -- Freeman #24 and Hernandez #28
// were ON THE BOARD in the app and NOT ON THE BOARD on /called for the same
// night. This module hands the app the SAME rows' statuses (GET
// /api/mlb/call-status), so there is one answer; the word is never re-derived.
//
// Pure functions here (the check script loads them in plain node); the one
// read is readStatusNights.
import { boardOfRows } from '../callStatus'
import { readMlbEvents } from './mlb'

/**
 * EventRecords (lib/record/mlb.js toMlbEvent) -> { [day]: { of, st: { [player_id]: status } } }.
 * `of` is the night's board size, ONE way (boardOfRows). A hitter with two homers is one entry
 * (his row carries one role and one board rank).
 */
export function statusNights(events) {
  const byDay = new Map()
  for (const e of events || []) {
    const day = e.game_date
    if (!byDay.has(day)) byDay.set(day, [])
    byDay.get(day).push(e)
  }
  const out = {}
  for (const [day, evs] of byDay) {
    const st = {}
    // oldest homer first, so a hitter's status is the one frozen at his first
    for (const e of evs.slice().sort((a, b) => (a.n || 0) - (b.n || 0))) {
      const pid = String(e.player_id)
      if (!(pid in st)) st[pid] = e.status
    }
    // only rows that STORE a size: boardOfRows' own fallback counts the rows it is
    // handed, which for a night's homers is a handful, not a board
    out[day] = { of: boardOfRows(evs.map((e) => e.payload).filter((r) => Number(r?.board_of) > 0)), st }
  }
  return out
}

/** The nights from `since` to `until` (inclusive), read the way /called reads them. */
export async function readStatusNights(db, { since, until }) {
  const { events, error } = await readMlbEvents(db, { since, until })
  if (error) throw error
  return statusNights(events)
}
