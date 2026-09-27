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
// Past-season numbers (hot sticks / special teams shown "stale" before the
// new season has games) are never a story about tonight.
//
// RARITY: history 0.95 · hot 0.6 + 0.1 per goal past 4 (max 0.8), surge
// 0.5 + 0.1 per shot a game above his rate (max 0.75; 2.0+ above it to count) · special 0.45 ·
// rest 0.35 · multi (see multi.js).
import { createClient } from '@supabase/supabase-js'
import { scoreFor } from '../nhl/api'
import { reduceScoreDay } from '../nhl/reduce'
import { readHotSticks } from '../nhl/hotSticks'
import { readSpecialTeams, readRest } from '../nhl/spots'
import { nhlWatch } from '../history/watch'
import { story, parts, name, num, byRarity } from './shape'
import { multiStories, readMultiSafe } from './multi'
import { goalStreakList, pointEveryGameList, ironManList, nhlSeasonStarted } from '../lists/nhl'

const ord = (n) => { const s = ['th', 'st', 'nd', 'rd'], v = n % 100; return n + (s[(v - 20) % 10] || s[v] || s[0]) }

export function buildNhlStories({ day, games = [], hot = null, st = null, rest = {}, watch = [], multi = null }) {
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

  if (multi) {
    const players = new Map()
    for (const r of hot?.stale ? [] : hot?.rows || []) { const g = clubGame.get(r.team); if (g) players.set(String(r.id), { game_id: g.game_id, day, name: r.name, team: r.team, opp: g.opp }) }
    out.push(...multiStories('nhl', players, multi))
  }

  return out.filter((s) => s.game_id).sort(byRarity)
}

const db = () => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  return url && key ? createClient(url, key, { auth: { persistSession: false } }) : null
}

/** Every LAMP story for a date (the game's own date). */
export async function loadNhlStories(date) {
  const day = reduceScoreDay(await scoreFor(date))
  const games = (day.games || []).filter((g) => g.scheduleState === 'OK')
  if (!games.length) return { day: date, games: [], stories: [] }
  const clubs = [...new Set(games.flatMap((g) => [g.away.abbrev, g.home.abbrev]))]
  const [hot, st, rest, watch, multi] = await Promise.all([
    readHotSticks().catch(() => null),
    readSpecialTeams().catch(() => null),
    readRest(clubs, date).catch(() => ({})),
    nhlWatch(date).catch(() => []),
    readMultiSafe(db(), 'nhl'),
  ])
  const stories = buildNhlStories({ day: date, games, hot, st, rest, watch, multi })
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
