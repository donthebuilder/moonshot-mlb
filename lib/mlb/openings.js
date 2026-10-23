// ⚾ THE OPENING OF A BASEBALL GAME (2026-10-22, Donovan: "first inning, first hit"; the core lanes: "a real first everything
// model"). Plan: claude/BATCH-FIRSTS-PLAN-2026-10-22.txt. The same openings tables BUCKETS fills (lib/nba/openings.js), with
// baseball's own columns (supabase/migrations/202610221500_openings_mlb.sql):
//
//   the game    runs each club scored in the 1st · the first run (club, the runner, the plate appearance it came on)
//               · the first hit and the first homer of the game (club, batter, plate appearance)
//   a starter   his slot · his 1st inning: plate appearances, hits, homers, total bases, runs, RBI
//
// Pure: statsapi's live feed for one FINAL game in (feedUrl, fields-trimmed to ~70 KB), the two rows out. No clock, no guess: a
// game that isn't final, or a game type that isn't spring / regular / October, gives null. A play that ends the half-inning on
// the bases (caught stealing, pickoff) is not a plate appearance; the batter leads off the next inning.
import { teamKey } from '../mlbTeams'

// ESPN's numbers, which the NBA rows already use: 1 pre (spring training), 2 regular, 3 post. All-Star and exhibitions: none.
const SEASON_TYPE = { S: 1, R: 2, F: 3, D: 3, L: 3, W: 3 }
const HIT_TB = { single: 1, double: 2, triple: 3, home_run: 4 }
// result.eventType values that end a play without ending the batter's plate appearance
const NOT_PA = /^(caught_stealing|pickoff|stolen_base|wild_pitch|passed_ball|balk|other_advance|other_out|defensive_indiff|runner_double_play|game_advisory|ejection|batter_timeout|mound_visit|no_pitch|os_ruling_pending)/

const FEED_FIELDS = [
  'gamePk', 'gameData', 'game', 'type', 'season', 'datetime', 'officialDate', 'status', 'abstractGameState', 'teams', 'away', 'home',
  'abbreviation', 'players', 'id', 'fullName',
  'liveData', 'plays', 'allPlays', 'result', 'eventType', 'rbi', 'awayScore', 'homeScore', 'about', 'atBatIndex', 'inning',
  'isTopInning', 'matchup', 'batter', 'runners', 'movement', 'end', 'details', 'runner', 'isScoringEvent',
  'boxscore', 'person', 'battingOrder', 'position', 'allPositions',
].join(',')
export const feedUrl = (gamePk) => `https://statsapi.mlb.com/api/v1.1/game/${gamePk}/feed/live?fields=${FEED_FIELDS}`

const code = (abbr) => teamKey(abbr) || String(abbr || '').toUpperCase() || null
const idOf = (x) => (x?.id != null ? String(x.id) : null)
const scoredOn = (play) => (play?.runners || []).filter((r) => r?.movement?.end === 'score' && r?.details?.isScoringEvent !== false)

