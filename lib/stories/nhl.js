// 🏒 LAMP'S STORIES, ONE ENGINE (BATCH-STORYLINES-PAGE step 1, 2026-09-27).
// Server-safe. What LAMP already measures, as the shared story shape, each
// tied to tonight's game:
//   history   lib/history/watch.js nhlWatch (a goal short of a claimed rung)
//   hot       lib/nhl/hotSticks.js: 4+ goals in his last 5 (3+ was 57 of 720
//             skaters at the end of 2025-26 -- too common to be a story), or a shooting
//             surge of 2+ shots a game (sogDelta: last-5 shots a game minus his season rate,
//             only once he has 10+ season games -- the lib's own rule)
//   rest      lib/nhl/spots.js readRest: a club on the second night of a
//             back-to-back (team-level: player_id 'team:<abbrev>')
//   special   lib/nhl/spots.js readSpecialTeams: a top-5 power play against a
//             bottom-5 penalty kill (league ranks from the same report)
//   multi     the 2+ Club (lib/stories/multi.js)
//   milestone a round number in reach (lib/stories/milestones.js): season goals /
//             points from the league's season report, career goals / assists /
//             points / games from its career aggregate (2026-10-20)
// Past-season numbers (hot sticks / special teams shown "stale" before the
// new season has games) are never a story about tonight.
//
// RARITY: history 0.95 · hot 0.6 + 0.1 per goal past 4 (max 0.8), surge
// 0.5 + 0.1 per shot a game above his rate (max 0.75; 2.0+ above it to count) · special 0.45 ·
// rest 0.35 · multi (see multi.js) · milestone (see milestones.js).
import { scoreFor, nhlStatsGet } from '../nhl/api'
import { reduceScoreDay } from '../nhl/reduce'
import { readHotSticks } from '../nhl/hotSticks'
import { readSpecialTeams, readRest } from '../nhl/spots'
import { nhlWatch } from '../history/watch'
import { story, parts, name, num, byRarity } from './shape'
import { multiStories, readMultiSafe } from './multi'
import { nearestMilestones, milestoneStory } from './milestones'
import { goalStreakList, pointEveryGameList, ironManList, nhlSeasonStarted } from '../lists/nhl'
import { adminClient } from '../supabase/admin'
import { ordinal as ord } from '../format'


