// MOONSHOT NUMEROLOGY ON A DAY WITHOUT ITS SLATE (2026-10-21, KNOWN-ISSUES). On Wed 10-21 (no MLB game) the tab read
// "2026-10-20 reduces to 4" with that night's hitters, as if they were tonight's. The board on screen keeps its own date
// (the slate's), so the tab asked nothing else. Now: a slate from an earlier Eastern day whose games are all over is not
// tonight. Today has games -> wait for today's board; no game today -> say so and when baseball is back.
// The same rule Home uses (components/tabs/Home.js slateInPast + lib/mlbNext.js). Pure; the page hands in the reads.
import { nextLine } from '../mlbNext'

/**
 * null = show the slate as it is (today's slate, a late game still on, or a feed that didn't answer).
 * Otherwise { kind: 'waiting' | 'none', title, note, numbersDate, numbersLabel }.
 * slateOver: lib/mlbSlateState.js `over` for the slate's date (null when unreadable). next: lib/mlbNext.js mlbNextGames(today)
 * (undefined while loading, null when unreadable or nothing in 10 days). phase: lib/mlb/phase.js answer or null.
 */
export function numerologyDay({ slateDate, today, slateOver, next, phase = null }) {
  if (!slateDate || !today || slateDate >= today) return null
  if (slateOver !== true) return null
  if (next === undefined) return null
  if (next && next.date === today) {
    return { kind: 'waiting', title: "WAITING FOR TODAY'S BOARD", note: `${slateDate} is final. Today's hitters and their numbers show here once the board is up.`, numbersDate: today, numbersLabel: 'today' }
  }
  const line = nextLine(next, today)
  if (line) {
    const label = new Date(`${next.date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'numeric', day: 'numeric' }).replace(',', '')
    return { kind: 'none', title: 'NO MLB GAME TODAY', note: `${line}. That day's numbers are below; its hitters show once the board is up.`, numbersDate: next.date, numbersLabel: label }
  }
  const off = phase?.phase === 'OFFSEASON'
  return { kind: 'none', title: 'NO MLB GAME TODAY', note: off ? "MLB is in the offseason. The season's homers and their numbers stay on the HR Ledger." : 'No MLB game in the next 10 days.', numbersDate: null, numbersLabel: null }
}
