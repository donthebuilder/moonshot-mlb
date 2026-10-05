// 🔮 BUCKETS NUMEROLOGY (parity, 2026-10-05) -- LAMP's lib/nhl/numerology.js,
// basketball's. Server only. FOR FUN: numbers that line up, not a prediction.
// Not graded, never in the score, never on the board.
//
// WHO: a game that has tipped lists the players who got in (the ESPN box, DNPs
// out); a game still ahead lists its two clubs' rosters -- basketball posts no
// dressed list before tip, so the roster is the nearest thing and the page says so.
//
// Three axes, each reduced to a digit root (17 -> 8), matched against the
// night's own root (every digit of the date):
//   JERSEY  his number (teams/{id}/roster `jersey`)
//   DAY     his birth day-of-month (same roster, `dateOfBirth`)
//   PATH    his life path, every birth digit (same)
// A missing field sits that axis out; nothing is defaulted to zero.
import { scoreboardFor, reduceScoreboard, summaryFor, reduceBox, rosterFor } from './api'
import { digitRoot, rootOfDigits } from '../numerology/core'

const num = (v) => { const x = Number(v); return Number.isFinite(x) && x >= 0 && String(v).trim() !== '' ? x : null }

export async function readNbaNumerology(date) {
  const games = reduceScoreboard(await scoreboardFor(date)).filter((g) => [1, 2, 3].includes(g.seasonType) && g.state !== 'postponed' && g.state !== 'canceled')
  const dateRoot = rootOfDigits(date)
  // every club's roster: jersey + birth date (cached an hour upstream)
  const people = new Map()
  const clubs = [...new Map(games.flatMap((g) => [[g.away.id, g.away.abbrev], [g.home.id, g.home.abbrev]])).entries()]
  const rosters = new Map()
  await Promise.all(clubs.map(async ([id, abbrev]) => {
    try {
      const list = (await rosterFor(id))?.athletes || []
      rosters.set(abbrev, list.map((a) => String(a.id)))
      for (const a of list) {
        people.set(String(a.id), {
          name: String(a.displayName || ''), pos: a.position?.abbreviation || null, team: abbrev,
          jersey: num(a.jersey), birthDate: a.dateOfBirth ? String(a.dateOfBirth).slice(0, 10) : null,
        })
      }
    } catch (e) { console.error(`[buckets numerology] roster ${abbrev}: ${e?.message}`) }
  }))
  const out = []
  let axes = 0
  await Promise.all(games.map(async (g) => {
    let ids = []
    let from = 'roster'
    if (g.state !== 'pre') {
      const box = await summaryFor(g.id, g.state === 'final').then(reduceBox).catch(() => null)
      if (box?.length) { ids = box.filter((b) => !b.dnp).map((b) => [b.id, b.team, b.name]); from = 'box' }
    }
    if (from === 'roster') ids = [g.away.abbrev, g.home.abbrev].flatMap((t) => (rosters.get(t) || []).map((id) => [id, t, null]))
    for (const [id, team, boxName] of ids) {
      const p = people.get(String(id)) || {}
      const jersey = p.jersey ?? null
      const birth = p.birthDate || null
      const bday = birth ? Number(birth.slice(8, 10)) || null : null
      const ax = { jersey: jersey > 0 ? digitRoot(jersey) : null, day: bday ? digitRoot(bday) : null, path: birth ? rootOfDigits(birth) : null }
      axes += Object.values(ax).filter((v) => v != null).length
      const hit = Object.entries(ax).filter(([, v]) => v != null && v === dateRoot).map(([k]) => k)
      out.push({
        id: String(id), name: p.name || boxName || '', team, pos: p.pos || null, jersey, birthDate: birth, roots: ax, hits: hit, n: hit.length,
        game: `${g.away.abbrev}@${g.home.abbrev}`, gameId: g.id, from,
      })
    }
  }))
  const aligned = out.filter((r) => r.n > 0).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
  return {
    date, dateRoot, games: games.length, players: out.length,
    fromRoster: [...new Set(out.filter((r) => r.from === 'roster').map((r) => r.game))].sort(),
    all: out,
    aligned, alignedHits: aligned.reduce((n, r) => n + r.n, 0), expectedHits: Math.round((10 * axes) / 9) / 10,
  }
}
