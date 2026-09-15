import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { fetchNfl, nflFantasyStatsLooksReal, nflFantasyStatsPaths, nflSlateLooksReal, nflSlatePaths } from '../nfl/dataSource'
import { normalizeNflCatalog } from '../nfl/playerCatalog'
import { fantasyDefenseCatalog } from '../nfl/teams'
import { dashScore, projectedFantasyPoints, withSeasonValue } from './scoring'

const numberFrom=(source,keys)=>{for(const key of keys){const value=Number(source?.[key]);if(Number.isFinite(value))return value}return undefined}

function normalizeStats(raw={}) {
  const stats={...raw}
  const aliases={
    passing_yards:['passing_yards','pass_yds','passingYards'],passing_touchdowns:['passing_touchdowns','pass_tds','passingTouchdowns'],
    interceptions:['interceptions','pass_int','passingInterceptions'],rushing_yards:['rushing_yards','rush_yds','rushingYards'],
    rushing_touchdowns:['rushing_touchdowns','rush_tds','rushingTouchdowns'],receiving_yards:['receiving_yards','rec_yds','receivingYards'],
    receiving_touchdowns:['receiving_touchdowns','rec_tds','receivingTouchdowns'],receptions:['receptions','rec'],
    fumbles_lost:['fumbles_lost','lost_fumbles'],two_point_conversions:['two_point_conversions','two_point'],
    field_goals_0_39:['field_goals_0_39','fg_0_39'],field_goals_40_49:['field_goals_40_49','fg_40_49'],
    field_goals_50_plus:['field_goals_50_plus','fg_50_plus'],extra_points:['extra_points','pat'],
    def_sacks:['def_sacks','sacks'],def_interceptions:['def_interceptions','def_int'],
    def_fumble_recoveries:['def_fumble_recoveries','fumble_recoveries'],def_touchdowns:['def_touchdowns','def_tds'],
    points_allowed:['points_allowed'],def_safeties:['def_safeties'],return_touchdowns:['return_touchdowns'],
  }
  for(const [canonical,keys] of Object.entries(aliases)){const value=numberFrom(raw,keys);if(value!==undefined)stats[canonical]=value}
  return stats
}

function gameStatus(game) {
  const state=String(game?.status||game?.state||'').toLowerCase()
  if(game?.completed||['final','post','completed','closed'].includes(state))return 'final'
  if(['live','in','in_progress','halftime'].includes(state))return 'live'
  return 'scheduled'
}

// ── THE BOX SCORES (2026-09-14) ─────────────────────────────────────────────
//
// Every player scored ZERO for all of Week 1. This file read
// `player.game_stats` off the slate and the bot never published one -- 535
// players, no stat line on any of them -- so sync_nfl_week_feed wrote `{}`
// for everybody and fantasy_points_for_stats summed nothing. Only D/ST moved,
// off points allowed. The scheduler, the sync, the SQL and the matchup page
// were all working correctly on an empty object.
//
// The bot now publishes nfl_fantasy_stats.json every 15 minutes in game
// windows: {season, week, games:[...], players:{gsis: stats}, defense:{TEAM:
// line}} in exactly this file's canonical stat names. It is merged over the
// slate here, and only when it describes the SAME season and week -- a stats
// file from last week must never score this week's lineups, so a mismatch
// is treated as "no stats", never as "close enough".
//
// It also carries fresher game state than the slate (the slate rebuilds ~5x
// on a Sunday; this runs every 15 min), so status and scores come from it
// where the game ids match. That is what moves a D/ST's points allowed and
// flips a matchup from SCHEDULED to LIVE to FINAL on time.
async function loadLiveStats(season, week) {
  const j = await fetchNfl(nflFantasyStatsPaths(), nflFantasyStatsLooksReal)
  if (!nflFantasyStatsLooksReal(j)) return null
  if (Number(j.season) !== Number(season) || Number(j.week) !== Number(week)) {
    console.warn(`[franchise/feed] nfl_fantasy_stats.json is ${j.season} wk ${j.week}, slate is ${season} wk ${week} -- ignored`)
    return null
  }
  return j
}

