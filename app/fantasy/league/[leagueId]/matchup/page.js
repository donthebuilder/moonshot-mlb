import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import { fantasyPointsFromStats, projectedFantasyPoints } from '../../../../../lib/fantasy/scoring'
import LiveMatchupCenter from '../../../../../components/fantasy/LiveMatchupCenter'
import LocalTime from '../../../../../components/fantasy/LocalTime'
import SubmitButton from '../../../../../components/fantasy/SubmitButton'
import { resolveFantasyWeek } from '../../../../../lib/fantasy/week'
import styles from '../../../fantasy.module.css'
import TeamMark from '../../../../../components/fantasy/TeamMark'
import { generateSchedule } from './actions'

const SEASON = 2026

export default async function MatchupPage({ params, searchParams }) {
  const [{leagueId},query] = await Promise.all([params,searchParams])
  const supabase = await createSupabaseServerClient()
  if (!supabase) redirect('/fantasy')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/fantasy')
  const week = await resolveFantasyWeek(supabase, query?.week)
  const [{ data: league }, { data: membership }, { data: teamRows }, { data: matchupRows }, {data:nflGameRows}, {data:latestSync}] = await Promise.all([
    supabase.from('fantasy_leagues').select('*').eq('id',leagueId).single(),
    supabase.from('fantasy_league_memberships').select('role').eq('league_id',leagueId).eq('user_id',user.id).single(),
    supabase.from('fantasy_teams').select('*').eq('league_id',leagueId).order('created_at'),
    supabase.from('fantasy_matchups').select('*').eq('league_id',leagueId).eq('season',SEASON).eq('week',week),
    supabase.from('nfl_week_games').select('*').eq('season',SEASON).eq('week',week).order('kickoff'),
    supabase.from('fantasy_scoring_sync_runs').select('completed_at,status').order('started_at',{ascending:false}).limit(1).maybeSingle(),
  ])
  if (!league || !membership) notFound()
  const teams = teamRows || []
  const matchups = matchupRows || []
  const nflGames = nflGameRows || []
  const myTeam = teams.find((team)=>team.owner_id===user.id)
  const myMatchup = matchups.find((game)=>game.home_team_id===myTeam?.id||game.away_team_id===myTeam?.id)
  const featured = myMatchup || matchups[0]
  const home = teams.find((team)=>team.id===featured?.home_team_id)
  const away = teams.find((team)=>team.id===featured?.away_team_id)
  let lineups = []
  if (featured) {
    const { data = [] } = await supabase.from('fantasy_lineup_slots')
      .select('*,player:nfl_players(id,name,position,team,source_payload)')
      .in('team_id',[featured.home_team_id,featured.away_team_id]).eq('season',SEASON).eq('week',week)
      .not('slot','in','(BENCH,IR)').order('slot_index')
    lineups = data || []
  }
  const homeLineup = lineups.filter((row)=>row.team_id===home?.id)
  const awayLineup = lineups.filter((row)=>row.team_id===away?.id)
  const playerIds=lineups.map((row)=>row.player_id).filter(Boolean)
  let weeklyStats=[]
  if(playerIds.length){const {data=[]}=await supabase.from('nfl_player_week_stats').select('player_id,game_id,stats,status,updated_at').in('player_id',playerIds).eq('season',SEASON).eq('week',week);weeklyStats=data||[]}
  const statsByPlayer=new Map(weeklyStats.map((item)=>[item.player_id,item]))
  const withLiveScores=(rows)=>rows.map((row)=>({...row,weekStats:statsByPlayer.get(row.player_id)}))
  const scoredHomeLineup=withLiveScores(homeLineup)
  const scoredAwayLineup=withLiveScores(awayLineup)
  const homeProjection = homeLineup.reduce((sum,row)=>sum+projectedFantasyPoints(row.player,league.scoring),0)
  const awayProjection = awayLineup.reduce((sum,row)=>sum+projectedFantasyPoints(row.player,league.scoring),0)
  const hasLiveGames=nflGames.some((game)=>game.status==='live')

  return <main className={styles.roomApp}>
    <header className={styles.roomHeader}><Link href="/fantasy">← FRANCHISE</Link><div><small>WEEK {week}</small><strong>{league.name}</strong></div><span>{matchups.length} matchups</span></header>
    <nav aria-label="League sections" className={styles.roomNav}><Link href={`/fantasy/league/${leagueId}`}>Draft</Link><Link href={`/fantasy/league/${leagueId}/team`}>Team</Link><a className={styles.roomActive}>Matchup</a><Link href={`/fantasy/league/${leagueId}/league`}>League</Link><Link href={`/fantasy/league/${leagueId}/wire`}>Wire</Link><Link href={`/fantasy/league/${leagueId}/trades`}>Trades</Link><Link href={`/fantasy/league/${leagueId}/feed`}>Feed</Link><Link href={`/fantasy/league/${leagueId}/coach`}>Coach</Link>{membership.role==='commissioner'&&<Link href={`/fantasy/league/${leagueId}/settings`}>Settings</Link>}</nav>
    <div className={styles.roomBody}>
      {(query?.error||query?.message)&&<p className={query.error?styles.error:styles.message}>{query.error||query.message}</p>}
      <LiveMatchupCenter leagueId={leagueId} live={hasLiveGames} lastUpdated={latestSync?.completed_at}/>
      <div className={styles.weekStrip}>{Array.from({length:14},(_,i)=>i+1).map((number)=><Link className={number===week?styles.weekActive:''} href={`/fantasy/league/${leagueId}/matchup?week=${number}`} key={number}>W{number}</Link>)}</div>
      <NflGameCenter games={nflGames}/>
      {!featured && <section className={styles.scheduleEmpty}><span>VS</span><div><p className={styles.panelLabel}>SEASON SCHEDULE</p><h1>Your matchups are ready to be built.</h1><p>Franchise creates a balanced 14-week round-robin schedule from the teams currently in this league.</p></div>{membership.role==='commissioner'?<form action={generateSchedule}><input type="hidden" name="leagueId" value={leagueId}/><SubmitButton pendingLabel="Building…">Create schedule</SubmitButton></form>:<small>Waiting for the commissioner</small>}</section>}
      {featured && <>
        <section className={styles.matchupHero}><div><small>HOME</small><h1 style={{display:'flex',alignItems:'center',gap:10}}><TeamMark size={30} team={home}/>{home?.name}</h1><strong>{featured.status==='scheduled'?'—':Number(featured.home_score).toFixed(2)}</strong><em>{homeProjection.toFixed(1)} projected</em></div><span><b>WEEK {week}</b><i>{String(featured.status||'').toUpperCase()}</i></span><div><small>AWAY</small><h1 style={{display:'flex',alignItems:'center',gap:10}}><TeamMark size={30} team={away}/>{away?.name}</h1><strong>{featured.status==='scheduled'?'—':Number(featured.away_score).toFixed(2)}</strong><em>{awayProjection.toFixed(1)} projected</em></div></section>
        <section className={styles.marginBar} data-live={featured.status==='live'?'true':undefined}>
          <div className={styles.marginTrack}><i style={{ width: `${homeShare}%` }}/><b style={{ left: `${homeShare}%` }}/></div>
          <div className={styles.marginLegend}>
            <span>{home?.name}</span>
            <em>{featured.status==='scheduled' ? `${Math.abs(homeProjection-awayProjection).toFixed(1)} projected margin` : `${leader} by ${margin.toFixed(2)}`}</em>
            <span>{away?.name}</span>
          </div>
        </section>
        <div className={styles.matchupGrid}><Lineup title={home?.name} rows={scoredHomeLineup} scoring={league.scoring}/><Lineup title={away?.name} rows={scoredAwayLineup} scoring={league.scoring}/></div>
        <section className={styles.weekGames}><div className={styles.boardHead}><div><p className={styles.panelLabel}>AROUND THE LEAGUE</p><h2>Week {week}</h2></div><span>{matchups.length} games</span></div>{matchups.map((game)=><div className={styles.weekGame} key={game.id}><b style={{display:'flex',alignItems:'center',gap:7,minWidth:0}}><TeamMark size={20} team={teams.find((team)=>team.id===game.home_team_id)}/><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{teams.find((team)=>team.id===game.home_team_id)?.name}</span></b><span>{game.status==='scheduled'?'vs':`${Number(game.home_score).toFixed(1)} — ${Number(game.away_score).toFixed(1)}`}</span><b style={{display:'flex',alignItems:'center',gap:7,minWidth:0,justifyContent:'flex-end'}}><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{teams.find((team)=>team.id===game.away_team_id)?.name}</span><TeamMark size={20} team={teams.find((team)=>team.id===game.away_team_id)}/></b></div>)}</section>
      </>}
    </div>
  </main>
}

