import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import { projectedFantasyPoints } from '../../../../../lib/fantasy/scoring'
import styles from '../../../fantasy.module.css'
import { generateSchedule } from './actions'

const SEASON = 2026

export default async function MatchupPage({ params, searchParams }) {
  const leagueId = params.leagueId
  const week = Math.min(14, Math.max(1, Number(searchParams?.week) || 1))
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/fantasy')
  const [{ data: league }, { data: membership }, { data: teams = [] }, { data: matchups = [] }] = await Promise.all([
    supabase.from('fantasy_leagues').select('*').eq('id',leagueId).single(),
    supabase.from('fantasy_league_memberships').select('role').eq('league_id',leagueId).eq('user_id',user.id).single(),
    supabase.from('fantasy_teams').select('*').eq('league_id',leagueId).order('created_at'),
    supabase.from('fantasy_matchups').select('*').eq('league_id',leagueId).eq('season',SEASON).eq('week',week),
  ])
  if (!league || !membership) notFound()
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
    lineups = data
  }
  const homeLineup = lineups.filter((row)=>row.team_id===home?.id)
  const awayLineup = lineups.filter((row)=>row.team_id===away?.id)
  const homeProjection = homeLineup.reduce((sum,row)=>sum+projectedFantasyPoints(row.player,league.scoring),0)
  const awayProjection = awayLineup.reduce((sum,row)=>sum+projectedFantasyPoints(row.player,league.scoring),0)

  return <main className={styles.roomApp}>
    <header className={styles.roomHeader}><Link href="/fantasy">← FRANCHISE</Link><div><small>WEEK {week}</small><strong>{league.name}</strong></div><span>{matchups.length} matchups</span></header>
    <nav className={styles.roomNav}><Link href={`/fantasy/league/${leagueId}`}>Draft</Link><Link href={`/fantasy/league/${leagueId}/team`}>Team</Link><a className={styles.roomActive}>Matchup</a><Link href={`/fantasy/league/${leagueId}/league`}>League</Link><Link href={`/fantasy/league/${leagueId}/wire`}>Wire</Link><Link href={`/fantasy/league/${leagueId}/trades`}>Trades</Link><Link href={`/fantasy/league/${leagueId}/feed`}>Feed</Link><Link href={`/fantasy/league/${leagueId}/coach`}>Coach</Link></nav>
    <div className={styles.roomBody}>
      {(searchParams?.error||searchParams?.message)&&<p className={searchParams.error?styles.error:styles.message}>{searchParams.error||searchParams.message}</p>}
      <div className={styles.weekStrip}>{Array.from({length:14},(_,i)=>i+1).map((number)=><Link className={number===week?styles.weekActive:''} href={`/fantasy/league/${leagueId}/matchup?week=${number}`} key={number}>W{number}</Link>)}</div>
      {!featured && <section className={styles.scheduleEmpty}><span>VS</span><div><p className={styles.panelLabel}>SEASON SCHEDULE</p><h1>Your matchups are ready to be built.</h1><p>Franchise creates a balanced 14-week round-robin schedule from the teams currently in this league.</p></div>{membership.role==='commissioner'?<form action={generateSchedule}><input type="hidden" name="leagueId" value={leagueId}/><button>Create schedule</button></form>:<small>Waiting for the commissioner</small>}</section>}
      {featured && <>
        <section className={styles.matchupHero}><div><small>HOME</small><h1>{home?.name}</h1><strong>{featured.status==='scheduled'?'—':Number(featured.home_score).toFixed(2)}</strong><em>{homeProjection.toFixed(1)} projected</em></div><span><b>WEEK {week}</b><i>{featured.status}</i></span><div><small>AWAY</small><h1>{away?.name}</h1><strong>{featured.status==='scheduled'?'—':Number(featured.away_score).toFixed(2)}</strong><em>{awayProjection.toFixed(1)} projected</em></div></section>
        <div className={styles.matchupGrid}><Lineup title={home?.name} rows={homeLineup} scoring={league.scoring}/><Lineup title={away?.name} rows={awayLineup} scoring={league.scoring}/></div>
        <section className={styles.weekGames}><div className={styles.boardHead}><div><p className={styles.panelLabel}>AROUND THE LEAGUE</p><h2>Week {week}</h2></div><span>{matchups.length} games</span></div>{matchups.map((game)=><div className={styles.weekGame} key={game.id}><b>{teams.find((team)=>team.id===game.home_team_id)?.name}</b><span>{game.status==='scheduled'?'vs':`${Number(game.home_score).toFixed(1)} — ${Number(game.away_score).toFixed(1)}`}</span><b>{teams.find((team)=>team.id===game.away_team_id)?.name}</b></div>)}</section>
      </>}
    </div>
  </main>
}

function Lineup({ title, rows, scoring }) {
  return <section className={styles.matchupLineup}><div className={styles.boardHead}><div><p className={styles.panelLabel}>STARTING LINEUP</p><h2>{title}</h2></div><span>{rows.length} set</span></div>{rows.map((row)=><div className={styles.matchupPlayer} key={row.id}><span>{row.slot}</span><div><b>{row.player?.name}</b><small>{row.player?.position} · {row.player?.team}</small></div><strong>{projectedFantasyPoints(row.player,scoring).toFixed(1)}</strong></div>)}{!rows.length&&<p className={styles.emptyRoom}>No starters have been set for this week.</p>}</section>
}