async function loadRawSlate() {
  const remote=await fetchNfl(nflSlatePaths(),nflSlateLooksReal)
  if(nflSlateLooksReal(remote))return remote
  return JSON.parse(await readFile(path.join(process.cwd(),'public/data/nfl/week.json'),'utf8'))
}

// rawOverride (2026-09-15): a week transition strands the week it just left.
// loadRawSlate() always returns the CURRENT slate, so the moment nfl_week.json
// rolls to the next week, the game that just went final -- and everyone who
// played in it -- drops out of `games`/`players` here and can never be synced
// again through the normal path: loadLiveStats() below matches the stats file
// to whatever week THIS function is scoring, and the trailing week's own
// final box score has nowhere left to land. Passing the trailing week's own
// last-published raw slate as rawOverride scores it through the exact same
// merge every normal call uses, so a stuck week can be closed out with a real
// historical slate instead of hand-editing rows.
export async function loadFranchiseNflFeed(rawOverride) {
  const raw=rawOverride||await loadRawSlate()
  const season=Number(raw?.season||raw?.stat_season||new Date().getUTCFullYear())
  const allGames=(raw?.games||[]).filter((game)=>game?.game_id&&game?.kickoff&&Number(game?.week)>=1&&Number(game?.week)<=22).map((game)=>({
    gameId:String(game.game_id),season,week:Number(game.week),seasonType:Number(game.season_type||2),kickoff:game.kickoff,
    homeTeam:String(game.home||'').toUpperCase(),awayTeam:String(game.away||'').toUpperCase(),status:gameStatus(game),source:String(game.source||raw.source||'dash'),
    // Carried for defenceWeekRows below. sync_nfl_week_feed reads named keys
    // and ignores anything else, so these ride along harmlessly.
    homeScore:Number(game.home_score),awayScore:Number(game.away_score),
  }))
  // Fantasy only ever scores the regular season. Preseason rows were landing in
  // nfl_week_games as regular-season weeks and driving the matchup week picker.
  // Until the regular season publishes, fall back to whatever the slate has so
  // the product still demos instead of going blank.
  const regular=allGames.filter((game)=>game.seasonType===2)
  const games=regular.length?regular:allGames
  // The week this slate scores is the earliest regular-season week on it.
  const slateWeek=games.length?Math.min(...games.map((game)=>game.week)):Number(raw?.week)
  const live=await loadLiveStats(season,slateWeek)
  if(live){
    const liveGame=new Map(live.games.map((game)=>[String(game.game_id),game]))
    for(const game of games){
      const fresh=liveGame.get(game.gameId)
      if(!fresh)continue
      game.status=gameStatus(fresh)
      if(Number.isFinite(Number(fresh.home_score)))game.homeScore=Number(fresh.home_score)
      if(Number.isFinite(Number(fresh.away_score)))game.awayScore=Number(fresh.away_score)
    }
  }
  const liveStats=live?.players||{}
  const liveDefense=live?.defense||{}
  // Keyed by team ALONE this kept only the last game per team, so a multi-week
  // slate attributed every player to an arbitrary week.
  const gameByTeam=new Map()
  for(const game of games){for(const team of [game.homeTeam,game.awayTeam]){const current=gameByTeam.get(team);if(!current||new Date(game.kickoff)<new Date(current.kickoff))gameByTeam.set(team,game)}}
  const players=(raw?.players||[]).map((player)=>{const game=gameByTeam.get(String(player.team||'').toUpperCase());const week=Number(game?.week||raw.week);if(!game||week<1||week>22)return null;return {
    sourcePlayerId:String(player.player_id||player.id||''),season,week,gameId:game.gameId,
    stats:normalizeStats(liveStats[String(player.player_id||player.id||'')]||player.game_stats||player.fantasy_stats||player.week_stats||player.box_score||{}),
    projectedPoints:projectedFantasyPoints({position:player.position,source_payload:{stats:player.stats||{}}},'ppr'),
    dashScore:dashScore({source_payload:{scores:player.scores||{}}}),status:game.status,
  }}).filter((player)=>player?.sourcePlayerId)
  const catalog=withSeasonValue([...normalizeNflCatalog(raw),...fantasyDefenseCatalog(season,raw?.team_defense?.per_game)])
  return {season,games,players:[...players,...defenceWeekRows(games,season,raw?.team_defense?.weeks,liveDefense)],catalog,builtAt:live?.built_at||raw?.built_at||null,source:raw?.source||games[0]?.source||'dash'}
}

