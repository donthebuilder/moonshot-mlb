// MLB'S NEXT GAME DAY (2026-09-27, BATCH-LIST-POSTS step 6). For a day with
// no games -- Mon 09-28 between the regular season and the Wild Card -- the
// front door and MOONSHOT's home say when baseball is back and what it is
// ("Wild Card starts Tue 9/29") instead of showing yesterday's slate as if it
// were tonight's. One StatsAPI schedule read (regular season + every
// postseason round), the next ten days. Works on the server and in the browser.

export const ROUND = { F: 'Wild Card', D: 'Division Series', L: 'League Championship Series', W: 'World Series' }
const shift = (d, n) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10)

/** Pure: a schedule body -> { date, round } for the first date on or after `from` with a game, or null. */
export function nextFrom(body, from) {
  for (const d of (body?.dates || []).slice().sort((a, b) => String(a.date).localeCompare(String(b.date)))) {
    if (!d?.date || d.date < from || !(d.games || []).length) continue
    const types = [...new Set(d.games.map((g) => g.gameType))]
    return { date: d.date, round: types.length === 1 ? ROUND[types[0]] || null : null, games: d.games.length }
  }
  return null
}

/** { date, round, games } for the next MLB game day from `from` (inclusive), or null. */
export async function mlbNextGames(from, { days = 10 } = {}) {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&startDate=${from}&endDate=${shift(from, days)}&gameType=R,F,D,L,W&fields=dates,date,games,gameType`)
    if (!res.ok) return null
    return nextFrom(await res.json(), from)
  } catch { return null }
}

/** "Wild Card starts Tue 9/29" / "Next games Tue 9/29" for a day with none. */
export function nextLine(next, today) {
  if (!next?.date || next.date <= today) return null
  const day = new Date(`${next.date}T12:00:00Z`).toLocaleDateString('en-US', { timeZone: 'UTC', weekday: 'short', month: 'numeric', day: 'numeric' }).replace(',', '')
  return next.round ? `${next.round} starts ${day}` : `Next games ${day}`
}