/** One final game's openings: { game, players } in the table shapes, or null. */
export function mlbOpeningRows(feed) {
  const gd = feed?.gameData, ld = feed?.liveData
  if (gd?.status?.abstractGameState !== 'Final') return null
  const seasonType = SEASON_TYPE[gd?.game?.type]
  if (!seasonType) return null
  const plays = [...(ld?.plays?.allPlays || [])].sort((a, b) => (a?.about?.atBatIndex ?? 0) - (b?.about?.atBatIndex ?? 0))
  if (!plays.length) return null
  const home = code(gd?.teams?.home?.abbreviation), away = code(gd?.teams?.away?.abbreviation)
  if (!home || !away) return null
  const gameId = String(feed?.gamePk ?? ld?.boxscore?.gamePk ?? gd?.game?.pk ?? '')
  const gameDate = gd?.datetime?.officialDate
  if (!gameId || !gameDate) return null
  const season = Number(gd?.game?.season) || Number(String(gameDate).slice(0, 4))
  const names = new Map(Object.values(gd?.players || {}).map((p) => [String(p?.id), p?.fullName || null]))

  // the starters, from the box: battingOrder "300" = started in the 3rd slot ("301" came in for him)
  const per = new Map()
  for (const side of ['away', 'home']) {
    for (const p of Object.values(ld?.boxscore?.teams?.[side]?.players || {})) {
      const bo = Number(p?.battingOrder)
      if (!Number.isFinite(bo) || bo % 100 !== 0) continue
      const id = idOf(p?.person)
      if (!id) continue
      per.set(id, {
        player_id: id, name: p?.person?.fullName || names.get(id) || null, team: side === 'home' ? home : away,
        pos: p?.allPositions?.[0]?.abbreviation || p?.position?.abbreviation || null, starter: true, bat_order: bo / 100,
        p1_att: 0, p1_made: 0, p1_hr: 0, p1_tb: 0, p1_runs: 0, p1_rbi: 0,
      })
    }
  }

  const game = {
    sport: 'mlb', game_id: gameId, game_date: gameDate, season, season_type: seasonType, home, away,
    win1_s: null, win2_s: null, jump_win_team: null, jump_players: null,
    first_att_team: null, first_att_player: null, first_att_clock_s: null,
    first_score_team: null, first_score_player: null, first_score_clock_s: null, first_score_pts: null,
    first_hit_team: null, first_hit_player: null, first_hit_pa: null,
    first_hr_team: null, first_hr_player: null, first_hr_pa: null,
    p1_home_pts: 0, p1_away_pts: 0,
  }
  let pa = 0, lastAway = 0, lastHome = 0
  for (const play of plays) {
    const ev = String(play?.result?.eventType || '')
    const inning = Number(play?.about?.inning)
    const bat = play?.about?.isTopInning ? away : home
    const batter = idOf(play?.matchup?.batter)
    const isPa = ev !== '' && !NOT_PA.test(ev)
    if (isPa) pa += 1
    if (isPa && pa === 1) Object.assign(game, { first_att_team: bat, first_att_player: batter, first_att_clock_s: 1 })
    const tb = HIT_TB[ev] || 0
    if (isPa && tb && !game.first_hit_team) Object.assign(game, { first_hit_team: bat, first_hit_player: batter, first_hit_pa: pa })
    if (isPa && ev === 'home_run' && !game.first_hr_team) Object.assign(game, { first_hr_team: bat, first_hr_player: batter, first_hr_pa: pa })
    // the first run: the first play the score moved on (the feed's own score after the play)
    const aS = Number(play?.result?.awayScore) || 0, hS = Number(play?.result?.homeScore) || 0
    const runs = scoredOn(play)
    if (!game.first_score_team && aS + hS > 0) {
      Object.assign(game, { first_score_team: aS > lastAway ? away : home, first_score_player: idOf(runs[0]?.details?.runner),
        first_score_clock_s: Math.max(pa, 1), first_score_pts: (aS - lastAway) + (hS - lastHome) })
    }
    lastAway = aS; lastHome = hS
    if (inning !== 1) continue
    game.p1_away_pts = aS; game.p1_home_pts = hS
    const s = batter && per.get(batter)
    if (s && isPa) {
      s.p1_att += 1
      if (tb) { s.p1_made += 1; s.p1_tb += tb }
      if (ev === 'home_run') s.p1_hr += 1
      s.p1_rbi += Number(play?.result?.rbi) || 0
    }
    for (const r of runs) { const x = per.get(idOf(r?.details?.runner)); if (x) x.p1_runs += 1 }
  }
  if (!pa) return null
  const players = [...per.values()].map((p) => ({ sport: 'mlb', game_id: gameId, game_date: gameDate, season, season_type: seasonType, ...p }))
  return { game, players }
}

/** Upsert one game's rows. Re-running a final game writes the same numbers. */
export async function writeMlbOpening(db, rows, source = 'tick') {
  if (!db || !rows?.game) return 'skipped'
  const g = await db.from('opening_games').upsert({ ...rows.game, source }, { onConflict: 'sport,game_id' })
  if (g.error) throw new Error(`opening_games: ${g.error.message}`)
  if (rows.players.length) {
    const p = await db.from('opening_players').upsert(rows.players.map((r) => ({ ...r, source })), { onConflict: 'sport,game_id,player_id' })
    if (p.error) throw new Error(`opening_players: ${p.error.message}`)
  }
  return 'written'
}

/**
 * THE TICK'S PART (rides /api/dash/homers/tick, no cron of its own): every final game of `days` not yet on file, at most `max`
 * a call. One small schedule read and one small select; a feed only for a game that needs writing.
 */
export async function mlbOpeningsTick(db, days, { max = 3, fetchImpl = fetch } = {}) {
  if (!db || !days?.length) return { written: 0 }
  const qs = `sportId=1&startDate=${days[0]}&endDate=${days[days.length - 1]}&fields=dates,games,gamePk,gameType,status,abstractGameState`
  const res = await fetchImpl(`https://statsapi.mlb.com/api/v1/schedule?${qs}`)
  if (!res.ok) throw new Error(`schedule ${res.status}`)
  const sched = await res.json()
  const finals = (sched?.dates || []).flatMap((d) => d.games || [])
    .filter((g) => g?.status?.abstractGameState === 'Final' && SEASON_TYPE[g?.gameType]).map((g) => String(g.gamePk))
  if (!finals.length) return { written: 0 }
  const have = await db.from('opening_games').select('game_id').eq('sport', 'mlb').in('game_id', finals)
  if (have.error) throw new Error(have.error.message)
  const on = new Set((have.data || []).map((r) => String(r.game_id)))
  let written = 0
  for (const pk of finals.filter((x) => !on.has(x)).slice(0, max)) {
    const f = await fetchImpl(feedUrl(pk))
    if (!f.ok) continue
    const rows = mlbOpeningRows(await f.json())
    if (rows && (await writeMlbOpening(db, rows)) === 'written') written += 1
  }
  return { written, waiting: finals.length - on.size - written }
}
