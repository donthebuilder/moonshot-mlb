// 🥇 FIRST SCORERS, ALL THREE (2026-09-27, ledger plan step 2). Server only.
// Read from the event tables already written -- nothing new is stored, no
// prediction is made (a first-scorer pick needs its own model and a graded
// archive; this is the tracking that archive will be built from):
//   MLB  the first HOME RUN of each game: homer_feed by game_pk, earliest
//        half-inning ("top 1st" < "bot 1st" < "top 2nd"), then seen_at.
//        It is the first homer, not the first run -- said on the page.
//   NFL  the first TOUCHDOWN of each game: nfl_td_feed td_n = 1 (ESPN's own
//        order of scoring plays in the game)
//   NHL  the first GOAL of each game: lamp_goal_feed goal_n = 1, not
//        overturned
//   NBA  the first BASKET (made field goal) of each game: buckets_feed kind
//        first_fg (lib/nba/firstFeed, written at grade time), regular season
//        and playoffs, with the status his first_fg row locked with
// Status is the product's own three words (lib/callStatus.js for MLB/NFL;
// LAMP's row carries the goal model's status). The season line counts how
// many first scorers the board had.
import { callStatus, tdCallStatus } from '../callStatus'
import { periodWord } from '../nfl/period'

const inningKey = (s) => {
  const m = /^(top|bot)\s+(\d+)/i.exec(String(s || '').trim())
  return m ? Number(m[2]) * 2 + (m[1].toLowerCase() === 'bot' ? 1 : 0) : 999
}

async function pageAll(q) {
  const out = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await q().range(from, from + 999)
    if (error) throw new Error(error.message)
    out.push(...(data || []))
    if (!data || data.length < 1000) break
  }
  return out
}

const READ = {
  async mlb(db, since, until) {
    const rows = await pageAll(() => db.from('homer_feed').select('day, game_pk, player_id, name, team, opponent, home, inning, role, on_board, seen_at')
      .gte('day', since).lte('day', until).order('day', { ascending: true }).order('seen_at', { ascending: true }))
    const byGame = new Map()
    for (const r of rows) {
      if (!r.game_pk) continue
      const k = `${r.day}|${r.game_pk}`
      const cur = byGame.get(k)
      if (!cur || inningKey(r.inning) < inningKey(cur.inning) || (inningKey(r.inning) === inningKey(cur.inning) && r.seen_at < cur.seen_at)) byGame.set(k, r)
    }
    return [...byGame.values()].map((r) => ({
      day: r.day, gameId: String(r.game_pk), game: r.home ? `${r.opponent} @ ${r.team}` : `${r.team} @ ${r.opponent}`,
      playerId: String(r.player_id), name: r.name, team: r.team, when: r.inning || '', status: callStatus(r),
    }))
  },
  async nfl(db, since, until) {
    const rows = await pageAll(() => db.from('nfl_td_feed').select('day, game_id, td_n, team, opponent, quarter, clock, scorer_name, gsis_id, text, on_bot, td_board')
      .gte('day', since).lte('day', until).eq('td_n', 1).order('day', { ascending: true }))
    return rows.map((r) => ({
      day: r.day, gameId: String(r.game_id), game: `${r.team} v ${r.opponent}`,
      playerId: r.gsis_id || null, name: r.scorer_name || '(scorer not parsed)', team: r.team,
      when: [r.quarter ? periodWord(r.quarter) : null, r.clock].filter(Boolean).join(' '), status: tdCallStatus(r),
    }))
  },
  async nhl(db, since, until) {
    const rows = await pageAll(() => db.from('lamp_goal_feed').select('day, game_id, goal_n, player_id, name, team, opp, period, time_in_period, status, overturned_at')
      .gte('day', since).lte('day', until).eq('goal_n', 1).eq('game_type', 2).is('overturned_at', null).order('day', { ascending: true }))
    return rows.map((r) => ({
      day: r.day, gameId: String(r.game_id), game: `${r.team} v ${r.opp || '?'}`,
      playerId: String(r.player_id), name: r.name, team: r.team,
      when: [r.period ? `P${r.period}` : null, r.time_in_period].filter(Boolean).join(' '), status: r.status || 'off',
    }))
  },
  async nba(db, since, until) {
    const rows = await pageAll(() => db.from('buckets_feed').select('game_date, game_id, player_id, name, team, opp, points, status, season_type')
      .gte('game_date', since).lte('game_date', until).eq('kind', 'first_fg').in('season_type', [2, 3]).order('game_date', { ascending: true }))
    return rows.map((r) => ({
      day: r.game_date, gameId: String(r.game_id), game: `${r.team} v ${r.opp || '?'}`,
      playerId: String(r.player_id), name: r.name, team: r.team,
      when: r.points === 3 ? 'a three' : '', status: r.status || 'off',
    }))
  },
}

/** { games: tonight's/this window's first scorers, season: { games, called, board, off, top: [{ name, n }] } } */
export async function readFirstScorers(db, sport, { day, since, seasonSince }) {
  const read = READ[sport]
  if (!read) throw new Error(`no first-scorer reader for ${sport}`)
  const season = await read(db, seasonSince, day)
  const recent = season.filter((r) => r.day >= since && r.day <= day).sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : 0))
  const count = (k) => season.filter((r) => r.status === k).length
  const byPlayer = new Map()
  for (const r of season) {
    const k = r.playerId || r.name
    const o = byPlayer.get(k) || { name: r.name, team: r.team, n: 0 }
    o.n += 1; byPlayer.set(k, o)
  }
  return {
    sport, day, since, seasonSince,
    games: recent,
    season: { games: season.length, called: count('called'), board: count('board'), off: count('off'), top: [...byPlayer.values()].sort((a, b) => b.n - a.n).slice(0, 10) },
  }
}
