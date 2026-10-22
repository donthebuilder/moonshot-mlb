// 🔮 EVERY SPORT'S NUMBERS IN ONE SEARCH (2026-10-21, Donovan: "shared ability to have somewhere where you can search all
// the aligned players across all sports today"). Server only. FOR FUN: numbers that line up, not a prediction; never
// graded, never in a score.
//
// One row per player on each open product's slate, in ONE shape, so a single search can cover them all:
//   { sport, pid, name, team, game, gameDate, dateRoot, jersey, birthDate, next, unit, from,
//     axes: { next, jersey, day, path } }   each axis reduced to a digit root; a missing field is null, never 0
// The shared axes are the ones every product already computes for its own Numerology page: JERSEY, BIRTH DAY,
// LIFE PATH (lib/numerology/core), plus NEXT (his next HR / TD / goal = season total + 1) where the product carries a
// season total (BUCKETS has no "next one" lane). `dateRoot` is HIS game's own date reduced, so TUDDY's Sunday men
// line up with Sunday's number, not Wednesday's.
//
// WHERE EACH SPORT'S ROWS COME FROM (the same reads the products' own Numerology pages use, nothing new stored):
//   MLB  the bot's published slate (today_slim.json) + MLB's people endpoint for birth dates (MOONSHOT's usePeople,
//        server-side). A slate dated before today is NOT today: it is left out and the sport says "no game today".
//   NFL  the bot's published week (nfl_week.json): every player whose game is still ahead or today
//   NHL  lib/nhl/numerology.js readNumerology (lineups, or the clubs' rosters until they post: LAMP's page rule)
//   NBA  lib/nba/numerology.js readNbaNumerology (box once tipped, rosters before), only while BUCKETS is open
import { digitRoot, dayRootOf, lifePathOf, rootOfDigits } from './core'
import { fetchJSON, easternDate, easternToday } from '../data'
import { slatePaths } from '../dataSource'
import { nflSlatePaths } from '../nfl/dataSource'
import { readNumerology } from '../nhl/numerology'
import { readNbaNumerology } from '../nba/numerology'
import { slateNight } from '../slateNight'
import { isSportOpen } from '../openSwitch'

const pos = (v) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : null }
const nextOf = (total) => (total == null || !Number.isFinite(Number(total)) ? null : Number(total) + 1)

/** One player -> the shared row. Pure. */
export function shapeRow({ sport, pid, name, team, game = null, gameDate, jersey = null, birthDate = null, seasonTotal = null, unit = null, from = null }) {
  const j = pos(jersey)
  const next = unit ? nextOf(seasonTotal) : null
  return {
    sport, pid: String(pid), name: String(name || ''), team: team || null, game, gameDate, dateRoot: rootOfDigits(gameDate),
    jersey: j, birthDate: birthDate || null, next, unit, from,
    axes: { next: next ? digitRoot(next) : null, jersey: j ? digitRoot(j) : null, day: dayRootOf(birthDate), path: lifePathOf(birthDate) },
  }
}

async function mlbPeople(ids) {
  const out = new Map()
  for (let i = 0; i < ids.length; i += 100) {
    const url = `https://statsapi.mlb.com/api/v1/people?personIds=${ids.slice(i, i + 100).join(',')}&fields=people,id,birthDate`
    try {
      const r = await fetch(url, { next: { revalidate: 24 * 3600 } })   // a birth date never changes
      if (!r.ok) continue
      for (const p of (await r.json())?.people || []) out.set(Number(p.id), String(p.birthDate || ''))
    } catch (e) { console.error(`[numerology all] mlb people: ${e?.message}`) }
  }
  return out
}

// Each reader returns { date, rows, note }. Keyed by sport (lib/routes.js keys), never a sport ternary.
const READERS = {
  mlb: async () => {
    const today = await slateNight('mlb')
    const payload = await fetchJSON(slatePaths('today'))
    const players = Array.isArray(payload) ? payload : payload?.players || []
    const day = (p) => easternDate(Date.parse(p?.game_time || '')) || null
    const tonight = players.filter((p) => day(p) === today)
    if (!tonight.length) return { date: today, rows: [], note: 'No MLB game today' }
    const births = await mlbPeople([...new Set(tonight.map((p) => Number(p.player_id)).filter(Boolean))])
    return {
      date: today, note: null,
      rows: tonight.filter((p) => p.player_id).map((p) => shapeRow({
        sport: 'mlb', pid: p.player_id, name: p.name, team: p.team, game: p.opponent ? [p.team, p.opponent].sort().join(' · ') : null,
        gameDate: today, jersey: p.jersey_number, birthDate: births.get(Number(p.player_id)) || null, seasonTotal: p.season_hr, unit: 'HR',
      })),
    }
  },
  nfl: async () => {
    const today = easternToday()
    const week = await fetchJSON(nflSlatePaths('this'))
    const games = new Map()
    for (const g of week?.games || []) {
      const d = easternDate(Date.parse(g?.kickoff || ''))
      if (!d || d < today) continue
      const v = { d, label: `${g.away}@${g.home}` }
      games.set(g.home, v); games.set(g.away, v)
    }
    const rows = (week?.players || []).filter((p) => p?.player_id && games.has(p.team)).map((p) => shapeRow({
      sport: 'nfl', pid: p.player_id, name: p.name, team: p.team, game: games.get(p.team).label, gameDate: games.get(p.team).d,
      jersey: p.jersey_number, birthDate: p.birth_date, seasonTotal: p.season_td, unit: 'TD',
    }))
    const days = [...new Set(rows.map((r) => r.gameDate))].sort()
    return { date: days[0] || today, rows, note: rows.length ? null : 'No NFL games left this week' }
  },
  nhl: async () => {
    const date = await slateNight('nhl')
    const n = await readNumerology(date, { rosterPreview: true })
    const rows = (n.all || []).map((r) => shapeRow({
      sport: 'nhl', pid: r.id, name: r.name, team: r.team, game: r.game, gameDate: date, jersey: r.jersey, birthDate: r.birthDate,
      seasonTotal: r.seasonGoals, unit: 'goal', from: r.from,
    }))
    return { date, rows, note: rows.length ? null : 'No NHL games today' }
  },
  nba: async () => {
    const date = await slateNight('nba')
    const n = await readNbaNumerology(date)
    const rows = (n.all || []).map((r) => shapeRow({
      sport: 'nba', pid: r.id, name: r.name, team: r.team, game: r.game, gameDate: date, jersey: r.jersey, birthDate: r.birthDate, from: r.from,
    }))
    return { date, rows, note: rows.length ? null : 'No NBA games today' }
  },
}

/** Every open product's rows. A product whose read fails says so (`delayed`); it never empties the others. */
export async function readAllSports() {
  const keys = Object.keys(READERS).filter((k) => isSportOpen(k))
  const parts = await Promise.all(keys.map(async (sport) => {
    try {
      const r = await READERS[sport]()
      return { sport, date: r.date, dateRoot: rootOfDigits(r.date), players: r.rows.length, note: r.note, rows: r.rows }
    } catch (e) {
      console.error(`[numerology all] ${sport}: ${e?.message}`)
      return { sport, date: null, dateRoot: null, players: 0, note: 'LIVE DATA DELAYED', delayed: true, rows: [] }
    }
  }))
  return {
    sports: parts.map(({ rows, ...s }) => ({ ...s, days: [...new Set(rows.map((r) => r.gameDate))].sort() })),
    rows: parts.flatMap((p) => p.rows),
  }
}
