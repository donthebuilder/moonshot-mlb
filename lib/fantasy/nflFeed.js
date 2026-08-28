import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { fetchNfl, nflSlateLooksReal, nflSlatePaths } from '../nfl/dataSource'
import { normalizeNflCatalog } from '../nfl/playerCatalog'
import { fantasyDefenseCatalog } from '../nfl/teams'
import { dashScore, projectedFantasyPoints } from './scoring'

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
    points_allowed:['points_allowed'],
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

async function loadRawSlate() {
  const remote=await fetchNfl(nflSlatePaths(),nflSlateLooksReal)
  if(nflSlateLooksReal(remote))return remote
  return JSON.parse(await readFile(path.join(process.cwd(),'public/data/nfl/week.json'),'utf8'))
}

export async function loadFranchiseNflFeed() {
  const raw=await loadRawSlate()
  const season=Number(raw?.season||raw?.stat_season||new Date().getUTCFullYear())
  const allGames=(raw?.games||[]).filter((game)=>game?.game_id&&game?.kickoff&&Number(game?.week)>=1&&Number(game?.week)<=22).map((game)=>({
    gameId:String(game.game_id),season,week:Number(game.week),seasonType:Number(game.season_type||2),kickoff:game.kickoff,
    homeTeam:String(game.home||'').toUpperCase(),awayTeam:String(game.away||'').toUpperCase(),status:gameStatus(game),source:String(game.source||raw.source||'dash'),
  }))
  // Fantasy only ever scores the regular season. Preseason rows were landing in
  // nfl_week_games as regular-season weeks and driving the matchup week picker.
  // Until the regular season publishes, fall back to whatever the slate has so
  // the product still demos instead of going blank.
  const regular=allGames.filter((game)=>game.seasonType===2)
  const games=regular.length?regular:allGames
  // Keyed by team ALONE this kept only the last game per team, so a multi-week
  // slate attributed every player to an arbitrary week.
  const gameByTeam=new Map()
  for(const game of games){for(const team of [game.homeTeam,game.awayTeam]){const current=gameByTeam.get(team);if(!current||new Date(game.kickoff)<new Date(current.kickoff))gameByTeam.set(team,game)}}
  const players=(raw?.players||[]).map((player)=>{const game=gameByTeam.get(String(player.team||'').toUpperCase());const week=Number(game?.week||raw.week);if(!game||week<1||week>22)return null;return {
    sourcePlayerId:String(player.player_id||player.id||''),season,week,gameId:game.gameId,
    stats:normalizeStats(player.game_stats||player.fantasy_stats||player.week_stats||player.box_score||{}),
    projectedPoints:projectedFantasyPoints({position:player.position,source_payload:{stats:player.stats||{}}},'ppr'),
    dashScore:dashScore({source_payload:{scores:player.scores||{}}}),status:game.status,
  }}).filter((player)=>player?.sourcePlayerId)
  const catalog=[...normalizeNflCatalog(raw),...fantasyDefenseCatalog(season)]
  return {season,games,players,catalog,builtAt:raw?.built_at||null,source:raw?.source||games[0]?.source||'dash'}
}
