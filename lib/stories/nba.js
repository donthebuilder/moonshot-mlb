// 🏀 BUCKETS' STORIES (2026-10-03), LAMP's engine shape (lib/stories/nhl.js):
// what BUCKETS already measures, as the shared story shape, each tied to the
// day's game:
//   hot       lib/nba/hot.js: a scoring surge -- last 5 games 6+ points a game
//             above his season, at 18+ a game -- or a RUN of 3+ straight
//             25-point games (his log, newest first)
//   defense   /api/buckets/defense's numbers: a club facing one of the three
//             defences that allow the most points (team-level: 'team:<abbrev>')
//   rest      the ESPN scoreboard: a club that played yesterday (team-level)
// Past-season numbers (logs and defence before this season has games) are
// never a story about tonight -- the LAMP rule -- so before opening night only
// back-to-backs appear.
// RARITY: run 0.7 + 0.05 per game past 3 (max 0.9) · surge 0.5 + 0.03 per
// point above his season past 6 (max 0.75) · defense 0.4 · rest 0.35.
import { scoreboardFor, reduceScoreboard } from '../nba/api'
import { seasonStats } from '../nba/stats'
import { nbaSeason } from '../nba/season'
import { hotRows } from '../nba/hot'
import { shiftDay } from '../data'
import { story, parts, name, num, byRarity } from './shape'

export function buildNbaStories({ day, games = [], hot = null, soft = [], yesterday = new Set() }) {
  const out = []
  const clubGame = new Map()
  for (const g of games) { clubGame.set(g.away.abbrev, { game_id: g.id, opp: g.home.abbrev }); clubGame.set(g.home.abbrev, { game_id: g.id, opp: g.away.abbrev }) }
  const base = (r) => { const g = clubGame.get(r.team); return { sport: 'nba', day, game_id: g?.game_id ?? null, player_id: r.playerId, name: r.name, team: r.team, opp: g?.opp ?? null, pos: r.pos ?? null } }
  if (hot && !hot.stale) {
    for (const r of hot.rows || []) {
      if (!clubGame.has(r.team)) continue
      if (r.run25 >= 3) {
        out.push(story({ ...base(r), type: 'run', icon: '🔥', rarity: Math.min(0.9, 0.7 + 0.05 * (r.run25 - 3)), source: 'ESPN game log (regular season + playoffs)',
          parts: parts(name(r.name), ' has scored 25+ in ', num(r.run25), ' straight games'), numbers: { run25: r.run25 } }))
      } else if (r.pts.l5 != null && r.pts.szn != null && r.pts.l5 >= 18 && r.pts.l5 - r.pts.szn >= 6) {
        const up = Math.round((r.pts.l5 - r.pts.szn) * 10) / 10
        out.push(story({ ...base(r), type: 'hot', icon: '🏀', rarity: Math.min(0.75, 0.5 + 0.03 * (up - 6)), source: 'ESPN game log, last 5 vs season',
          parts: parts(name(r.name), ' is scoring ', num(r.pts.l5.toFixed(1)), ' a game over his last five — ', num(up.toFixed(1)), ' above his season'), numbers: { l5: r.pts.l5, szn: r.pts.szn, up } }))
      }
    }
  }
  for (const d of soft) {
    for (const g of games) {
      for (const [att, def] of [[g.away.abbrev, g.home.abbrev], [g.home.abbrev, g.away.abbrev]]) {
        if (def !== d.abbrev) continue
        out.push(story({ sport: 'nba', day, game_id: g.id, player_id: `team:${att}`, name: att, team: att, opp: def, type: 'defense', icon: '🛡', rarity: 0.4, source: 'ESPN league stats by team, Opponent block',
          parts: parts(name(att), ' faces ', name(def), ', whose defence allows ', num(d.oppPts.toFixed(1)), ` points a game (${d.rank === 1 ? 'the most' : `#${d.rank}`} in the league)`), numbers: { oppPts: d.oppPts, rank: d.rank } }))
      }
    }
  }
  for (const g of games) {
    for (const ab of [g.away.abbrev, g.home.abbrev]) {
      if (!yesterday.has(ab)) continue
      out.push(story({ sport: 'nba', day, game_id: g.id, player_id: `team:${ab}`, name: ab, team: ab, opp: clubGame.get(ab)?.opp ?? null, type: 'rest', icon: '😮‍💨', rarity: 0.35, source: 'ESPN scoreboard, the day before',
        parts: parts(name(ab), ' is on the second night of a back-to-back'), numbers: {} }))
    }
  }
  return out.filter((s) => s.game_id).sort(byRarity)
}

/** Every BUCKETS story for a date (the game's own ET date). */
export async function loadNbaStories(date) {
  const games = reduceScoreboard(await scoreboardFor(date))
  if (!games.length) return { day: date, games: [], stories: [] }
  const sn = await nbaSeason()
  const [hot, stats, prev] = await Promise.all([
    hotRows(date).catch(() => null),
    sn.stale ? null : seasonStats(sn.read).catch(() => null),
    scoreboardFor(shiftDay(date, -1)).then(reduceScoreboard).catch(() => []),
  ])
  const ranked = stats ? [...stats.teams.values()].filter((t) => t.oppPts != null).sort((a, b) => b.oppPts - a.oppPts) : []
  const soft = ranked.slice(0, 3).map((t, i) => ({ abbrev: t.abbrev, oppPts: t.oppPts, rank: i + 1 }))
  const yesterday = new Set(prev.flatMap((g) => [g.away.abbrev, g.home.abbrev]))
  return { day: date, games, stories: buildNbaStories({ day: date, games, hot, soft, yesterday }) }
}
