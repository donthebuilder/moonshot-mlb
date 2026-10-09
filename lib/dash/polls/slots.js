// WHEN A SPORT'S POLL MAY GO OUT: pollSlots(sport, day) (X overhaul stage 3 piece 2). Pure.
//
// The scheduler piece owns the real posting slots; until it lands this is the stand-in it will
// replace: ONE poll per sport per day, the first sport's in the approved MORNING window, the
// others spread over the midday and late-afternoon windows. The windows are defined in PHOENIX
// time (the account's heatmap zone, no daylight saving) and converted with Intl, never "+N hours".
// A poll is posted at the first tick at or after its slot where a format can be built from
// confirmed names; the lineup / goalie / injury checks hold it until then.

export const POLL_TZ = 'America/Phoenix'

const SLOT_PHOENIX = Object.freeze({
  nfl: { name: 'morning', hour: 7, minute: 30 },        // the 7-10am window, before a Sunday's kickoffs
  mlb: { name: 'morning', hour: 8, minute: 30 },
  nhl: { name: 'midday', hour: 12, minute: 0 },          // the 12-1pm window
  nba: { name: 'late afternoon', hour: 16, minute: 0 },  // the 4-5pm window
})

/** The instant (ms) at which `day` (YYYY-MM-DD) reads hh:mm on the clock of `tz`. */
export function zonedMs(day, hour, minute, tz = POLL_TZ) {
  const want = `${day} ${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
  const clock = (ms) => { const p = Object.fromEntries(fmt.formatToParts(new Date(ms)).map((x) => [x.type, x.value])); return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}` }
  let guess = Date.parse(`${day}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`)
  for (let i = 0; i < 4; i += 1) {                         // converge: the zone's offset is read, not assumed
    const got = clock(guess)
    if (got === want) return guess
    const diff = Date.parse(`${want.replace(' ', 'T')}:00Z`) - Date.parse(`${got.replace(' ', 'T')}:00Z`)
    guess += diff
  }
  return guess
}

/** [{ name, startMs }]: when this sport's poll for `day` may first go out. One slot per sport today. */
export function pollSlots(sport, day) {
  const s = SLOT_PHOENIX[sport]
  if (!s) return []
  return [{ name: s.name, startMs: zonedMs(day, s.hour, s.minute) }]
}
