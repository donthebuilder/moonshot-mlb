// 🔮 LAMP NUMEROLOGY (lamp research step 5, 2026-09-26). Server only. FOR
// FUN: numbers that line up, not a prediction. Not graded, never in the
// score, never on the board -- the same disclosed-flavour rule MOONSHOT's
// Alignments and TUDDY's Numerology carry (MLB's 08-28 sweep tested 18 axes
// on 4,238 player-nights and found no signal).
//
// TONIGHT'S DRESSED SKATERS ONLY: a game's skaters come from its posted
// lineup (play-by-play rosterSpots, with the sweater number); a game with no
// lineup yet is listed as waiting, never filled from the roster.
//
// Three axes, each reduced to a digit root (17 -> 8), matched against the
// night's own root (every digit of the date):
//   JERSEY  the sweater number he wears tonight (rosterSpots)
//   DAY     his birth day-of-month           (roster/{team}/current birthDate)
//   PATH    his life path, every birth digit (same)
// A missing field sits that axis out; nothing is defaulted to zero. The
// count you would expect by chance ships beside the count that lined up.
import { scoreFor, nhlGet, rosterFor, TTL } from './api'
import { reduceScoreDay, reduceRoster } from './reduce'
import { digitRoot, rootOfDigits } from '../numerology/core'

// digitRoot / rootOfDigits: one copy, lib/numerology/core.js (2026-09-27).
export { digitRoot }

export async function readNumerology(date) {
  const day = reduceScoreDay(await scoreFor(date))
  const games = day.games.filter((g) => g.scheduleState === 'OK')
  const dateRoot = rootOfDigits(date)
  const clubs = [...new Set(games.flatMap((g) => [g.away.abbrev, g.home.abbrev]))]
  const births = new Map()
  await Promise.all(clubs.map(async (t) => {
    try { for (const r of reduceRoster(await rosterFor(t), t)) if (r.id) births.set(Number(r.id), r.birthDate) } catch (e) { console.error(`[lamp numerology] roster ${t}: ${e?.message}`) }
  }))
  const out = []; const waiting = []
  let axes = 0
  await Promise.all(games.map(async (g) => {
    let spots = []
    try { spots = (await nhlGet(`/gamecenter/${g.id}/play-by-play`, TTL.game))?.rosterSpots || [] } catch { spots = [] }
    const teamOf = { [g.away.id]: g.away.abbrev, [g.home.id]: g.home.abbrev }
    const skaters = spots.filter((s) => s.positionCode !== 'G')
    if (!skaters.length) { waiting.push(`${g.away.abbrev}@${g.home.abbrev}`); return }
    for (const s of skaters) {
      const id = Number(s.playerId); const birth = births.get(id) || null
      const jersey = Number(s.sweaterNumber) > 0 ? Number(s.sweaterNumber) : null
      const bday = birth ? Number(String(birth).slice(8, 10)) || null : null
      const ax = { jersey: jersey ? digitRoot(jersey) : null, day: bday ? digitRoot(bday) : null, path: birth ? rootOfDigits(birth) : null }
      axes += Object.values(ax).filter((v) => v != null).length
      const hit = Object.entries(ax).filter(([, v]) => v != null && v === dateRoot).map(([k]) => k)
      out.push({
        id, name: `${s.firstName?.default || ''} ${s.lastName?.default || ''}`.trim(), team: teamOf[s.teamId] || null, pos: s.positionCode,
        jersey, birthDate: birth, roots: ax, hits: hit, n: hit.length, game: `${g.away.abbrev}@${g.home.abbrev}`,
      })
    }
  }))
  const aligned = out.filter((r) => r.n > 0).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
  return {
    date, dateRoot, games: games.length, waiting: waiting.sort(), skaters: out.length,
    aligned, alignedHits: aligned.reduce((n, r) => n + r.n, 0), expectedHits: Math.round((10 * axes) / 9) / 10,
  }
}