// ── A D/ST THAT CAN ACTUALLY SCORE (2026-08-31) ────────────────────────────
//
// fantasyDefenseCatalog() puts 32 D/ST entries in nfl_players, so a defence is
// draftable, rosterable and startable. Nothing ever wrote one a stat row. The
// weekly feed carries RB, WR, TE, QB and K and no DEF -- verified against the
// live file: 515 players, zero defensive ids -- and nfl_player_week_stats has
// exactly one writer, sync_nfl_week_feed, fed from that list.
//
// So refresh_fantasy_matchup_scores summed nothing for a defence and a D/ST
// scored ZERO, every week, for every team. has_defense defaults true, which
// made one of every nine starting slots a guaranteed nought all season.
//
// The slate already carries home_score and away_score. Points allowed is the
// single biggest term in fantasyPointsFromStats and it is the one thing the
// feed can answer, so these rows carry it and nothing else. Sacks,
// interceptions, fumble recoveries and defensive touchdowns are not in the
// payload; they are therefore ABSENT rather than guessed, which understates a
// defence by roughly half and never invents a number. The projection side
// omits exactly the same terms, so the two columns agree about the model.
//
// SCHEDULED GAMES CARRY NO STAT LINE, AND THAT IS THE TRAP HERE. A game that
// has not kicked off sits at 0-0 in the payload, and 0 points allowed is a
// shutout -- worth +10. Emitting stats for a scheduled game would have handed
// every defence in the league ten points on Saturday night. Only live and
// final games get a line; before kickoff the row exists with empty stats and
// scores nothing, which is correct.
// `weekly` is the payload's team_defense.weeks -- this season's own defensive
// lines, keyed by week then team. It is what keeps the ACTUAL column carrying
// the same five terms the projection does. Absent until the season is played,
// in which case a scored week falls back to points allowed alone, exactly as
// before.
// `liveDefense` (2026-09-14) is nfl_fantasy_stats.json's per-team line for
// the games it has scored -- the same five terms plus safeties, from the box
// score of THIS game, every 15 minutes. It wins over `weekly` (nflverse's
// team stats, which land a day later) whenever it has the team.
function defenceWeekRows(games, season, weekly = null, liveDefense = {}) {
  const rows = []
  for (const game of (games || [])) {
    const played = game.status === 'live' || game.status === 'final'
    for (const [team, allowed] of [
      [game.homeTeam, game.awayScore],
      [game.awayTeam, game.homeScore],
    ]) {
      if (!team) continue
      const scored = played && Number.isFinite(allowed)
      const line = liveDefense?.[team] || weekly?.[String(game.week)]?.[team] || null
      const stats = scored
        ? { points_allowed: Number(allowed), ...(line ? {
            def_sacks: line.def_sacks,
            def_interceptions: line.def_interceptions,
            def_fumble_recoveries: line.def_fumble_recoveries,
            def_touchdowns: line.def_touchdowns,
            ...(line.def_safeties !== undefined ? { def_safeties: line.def_safeties } : {}),
          } : {}) }
        : {}
      rows.push({
        // Must match fantasyDefenseCatalog's sourcePlayerId exactly, or the
        // lookup in sync_nfl_week_feed finds nothing and the row is dropped.
        sourcePlayerId: `DEF-${team}`, season, week: game.week, gameId: game.gameId,
        stats,
        projectedPoints: projectedFantasyPoints(
          { position: 'DEF', source_payload: { stats } }, 'ppr'),
        dashScore: 50,
        status: game.status,
      })
    }
  }
  return rows
}
