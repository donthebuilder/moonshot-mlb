// ── WHICH PRODUCT IS ON TODAY (funnel step 1, 2026-09-26) ─────────────────
// The front door's one primary button opens the board that's live: NFL on a
// Sunday with games, else MLB with a current slate, else the NHL regular
// season, else football on any other game day (Thu/Mon). Read off the pulse
// the door already has -- no new fetch. Preseason hockey never leads.
// Pure (moved out of lib/dash/pulse.js 2026-09-27 so it can be tested
// outside Next; pulse.js re-exports it).
import { easternDate, easternToday } from '../data'

// `nights` (2026-10-06, ledger audit P1-8): each sport's own slate date (lib/slateNight.js) -- yesterday
// while its games are still live after ET midnight. Omitted, every sport reads `today`, as before.
export function liveProduct({ mlb, nfl, nhl, nights = null } = {}, today = easternToday()) {
  const nflDay = nights?.nfl || today
  const mlbDay = nights?.mlb || today
  const nhlDay = nights?.nhl || today
  const nflToday = (nfl?.kickoffs || []).some((k) => easternDate(Date.parse(k)) === nflDay)
  const sunday = new Date(`${nflDay}T12:00:00Z`).getUTCDay() === 0
  const yesterday = new Date(Date.parse(`${mlbDay}T12:00:00Z`) - 864e5).toISOString().slice(0, 10)
  // Yesterday's slate keeps MLB "on" only while its next game day is today
  // (the overnight gap before today's board builds) -- not on an off day
  // like Mon 09-28, when Monday Night Football is what's on.
  const mlbOn = Boolean(mlb?.games) && (String(mlb?.date || '') === mlbDay
    || (String(mlb?.date || '') >= yesterday && (!mlb?.next || mlb.next.date === mlbDay)))
  const nhlOn = Boolean(nhl?.games) && nhl?.date === nhlDay && nhl?.label !== 'PRESEASON'
  const order = [['nfl', nflToday && sunday], ['mlb', mlbOn], ['nhl', nhlOn], ['nfl', nflToday]]
  return (order.find(([, on]) => on) || ['mlb'])[0]
}
