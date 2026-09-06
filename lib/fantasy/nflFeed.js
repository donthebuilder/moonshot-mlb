import { readFile } from 'node:fs/promises'
import path from 'node:path'

import { fetchNfl, nflSlateLooksReal, nflSlatePaths } from '../nfl/dataSource'
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
  const catalog=withSeasonValue([...normalizeNflCatalog(raw),...fantasyDefenseCatalog(season)])
  return {season,games,players:[...players,...defenceWeekRows(games,season)],catalog,builtAt:raw?.built_at||null,source:raw?.source||games[0]?.source||'dash'}
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
function defenceWeekRows(games, season) {
  const rows = []
  for (const game of (games || [])) {
    const played = game.status === 'live' || game.status === 'final'
    for (const [team, allowed] of [
      [game.homeTeam, game.awayScore],
      [game.awayTeam, game.homeScore],
    ]) {
      if (!team) continue
      const scored = played && Number.isFinite(allowed)
      const stats = scored ? { points_allowed: Number(allowed) } : {}
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
