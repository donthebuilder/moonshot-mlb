import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { dashScore, eligibleForSlot, grade, projectedFantasyPoints } from '../../../../../lib/fantasy/scoring'
import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import styles from '../../../fantasy.module.css'
import { refreshMatchupScores, syncNflWeekFeed } from './actions'

const SEASON=2026
const WEEK=1

function clamp(value,min=0,max=100){return Math.min(max,Math.max(min,Math.round(value)))}

export default async function CoachPage({params,searchParams}) {
  const leagueId=params.leagueId
  const supabase=await createSupabaseServerClient()
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)redirect('/fantasy')
  const [{data:league},{data:membership},{data:teams=[]},{data:players=[]},{data:rosters=[]},{data:games=[]},{data:latestSync}]=await Promise.all([
    supabase.from('fantasy_leagues').select('*').eq('id',leagueId).single(),
    supabase.from('fantasy_league_memberships').select('role').eq('league_id',leagueId).eq('user_id',user.id).single(),
    supabase.from('fantasy_teams').select('*').eq('league_id',leagueId),
    supabase.from('nfl_players').select('id,name,position,team,injury_status,source_payload').eq('active',true),
    supabase.from('fantasy_roster_entries').select('team_id,player_id').eq('league_id',leagueId).is('released_at',null),
    supabase.from('nfl_week_games').select('*').eq('season',SEASON).order('kickoff'),
    supabase.from('fantasy_scoring_sync_runs').select('*').order('started_at',{ascending:false}).limit(1).maybeSingle(),
  ])
  if(!league||!membership)notFound()
  const myTeam=teams.find((team)=>team.owner_id===user.id)
  const myIds=new Set(rosters.filter((row)=>row.team_id===myTeam?.id).map((row)=>row.player_id))
  const rosteredIds=new Set(rosters.map((row)=>row.player_id))
  const roster=players.filter((player)=>myIds.has(player.id)).map((player)=>({...player,dash:dashScore(player),projection:projectedFantasyPoints(player,league.scoring)}))
  const {data:lineup=[]}=myTeam?await supabase.from('fantasy_lineup_slots').select('*').eq('team_id',myTeam.id).eq('season',SEASON).eq('week',WEEK):{data:[]}
  const starters=lineup.filter((row)=>!['BENCH','IR'].includes(row.slot)).map((row)=>({...row,player:roster.find((player)=>player.id===row.player_id)})).filter((row)=>row.player)
  const starterIds=new Set(starters.map((row)=>row.player_id))
  const bench=roster.filter((player)=>!starterIds.has(player.id))
  const available=players.filter((player)=>!rosteredIds.has(player.id)).map((player)=>({...player,dash:dashScore(player),projection:projectedFantasyPoints(player,league.scoring)})).sort((a,b)=>b.projection-a.projection)
  const recommendations=[]
  for(const starter of starters){const upgrade=bench.filter((player)=>eligibleForSlot(player,starter.slot)&&player.projection>starter.player.projection+.5).sort((a,b)=>b.projection-a.projection)[0];if(upgrade)recommendations.push({type:'lineup',title:`Start ${upgrade.name}`,detail:`Move ${upgrade.name} into ${starter.slot} over ${starter.player.name}. The projection improves by ${(upgrade.projection-starter.player.projection).toFixed(1)} points.`,impact:upgrade.projection-starter.player.projection})}
  const waiverTarget=available.find((candidate)=>{const same=roster.filter((player)=>player.position===candidate.position).sort((a,b)=>a.projection-b.projection)[0];return same&&candidate.projection>same.projection+1})
  if(waiverTarget){const weak=roster.filter((player)=>player.position===waiverTarget.position).sort((a,b)=>a.projection-b.projection)[0];recommendations.push({type:'waiver',title:`Consider ${waiverTarget.name}`,detail:`The top available ${waiverTarget.position} projects ${(waiverTarget.projection-weak.projection).toFixed(1)} points above ${weak.name}.`,impact:waiverTarget.projection-weak.projection})}
  const required=['QB','RB','RB','WR','WR','TE','FLEX',...(league.has_kicker?['K']:[]),...(league.has_defense?['DEF']:[])]
  const covered=required.filter((slot)=>roster.some((player)=>eligibleForSlot(player,slot))).length
  const averageDash=roster.length?roster.reduce((sum,player)=>sum+player.dash,0)/roster.length:0
  const lineupFill=required.length?starters.length/required.length:0
  const draftScore=clamp(covered/required.length*65+averageDash*.35)
  const waiverScore=waiverTarget?clamp(55+waiverTarget.dash*.35+waiverTarget.projection):clamp(45+averageDash*.45)
  const overallScore=clamp(draftScore*.45+waiverScore*.2+lineupFill*35)
  const nextGame=games.find((game)=>new Date(game.kickoff)>new Date())

  return <main className={styles.roomApp}>
    <header className={styles.roomHeader}><Link href="/fantasy">← FRANCHISE</Link><div><small>DASH INTELLIGENCE</small><strong>{league.name}</strong></div><span>{latestSync?.status==='complete'?'Scoring automation healthy':games.length?'NFL feed connected':'Feed awaiting sync'}</span></header>
    <nav className={styles.roomNav}><Link href={`/fantasy/league/${leagueId}`}>Draft</Link><Link href={`/fantasy/league/${leagueId}/team`}>Team</Link><Link href={`/fantasy/league/${leagueId}/matchup`}>Matchup</Link><Link href={`/fantasy/league/${leagueId}/league`}>League</Link><Link href={`/fantasy/league/${leagueId}/wire`}>Wire</Link><Link href={`/fantasy/league/${leagueId}/trades`}>Trades</Link><Link href={`/fantasy/league/${leagueId}/feed`}>Feed</Link><a className={styles.roomActive}>Coach</a></nav>
    <div className={styles.roomBody}>
      {(searchParams?.error||searchParams?.message)&&<p className={searchParams.error?styles.error:styles.message}>{searchParams.error||searchParams.message}</p>}
      <section className={styles.coachHero}><div><p className={styles.panelLabel}>DASH COACH · WEEK {WEEK}</p><h1>{recommendations[0]?.title||'Your next move starts here.'}</h1><p>{recommendations[0]?.detail||'Draft players and set a lineup to unlock personalized recommendations.'}</p></div><div className={styles.coachGrade}><small>DASH SCORE</small><strong>{overallScore}</strong><span>{grade(overallScore)}</span></div></section>
      <section className={styles.scoreCards}><ScoreCard label="DASH SCORE" score={overallScore} copy="Overall team readiness"/><ScoreCard label="DRAFT SCORE" score={draftScore} copy="Roster strength and balance"/><ScoreCard label="WAIVER SCORE" score={waiverScore} copy="Available upgrade potential"/></section>
      {membership.role==='commissioner'&&<section className={styles.commishBar}><div><p className={styles.panelLabel}>NFL SCORING CONTROL</p><strong>{nextGame?`Next kickoff ${new Date(nextGame.kickoff).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}`:'Refresh the provider-neutral feed'}</strong></div><form action={syncNflWeekFeed}><input type="hidden" name="leagueId" value={leagueId}/><button>Refresh NFL feed & locks</button></form><form action={refreshMatchupScores}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="season" value={SEASON}/><input type="hidden" name="week" value={WEEK}/><button>Recalculate Week {WEEK}</button></form></section>}
      <div className={styles.coachLayout}><section className={styles.coachRecommendations}><div className={styles.boardHead}><div><p className={styles.panelLabel}>RECOMMENDATIONS</p><h2>What DASH sees</h2></div><span>{recommendations.length} moves</span></div>{recommendations.slice(0,6).map((item,index)=><article key={`${item.title}-${index}`}><span>{item.type==='waiver'?'⚡':'↗'}</span><div><small>{item.type.toUpperCase()} · +{item.impact.toFixed(1)} projected</small><h3>{item.title}</h3><p>{item.detail}</p></div></article>)}{!recommendations.length&&<p className={styles.emptyRoom}>No obvious upgrade yet. Complete the draft and set Week {WEEK} starters to activate lineup comparisons.</p>}</section><aside className={styles.coachSide}><section><div className={styles.boardHead}><div><p className={styles.panelLabel}>LINEUP HEALTH</p><h2>Week {WEEK}</h2></div></div><div className={styles.coachMetric}><span>Starting slots</span><b>{starters.length}/{required.length}</b></div><div className={styles.coachMetric}><span>Projected points</span><b>{starters.reduce((sum,row)=>sum+row.player.projection,0).toFixed(1)}</b></div><div className={styles.coachMetric}><span>Injury flags</span><b>{roster.filter((player)=>player.injury_status).length}</b></div></section><section><div className={styles.boardHead}><div><p className={styles.panelLabel}>SCORING STATUS</p><h2>{latestSync?.status==='complete'?'Automation healthy':'Live foundation'}</h2></div><span className={`${styles.syncHealth} ${latestSync?.status==='failed'?styles.syncFailed:''}`}>{latestSync?.status||'manual'}</span></div>{latestSync&&<div className={styles.syncMetrics}><span><small>LAST RUN</small><b>{new Date(latestSync.started_at).toLocaleString('en-US',{month:'short',day:'numeric',hour:'numeric',minute:'2-digit'})}</b></span><span><small>PLAYERS</small><b>{latestSync.players_synced}</b></span><span><small>MATCHUPS</small><b>{latestSync.matchups_refreshed}</b></span></div>}<p className={styles.emptyRoom}>Kickoff times lock each player individually. Fantasy totals use league-specific {league.scoring.replace('_','-').toUpperCase()} scoring whenever the provider publishes verified box-score statistics.</p></section></aside></div>
    </div>
  </main>
}

function ScoreCard({label,score,copy}){return <article><small>{label}</small><strong>{score}</strong><span>{grade(score)}</span><p>{copy}</p></article>}