function Lineup({ title, rows, scoring }) {
  return <section className={styles.matchupLineup}><div className={styles.boardHead}><div><p className={styles.panelLabel}>STARTING LINEUP</p><h2>{title}</h2></div><span>{rows.length} set</span></div>{rows.map((row)=>{const hasStats=Boolean(row.weekStats?.stats&&Object.keys(row.weekStats.stats).length);const active=Boolean(row.weekStats?.status&&row.weekStats.status!=='scheduled'&&hasStats);const points=fantasyPointsFromStats(row.weekStats?.stats,scoring);return <div className={styles.matchupPlayer} key={row.id}><span>{row.slot}</span><div><b>{row.player?.name}</b><small>{row.player?.position} · {row.player?.team}</small></div><span className={styles.playerState} data-state={active?row.weekStats.status:'projected'}>{active?String(row.weekStats.status).toUpperCase():'PROJ'}</span><strong className={active?styles.livePlayerScore:''}>{(active?points:projectedFantasyPoints(row.player,scoring)).toFixed(1)}</strong></div>})}{!rows.length&&<p className={styles.emptyRoom}>No starters have been set for this week.</p>}</section>
}

function NflGameCenter({games}) {
  return <section className={styles.nflGameCenter}><div className={styles.boardHead}><div><p className={styles.panelLabel}>NFL GAME STATUS</p><h2>On the field</h2></div><span>{games.filter((game)=>game.status==='live').length} live · {games.length} total</span></div><div className={styles.nflGameGrid}>{games.map((game)=><article className={game.status==='live'?styles.nflGameLive:''} key={game.game_id}><span>{game.status==='live'?'● LIVE':game.status==='final'?'FINAL':<LocalTime value={game.kickoff}/>}</span><div><b>{game.away_team}</b><em>at</em><b>{game.home_team}</b></div><small><LocalTime mode="date" value={game.kickoff}/></small></article>)}</div>{!games.length&&<p className={styles.emptyRoom}>The NFL slate has not published games for this week yet.</p>}</section>
}
