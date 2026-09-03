import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import styles from '../../../fantasy.module.css'
import TeamMark from '../../../../../components/fantasy/TeamMark'
import SubmitButton from '../../../../../components/fantasy/SubmitButton'
import { generateWeeklyContent } from './actions'
import LeagueNav from '../../../../../components/fantasy/LeagueNav'
import InviteCode from '../../../../../components/fantasy/InviteCode'

const SEASON=2026

export default async function LeaguePage({params,searchParams}) {
  const [{leagueId},query]=await Promise.all([params,searchParams])
  const view=['standings','power','recap'].includes(query?.view)?query.view:'standings'
  const week=Math.min(14,Math.max(1,Number(query?.week)||1))
  const supabase=await createSupabaseServerClient()
  if(!supabase)redirect('/fantasy')
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)redirect('/fantasy')
  const [{data:league},{data:membership},{data:teamRows},{data:matchupRows},{data:rankings},{data:awards},{data:recap}]=await Promise.all([
    supabase.from('fantasy_leagues').select('*').eq('id',leagueId).single(),
    supabase.from('fantasy_league_memberships').select('role').eq('league_id',leagueId).eq('user_id',user.id).single(),
    supabase.from('fantasy_teams').select('*').eq('league_id',leagueId).order('created_at'),
    supabase.from('fantasy_matchups').select('*').eq('league_id',leagueId).eq('season',SEASON).order('week'),
    supabase.from('fantasy_power_rankings').select('*').eq('league_id',leagueId).eq('season',SEASON).eq('week',week).order('rank'),
    supabase.from('fantasy_weekly_awards').select('*').eq('league_id',leagueId).eq('season',SEASON).eq('week',week),
    supabase.from('fantasy_weekly_recaps').select('*').eq('league_id',leagueId).eq('season',SEASON).eq('week',week).maybeSingle(),
  ])
  if(!league||!membership)notFound()
  const teams=teamRows||[]
  const matchups=matchupRows||[]
  const safeRankings=rankings||[]
  const safeAwards=awards||[]
  const table=teams.map((team)=>{const record={...team,wins:0,losses:0,ties:0,pointsFor:0,pointsAgainst:0};matchups.filter((game)=>game.status==='final'&&(game.home_team_id===team.id||game.away_team_id===team.id)).forEach((game)=>{const home=game.home_team_id===team.id;const pf=Number(home?game.home_score:game.away_score);const pa=Number(home?game.away_score:game.home_score);record.pointsFor+=pf;record.pointsAgainst+=pa;if(pf>pa)record.wins+=1;else if(pf<pa)record.losses+=1;else record.ties+=1});return record}).sort((a,b)=>b.wins-a.wins||b.pointsFor-a.pointsFor||b.ties-a.ties)
  const finalGames=matchups.filter((game)=>game.status==='final').length
  const weekFinals=matchups.filter((game)=>game.week===week&&game.status==='final').length
  const playoffSpots=Math.max(2,Math.min(6,Math.floor((teams.length||league.team_count||8)/2)))
  const teamName=(id)=>teams.find((team)=>team.id===id)?.name||'Team'

  return <main className={styles.roomApp}>
    <header className={styles.roomHeader}><Link href="/fantasy">← FRANCHISE</Link><div><small>{String(league.status||'').replace('_',' ').toUpperCase()}</small><strong>{league.name}</strong></div><span>{teams.length}/{league.team_count} teams</span></header>
    <LeagueNav leagueId={leagueId} active="league" role={membership?.role} className={styles.roomNav} activeClassName={styles.roomActive} />
    <div className={styles.roomBody}>
      {(query?.error||query?.message)&&<p className={query.error?styles.error:styles.message}>{query.error||query.message}</p>}
      <section className={styles.leagueHero}><div><p className={styles.panelLabel}>LEAGUE HQ</p><h1>{league.name}</h1><p>{String(league.scoring||'ppr').replace('_','-').toUpperCase()} · {league.team_count} teams</p><InviteCode className={styles.leagueInvite} code={league.invite_code} />{membership.role==='commissioner'&&<Link className={styles.leagueSettingsLink} href={`/fantasy/league/${leagueId}/settings`}>⚙ Open Commissioner Control Room</Link>}</div><div className={styles.roomStats}><span><small>MEMBERS</small><b>{teams.length}</b></span><span><small>GAMES</small><b>{matchups.length}</b></span><span><small>FINAL</small><b>{finalGames}</b></span></div></section>
      <div className={styles.leagueViews}><Link className={view==='standings'?styles.leagueViewActive:''} href={`/fantasy/league/${leagueId}/league?view=standings&week=${week}`}>Standings</Link><Link className={view==='power'?styles.leagueViewActive:''} href={`/fantasy/league/${leagueId}/league?view=power&week=${week}`}>Power Rankings</Link><Link className={view==='recap'?styles.leagueViewActive:''} href={`/fantasy/league/${leagueId}/league?view=recap&week=${week}`}>Weekly Recap</Link><form><input type="hidden" name="view" value={view}/><select name="week" defaultValue={week}>{Array.from({length:14},(_,i)=>i+1).map((number)=><option value={number} key={number}>Week {number}</option>)}</select><button>Go</button></form></div>
      {membership.role==='commissioner'&&view!=='standings'&&<section className={styles.commishBar}><div><p className={styles.panelLabel}>WEEKLY PUBLISHER</p><strong>{weekFinals?`${weekFinals} final games available`:`Week ${week} still needs final scores`}</strong></div><form action={generateWeeklyContent}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="week" value={week}/><SubmitButton disabled={!weekFinals} pendingLabel="Generating…">Generate Week {week}</SubmitButton></form></section>}
      {view==='standings'&&<Standings finalGames={finalGames} playoffSpots={playoffSpots} table={table} user={user}/>}
      {view==='power'&&<PowerRankings rankings={safeRankings} teamName={teamName} teams={teams}/>}
      {view==='recap'&&<WeeklyRecap recap={recap} awards={safeAwards} teamName={teamName} week={week}/>}
    </div>
  </main>
}