export function buildNhlStories({ day, games = [], hot = null, st = null, rest = {}, watch = [], multi = null, totals = [] }) {
  const out = []
  const clubGame = new Map()
  for (const g of games) {
    clubGame.set(g.away.abbrev, { game_id: g.id, opp: g.home.abbrev })
    clubGame.set(g.home.abbrev, { game_id: g.id, opp: g.away.abbrev })
  }
  const base = (p, extra) => {
    const g = clubGame.get(p.team)
    return { sport: 'nhl', day, game_id: g?.game_id ?? null, player_id: p.id ?? p.player_id, name: p.name, team: p.team, opp: g?.opp ?? null, pos: p.pos ?? null, ...extra }
  }

  for (const w of watch || []) {
    if (!clubGame.has(w.team)) continue
    out.push(story(base({ id: w.player_id, name: w.name, team: w.team }, {
      type: 'history', icon: '📜', rarity: 0.95, source: 'hist_nhl (NHL stats API) + this season', proof: w.proof,
      parts: parts(name(w.name), ' has ', num(w.hr), ` goals — one more: ${w.claim}`), numbers: { have: w.hr, rung: w.rung },
    })))
  }

  if (hot && !hot.stale) {
    for (const r of hot.rows || []) {
      if (!clubGame.has(r.team)) continue
      if (r.g5 >= 4) {
        out.push(story(base(r, {
          type: 'hot', icon: '🔥', rarity: Math.min(0.8, 0.6 + 0.1 * (r.g5 - 4)), source: 'NHL stats API skater/summary per game (hot sticks)',
          parts: parts(name(r.name), ' has ', num(r.g5), ` goals in his last ${r.gp5} games, on `, num(r.sog5), ' shots'), numbers: { g5: r.g5, gp5: r.gp5, sog5: r.sog5 },
        })))
      } else if (r.sogDelta != null && r.sogDelta >= 2) {
        out.push(story(base(r, {
          type: 'hot', icon: '🎯', rarity: Math.min(0.75, 0.5 + 0.1 * r.sogDelta), source: 'NHL stats API skater/summary per game vs season (hot sticks)',
          parts: parts(name(r.name), ' is putting ', num(r.sogPg5.toFixed(1)), ' shots a game on net over his last five — ', num(r.sogDelta.toFixed(1)), ' above his season rate'), numbers: { sogPg5: r.sogPg5, sogDelta: r.sogDelta, seasonSogPg: r.seasonSogPg },
        })))
      }
    }
  }

  if (st && !st.stale && st.teams?.length >= 10) {
    const ppRank = new Map([...st.teams].sort((a, b) => b.ppPct - a.ppPct).map((t, i) => [t.abbrev, i + 1]))
    const pkRank = new Map([...st.teams].sort((a, b) => b.pkPct - a.pkPct).map((t, i) => [t.abbrev, i + 1]))
    const nTeams = st.teams.length
    const by = new Map(st.teams.map((t) => [t.abbrev, t]))
    for (const g of games) {
      for (const [a, b] of [[g.away.abbrev, g.home.abbrev], [g.home.abbrev, g.away.abbrev]]) {
        const pa = ppRank.get(a), kb = pkRank.get(b)
        if (!pa || !kb || pa > 5 || kb <= nTeams - 5) continue
        out.push(story({
          sport: 'nhl', day, game_id: g.id, player_id: `team:${a}`, name: a, team: a, opp: b, type: 'special', icon: '⚡', rarity: 0.45,
          source: `NHL stats API power-play / penalty-kill reports (${st.seasonLabel})`,
          parts: parts(name(a), "'s power play (", num(`${(100 * by.get(a).ppPct).toFixed(1)}%`), `, ${ord(pa)}) meets `, name(b), "'s penalty kill (", num(`${(100 * by.get(b).pkPct).toFixed(1)}%`), `, ${ord(kb)})`),
          numbers: { ppPct: by.get(a).ppPct, ppRank: pa, pkPct: by.get(b).pkPct, pkRank: kb },
        }))
      }
    }
  }

  for (const g of games) {
    for (const ab of [g.away.abbrev, g.home.abbrev]) {
      if (!rest?.[ab]?.b2b) continue
      out.push(story({
        sport: 'nhl', day, game_id: g.id, player_id: `team:${ab}`, name: ab, team: ab, opp: clubGame.get(ab)?.opp ?? null, type: 'rest', icon: '😮‍💨', rarity: 0.35,
        source: 'NHL club schedule (last final before tonight)',
        parts: parts(name(ab), ' is on the second night of a back-to-back (played ', num(rest[ab].last), ')'), numbers: { last: rest[ab].last },
      }))
    }
  }

  // Milestones: tonight's skaters only, his nearest rung (one story each).
  const claimed = new Set((watch || []).map((w) => `${w.player_id}|${w.rung}`))   // History Watch's rung is that story's
  for (const x of nearestMilestones('nhl', (totals || []).filter((t) => clubGame.has(t.p.team)))) {
    if (x.m.scope === 'season' && x.m.key === 'goals' && claimed.has(`${x.p.id}|${x.t}`)) continue
    out.push(milestoneStory(base(x.p, {}), x, 'NHL stats API skater/summary (this season + career aggregate, regular season)'))
  }

  if (multi) {
    const players = new Map()
    for (const r of hot?.stale ? [] : hot?.rows || []) { const g = clubGame.get(r.team); if (g) players.set(String(r.id), { game_id: g.game_id, day, name: r.name, team: r.team, opp: g.opp }) }
    out.push(...multiStories('nhl', players, multi))
  }

  return out.filter((s) => s.game_id).sort(byRarity)
}

const db = () => {
  return adminClient()
}

/**
 * Season + career totals entering tonight for the skaters who've played this
 * regular season on tonight's clubs: [{ p: { id, name, team }, season, career }].
 * Two league reports (the season's, then the career aggregate for those ids),
 * cached an hour. Empty outside the regular season -- a preseason goal is not a season goal.
 */
