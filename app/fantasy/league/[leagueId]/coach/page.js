import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { bestPossibleLineup, dashScore, eligibleForSlot, grade, projectedFantasyPoints } from '../../../../../lib/fantasy/scoring'
import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import CoachShareCard from '../../../../../components/fantasy/CoachShareCard'
import styles from '../../../fantasy.module.css'
import SubmitButton from '../../../../../components/fantasy/SubmitButton'
import LocalTime from '../../../../../components/fantasy/LocalTime'
import { FANTASY_LAST_WEEK, FANTASY_SEASON, resolveFantasyWeek } from '../../../../../lib/fantasy/week'
import { refreshMatchupScores, syncNflWeekFeed } from './actions'
import NetworkSwitch from '../../../../../components/NetworkSwitch'
import LeagueNav from '../../../../../components/fantasy/LeagueNav'
import { loadPlayerCatalog } from '../../../../../lib/fantasy/playerCatalog'
import { byeTeamsFor, isOnBye } from '../../../../../lib/fantasy/bye'
import InjuryTag from '../../../../../components/fantasy/InjuryTag'

const SEASON=FANTASY_SEASON

function clamp(value,min=0,max=100){return Math.min(max,Math.max(min,Math.round(value)))}

export default async function CoachPage({params,searchParams}) {
  const [{leagueId},query]=await Promise.all([params,searchParams])
  const supabase=await createSupabaseServerClient()
  if(!supabase)redirect('/fantasy')
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)redirect('/fantasy')
  const WEEK=await resolveFantasyWeek(supabase,query?.week)
  // GAME PLAN's "next week" -- capped at the same last week Team/Coach/Matchup
  // already agree on (lib/fantasy/week.js), so there is never a Week 15 to
  // plan for. null on the season's final week: nothing to look ahead to.
  const nextWeek=WEEK<FANTASY_LAST_WEEK?WEEK+1:null
  const [{data:league},{data:membership},{data:teamRows},{data:playerRows},{data:rosterRows},{data:gameRows},{data:latestSync},{data:nextMatchupRows}]=await Promise.all([
    supabase.from('fantasy_leagues').select('*').eq('id',leagueId).single(),
    supabase.from('fantasy_league_memberships').select('role').eq('league_id',leagueId).eq('user_id',user.id).single(),
    supabase.from('fantasy_teams').select('*').eq('league_id',leagueId),
    loadPlayerCatalog(supabase).then((rows) => ({ data: rows })),
    supabase.from('fantasy_roster_entries').select('team_id,player_id').eq('league_id',leagueId).is('released_at',null),
    supabase.from('nfl_week_games').select('*').eq('season',SEASON).order('kickoff'),
    supabase.from('fantasy_scoring_sync_runs').select('*').order('started_at',{ascending:false}).limit(1).maybeSingle(),
    nextWeek?supabase.from('fantasy_matchups').select('*').eq('league_id',leagueId).eq('season',SEASON).eq('week',nextWeek):Promise.resolve({data:[]}),
  ])
  if(!league||!membership)notFound()
  const teams=teamRows||[]
  const players=playerRows||[]
  const rosters=rosterRows||[]
  const games=gameRows||[]
  const myTeam=teams.find((team)=>team.owner_id===user.id)
  const myIds=new Set(rosters.filter((row)=>row.team_id===myTeam?.id).map((row)=>row.player_id))
  const rosteredIds=new Set(rosters.map((row)=>row.player_id))
  const roster=players.filter((player)=>myIds.has(player.id)).map((player)=>({...player,dash:dashScore(player),projection:projectedFantasyPoints(player,league.scoring)}))
  const {data:lineupRows}=myTeam?await supabase.from('fantasy_lineup_slots').select('*').eq('team_id',myTeam.id).eq('season',SEASON).eq('week',WEEK):{data:[]}
  const lineup=lineupRows||[]
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
  // An unstarted team has no grade. Empty roster -> draftScore 0, no waiverTarget
  // so waiverScore sits on its 45 floor, and that alone makes overallScore 9.
  const graded=roster.length>0
  const nextGame=games.find((game)=>new Date(game.kickoff)>new Date())
  // -- GAME PLAN: NEXT WEEK'S MATCHUP (2026-09-12, Donovan: "help plan for
  // the next weeks matchup") -------------------------------------------------
  // fantasy_lineup_slots only gets a row when a manager explicitly sets one
  // (set_fantasy_lineup_slot, 202608260001) -- no default, no carry-forward --
  // so next week's lineup almost never exists as data yet, for either side.
  // bestPossibleLineup computes what it COULD be instead of reading a row
  // that isn't there.
  const nextMatchups=nextMatchupRows||[]
  const nextMatchup=myTeam?nextMatchups.find((game)=>game.home_team_id===myTeam.id||game.away_team_id===myTeam.id):null
  const nextOpponentId=nextMatchup?(nextMatchup.home_team_id===myTeam.id?nextMatchup.away_team_id:nextMatchup.home_team_id):null
  const nextOpponent=nextOpponentId?teams.find((team)=>team.id===nextOpponentId):null
  const opponentIds=nextOpponent?new Set(rosters.filter((row)=>row.team_id===nextOpponent.id).map((row)=>row.player_id)):new Set()
  const opponentRoster=players.filter((player)=>opponentIds.has(player.id)).map((player)=>({...player,dash:dashScore(player),projection:projectedFantasyPoints(player,league.scoring)}))
  // Bye teams for THAT week specifically -- games already holds the whole
  // season (fetched unfiltered above, for nextGame), so this is a filter, not
  // a new query. null when that week isn't published yet (byeTeamsFor's own
  // guard), and every check below already treats null as "can't tell."
  const nextWeekGames=nextWeek?games.filter((game)=>game.week===nextWeek):[]
  const nextByeTeams=byeTeamsFor(nextWeekGames)
  const myByeNextWeek=nextByeTeams?roster.filter((player)=>isOnBye(player,nextByeTeams)):[]
  const opponentByeNextWeek=nextByeTeams?opponentRoster.filter((player)=>isOnBye(player,nextByeTeams)):[]
  // A bye player can't be started next week no matter how good his season
  // average looks -- excluded from the pool the optimizer draws from, not
  // just flagged after the fact, so the plan never "starts" someone who
  // isn't playing.
  const myPlan=bestPossibleLineup(roster.filter((player)=>!myByeNextWeek.includes(player)),required)
  const opponentPlan=bestPossibleLineup(opponentRoster.filter((player)=>!opponentByeNextWeek.includes(player)),required)

  return <main className={styles.roomApp}>
    <header className={styles.roomHeader}><NetworkSwitch variant="inline"/><div><small>DASH INTELLIGENCE</small><strong>{league.name}</strong></div><span>{latestSync?.status==='complete'?'Scoring automation healthy':games.length?'NFL feed connected':'Feed awaiting sync'}</span></header>
    <LeagueNav leagueId={leagueId} active="coach" isCommissioner={league.commissioner_id === user.id} className={styles.roomNav} activeClassName={styles.roomActive} />
    <div className={styles.roomBody}>
      {(query?.error||query?.message)&&<p className={query.error?styles.error:styles.message}>{query.error||query.message}</p>}
      <section className={styles.coachHero}><div><p className={styles.panelLabel}>DASH COACH · WEEK {WEEK}</p><h1>{recommendations[0]?.title||'Your next move starts here.'}</h1><p>{recommendations[0]?.detail||'Draft players and set a lineup to unlock personalized recommendations.'}</p></div><div className={styles.coachGrade}><small>DASH SCORE</small><strong>{graded?overallScore:'—'}</strong><span>{graded?grade(overallScore):'not graded yet'}</span>{graded&&<CoachShareCard className={styles.coachShareButton} team={myTeam?.name} league={league.name} score={overallScore} grade={grade(overallScore)} headline={recommendations[0]?.title} detail={recommendations[0]?.detail}/>}</div></section>
      <section className={styles.scoreCards}><ScoreCard graded={graded} label="DASH SCORE" score={overallScore} copy="Overall team readiness"/><ScoreCard graded={graded} label="DRAFT SCORE" score={draftScore} copy="Roster strength and balance"/><ScoreCard graded={graded} label="WAIVER SCORE" score={waiverScore} copy="Available upgrade potential"/></section>
      {league.commissioner_id===user.id&&<section className={styles.commishBar}><div><p className={styles.panelLabel}>NFL SCORING CONTROL</p><strong>{nextGame?<>Next kickoff <LocalTime mode="datetime" value={nextGame.kickoff}/></>:'Refresh the provider-neutral feed'}</strong></div><form action={syncNflWeekFeed}><input type="hidden" name="leagueId" value={leagueId}/><SubmitButton pendingLabel="Refreshing…">Refresh NFL feed &amp; locks</SubmitButton></form><form action={refreshMatchupScores}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="season" value={SEASON}/><input type="hidden" name="week" value={WEEK}/><SubmitButton pendingLabel="Recalculating…">Recalculate Week {WEEK}</SubmitButton></form></section>}
      <div className={styles.coachLayout}><section className={styles.coachRecommendations}><div className={styles.boardHead}><div><p className={styles.panelLabel}>RECOMMENDATIONS</p><h2>What DASH sees</h2></div><span>{recommendations.length} moves</span></div>{recommendations.slice(0,6).map((item,index)=><article key={`${item.title}-${index}`}><span>{item.type==='waiver'?'⚡':'↗'}</span><div><small>{item.type.toUpperCase()} · +{item.impact.toFixed(1)} projected</small><h3>{item.title}</h3><p>{item.detail}</p></div></article>)}{!recommendations.length&&<p className={styles.emptyRoom}>No obvious upgrade yet. Complete the draft and set Week {WEEK} starters to activate lineup comparisons.</p>}</section><aside className={styles.coachSide}><section><div className={styles.boardHead}><div><p className={styles.panelLabel}>LINEUP HEALTH</p><h2>Week {WEEK}</h2></div></div><div className={styles.coachMetric}><span>Starting slots</span><b>{starters.length}/{required.length}</b></div><div className={styles.coachMetric}><span>Projected points</span><b>{starters.reduce((sum,row)=>sum+row.player.projection,0).toFixed(1)}</b></div><div className={styles.coachMetric}><span>Injury flags</span><b>{roster.filter((player)=>player.injury_status).length}</b></div></section><section><div className={styles.boardHead}><div><p className={styles.panelLabel}>SCORING STATUS</p><h2>{latestSync?.status==='complete'?'Automation healthy':'Live foundation'}</h2></div><span className={`${styles.syncHealth} ${latestSync?.status==='failed'?styles.syncFailed:''}`}>{latestSync?.status||'manual'}</span></div>{latestSync&&<div className={styles.syncMetrics}><span><small>LAST RUN</small><b><LocalTime mode="datetime" value={latestSync.started_at}/></b></span><span><small>PLAYERS</small><b>{latestSync.players_synced}</b></span><span><small>MATCHUPS</small><b>{latestSync.matchups_refreshed}</b></span></div>}<p className={styles.emptyRoom}>Kickoff times lock each player individually. Fantasy totals use league-specific {String(league.scoring||'ppr').replace('_','-').toUpperCase()} scoring whenever the provider publishes verified box-score statistics.</p></section></aside></div><section className={styles.coachRecommendations}><div className={styles.boardHead}><div><p className={styles.panelLabel}>GAME PLAN{nextWeek?` · WEEK ${nextWeek}`:""}</p><h2>{!nextWeek?"Season finale":nextOpponent?`vs ${nextOpponent.name}`:"No matchup yet"}</h2></div>{nextWeek&&nextOpponent&&myPlan.filled>0&&opponentPlan.filled>0&&<span>{myPlan.totalProjection>=opponentPlan.totalProjection?`+${(myPlan.totalProjection-opponentPlan.totalProjection).toFixed(1)} projected`:`${(opponentPlan.totalProjection-myPlan.totalProjection).toFixed(1)} behind, projected`}</span>}</div>{!myTeam&&<p className={styles.emptyRoom}>Join a team to get a game plan.</p>}{myTeam&&!nextWeek&&<p className={styles.emptyRoom}>Week {WEEK} is the last week on the schedule — nothing to plan for yet.</p>}{myTeam&&nextWeek&&!nextOpponent&&<p className={styles.emptyRoom}>Week {nextWeek} does not have a schedule yet.</p>}{myTeam&&nextWeek&&nextOpponent&&<div className={styles.gamePlanCols}><PlanCard label="YOUR LINEUP" teamName={myTeam.name} plan={myPlan} onByeNextWeek={myByeNextWeek}/><PlanCard label="THEIR LINEUP" teamName={nextOpponent.name} plan={opponentPlan} onByeNextWeek={opponentByeNextWeek}/></div>}</section>
    </div>
  </main>
}

function ScoreCard({label,score,copy,graded}){return <article><small>{label}</small><strong>{graded?score:'—'}</strong><span>{graded?grade(score):'—'}</span><p>{graded?copy:'Draft a roster to score this'}</p></article>}


function PlanCard({label,teamName,plan,onByeNextWeek}){return <section className={styles.gamePlanCard}><div className={styles.boardHead}><div><p className={styles.panelLabel}>{label}</p><h2>{teamName}</h2></div><span>{plan.filled?`${plan.totalProjection.toFixed(1)} proj`:"no roster"}</span></div>{plan.starters.map((row,index)=><div key={`${row.slot}-${index}`} className={styles.coachMetric}><span>{row.slot} · {row.player?row.player.name:"—"}{row.player?.injury_status&&<InjuryTag status={row.player.injury_status}/>}</span><b>{row.player?row.player.projection.toFixed(1):"—"}</b></div>)}{onByeNextWeek.length>0&&<p className={styles.emptyRoom}>On bye: {onByeNextWeek.map((player)=>player.name).join(", ")}.</p>}</section>}