function Standings({finalGames,playoffSpots,table,user}){return <section className={styles.standings}><div className={styles.boardHead}><div><p className={styles.panelLabel}>2026 REGULAR SEASON</p><h2>Standings</h2></div><span>W-L-T · Points</span></div><div className={styles.standingHead}><span>RK</span><span>TEAM</span><span>W</span><span>L</span><span>T</span><span>PF</span><span>PA</span></div>{table.map((team,index)=><div className={styles.standingRow} data-cut={finalGames&&index===playoffSpots-1?'true':undefined} data-mine={team.owner_id===user.id?'true':undefined} key={team.id}><span>{index+1}</span><div style={{display:'flex',alignItems:'center',gap:9}}><TeamMark team={team}/><div><b>{team.name}</b><small>{team.owner_id===user.id?'YOUR TEAM':finalGames?(index<playoffSpots?'IN THE FIELD':'IN THE HUNT'):'NO GAMES YET'}</small></div></div><strong>{team.wins}</strong><strong>{team.losses}</strong><strong>{team.ties}</strong><span>{team.pointsFor.toFixed(1)}</span><span>{team.pointsAgainst.toFixed(1)}</span></div>)}</section>}

function PowerRankings({rankings,teamName,teams=[]}){const teamOf=(id)=>teams.find((team)=>team.id===id);return <section className={styles.powerBoard}><div className={styles.boardHead}><div><p className={styles.panelLabel}>DASH POWER INDEX</p><h2>Power Rankings</h2></div><span>Results · scoring · momentum</span></div>{rankings.map((item)=><article key={item.team_id}><strong>{item.rank}</strong><div><h3 style={{display:'flex',alignItems:'center',gap:8}}><TeamMark size={22} team={teamOf(item.team_id)}/>{teamName(item.team_id)}</h3><p>{item.explanation}</p></div><span>{item.previous_rank?item.previous_rank-item.rank>0?`▲ ${item.previous_rank-item.rank}`:item.previous_rank-item.rank<0?`▼ ${Math.abs(item.previous_rank-item.rank)}`:'—':'NEW'}</span><b>{Number(item.power_score).toFixed(1)}</b></article>)}{!rankings.length&&<p className={styles.leagueEmpty}>Power rankings publish after the commissioner generates a completed week.</p>}</section>}

function WeeklyRecap({recap,awards,teamName,week}){return <><section className={styles.recapHero}><p className={styles.panelLabel}>WEEK {week} RECAP</p><h2>{recap?.headline||'The story is still being written.'}</h2><p>{recap?.summary||'Finalize the week, then generate the recap to publish awards and the latest power rankings.'}</p></section><section className={styles.awardGrid}>{awards.map((award)=><article key={award.id}><span>{award.award_type==='high_score'?'🏆':award.award_type==='closest_win'?'🎯':'💥'}</span><small>{award.title}</small><h3>{teamName(award.team_id)}</h3><p>{award.detail}</p></article>)}</section></>}