export async function readNhlMilestoneTotals(season, clubs) {
  if (!season || !clubs?.length) return []
  const want = new Set(clubs)
  const q = (exp) => encodeURIComponent(exp)
  const cur = await nhlStatsGet(`/skater/summary?limit=-1&cayenneExp=${q(`seasonId=${season} and gameTypeId=2`)}`, 3600)
  // teamAbbrevs lists every club he played for this season, the current one last
  const mine = (cur?.data || []).map((r) => ({ r, team: String(r.teamAbbrevs || '').split(',').pop().trim() })).filter((x) => want.has(x.team))
  if (!mine.length) return []
  const career = new Map()
  for (let i = 0; i < mine.length; i += 150) {
    const ids = mine.slice(i, i + 150).map((x) => x.r.playerId).join(',')
    const j = await nhlStatsGet(`/skater/summary?isAggregate=true&isGame=false&limit=-1&cayenneExp=${q(`gameTypeId=2 and seasonId>=19171918 and seasonId<=${season} and playerId in (${ids})`)}`, 3600)
    for (const r of j?.data || []) career.set(r.playerId, r)
  }
  return mine.map(({ r, team }) => {
    const c = career.get(r.playerId)
    return {
      p: { id: String(r.playerId), name: r.skaterFullName, team, pos: r.positionCode || null },
      season: { goals: r.goals, points: r.points },
      career: c ? { goals: c.goals, assists: c.assists, points: c.points, gamesPlayed: c.gamesPlayed } : null,
    }
  })
}

/** Every LAMP story for a date (the game's own date). */
export async function loadNhlStories(date) {
  const day = reduceScoreDay(await scoreFor(date))
  const games = (day.games || []).filter((g) => g.scheduleState === 'OK')
  if (!games.length) return { day: date, games: [], stories: [] }
  const clubs = [...new Set(games.flatMap((g) => [g.away.abbrev, g.home.abbrev]))]
  const regular = games.some((g) => g.gameType === 2)
  const [hot, st, rest, watch, multi, totals] = await Promise.all([
    readHotSticks().catch(() => null),
    readSpecialTeams().catch(() => null),
    readRest(clubs, date).catch(() => ({})),
    nhlWatch(date).catch(() => []),
    readMultiSafe(db(), 'nhl'),
    regular ? readNhlMilestoneTotals(day.season, clubs).catch((e) => { console.error(`[stories] nhl milestones: ${e?.message}`); return [] }) : [],
  ])
  const stories = buildNhlStories({ day: date, games, hot, st, rest, watch, multi, totals })
  // THE LISTS AS STORIES (BATCH-LIST-POSTS step 5): the same rows the list
  // posts use (lib/lists/nhl.js), for tonight's players. Empty before the
  // season's first game (the lists are this season's).
  if (await nhlSeasonStarted(date).catch(() => false)) {
    const [gs, pe, im] = await Promise.all([goalStreakList(date).catch(() => null), pointEveryGameList(date).catch(() => null), ironManList(date).catch(() => null)])
    stories.push(...nhlListStories(date, games, { goal: gs?.rows || [], point: pe?.rows || [], iron: im?.rows || [] }))
  }
  return { day: date, games, stories: stories.sort(byRarity) }
}

/**
 * Pure: LAMP list rows as stories for tonight's games. RARITY: goal streak
 * 0.75 (+0.03 a game past four, max 0.85), a point in every game 0.70, iron
 * man 0.60.
 */
export function nhlListStories(day, games, { goal = [], point = [], iron = [] }) {
  const clubGame = new Map()
  for (const g of games) { clubGame.set(g.away.abbrev, { game_id: g.id, opp: g.home.abbrev }); clubGame.set(g.home.abbrev, { game_id: g.id, opp: g.away.abbrev }) }
  const out = []
  const mk = (r, type, rarity, ps, numbers) => {
    const g = clubGame.get(r.team)
    if (g) out.push(story({ sport: 'nhl', day, game_id: g.game_id, player_id: r.id, name: r.name, team: r.team, opp: g.opp, type, icon: '📋', rarity, source: 'NHL stats API (the list posts)', parts: ps, numbers }))
  }
  for (const r of goal) mk(r, 'goal_streak', Math.min(0.85, 0.75 + 0.03 * (r.check.streak - 4)), parts(name(r.name), ' has a goal in ', num(r.check.streak), ' straight games'), r.check)
  for (const r of point) mk(r, 'point_streak', 0.7, parts(name(r.name), ' has a point in every game this season — ', num(r.fact)), r.check)
  for (const r of iron) mk(r, 'iron_man', 0.6, parts(name(r.name), ` has played ${r.fact.startsWith('at least') ? 'at least ' : ''}`, num(r.check.total.toLocaleString('en-US')), ' games in a row'), r.check)
  return out
}
