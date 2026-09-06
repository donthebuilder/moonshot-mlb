import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import SubmitButton from '../../../../../components/fantasy/SubmitButton'
import styles from '../../../fantasy.module.css'
import TeamMark from '../../../../../components/fantasy/TeamMark'
import PlayerFace from '../../../../../components/fantasy/PlayerFace'
import PlayerMeta from '../../../../../components/fantasy/PlayerMeta'
import InjuryTag from '../../../../../components/fantasy/InjuryTag'
import { byeTeamsFor, isOnBye } from '../../../../../lib/fantasy/bye'
import { gameForPlayer, teamScheduleFor } from '../../../../../lib/fantasy/schedule'
import { projectedFantasyPoints, projectionIsPartial } from '../../../../../lib/fantasy/scoring'
import { FANTASY_SEASON, resolveFantasyWeek } from '../../../../../lib/fantasy/week'
import { addFreeAgent, cancelWaiverClaim, processWaivers, submitWaiverClaim } from './actions'
import LeagueNav from '../../../../../components/fantasy/LeagueNav'

const POSITIONS=['ALL','QB','RB','WR','TE','K','DEF']

function dashScore(player) {
  const values=Object.values(player.source_payload?.scores||{}).map(Number).filter(Number.isFinite)
  return values.length?Math.round(Math.max(...values)):50
}

function remaining(until) {
  const ms=new Date(until).getTime()-Date.now()
  if(ms<=0)return 'PROCESSING'
  const hours=Math.floor(ms/3600000)
  const minutes=Math.max(1,Math.ceil((ms%3600000)/60000))
  return `${hours}h ${minutes}m`
}

export default async function WirePage({params,searchParams}) {
  const [{leagueId},query]=await Promise.all([params,searchParams])
  const supabase=await createSupabaseServerClient()
  if(!supabase)redirect('/fantasy')
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)redirect('/fantasy')
  // The Wire had no idea what week it was, which is why no row could say who a
  // man plays or when he kicks off. One extra select, the same one the Team and
  // Matchup pages already make.
  const WEEK=await resolveFantasyWeek(supabase,query?.week)
  const [{data:league},{data:membership},{data:teams=[]},{data:players=[]},{data:rosters=[]},{data:availability=[]},{data:claims=[]},{data:weekGames=[]}]=await Promise.all([
    supabase.from('fantasy_leagues').select('*').eq('id',leagueId).single(),
    supabase.from('fantasy_league_memberships').select('role').eq('league_id',leagueId).eq('user_id',user.id).single(),
    supabase.from('fantasy_teams').select('*').eq('league_id',leagueId).order('waiver_priority'),
    supabase.from('nfl_players').select('id,name,position,team,injury_status,source_payload,source_player_id').eq('active',true),
    supabase.from('fantasy_roster_entries').select('team_id,player_id').eq('league_id',leagueId).is('released_at',null),
    supabase.from('fantasy_player_availability').select('*').eq('league_id',leagueId),
    supabase.from('fantasy_waiver_claims').select('*,player:nfl_players!fantasy_waiver_claims_player_id_fkey(name,position,team)').eq('league_id',leagueId).order('created_at',{ascending:false}),
    // In the same round trip as everything else. This page already pulls the
    // whole active player table; a serial eighth query in front of it, run even
    // for a request that is about to notFound(), is not the place to spend a
    // round trip.
    supabase.from('nfl_week_games').select('home_team,away_team,season_type,kickoff,status').eq('season',FANTASY_SEASON).eq('week',WEEK),
  ])
  if(!league||!membership)notFound()
  const schedule=teamScheduleFor(weekGames)
  // Null when the slate is too thin to be sure -- see lib/fantasy/bye.js.
  const byeTeams=byeTeamsFor(weekGames)
  const safeTeams=teams||[]
  const safePlayers=players||[]
  const safeRosters=rosters||[]
  const safeAvailability=availability||[]
  const myTeam=safeTeams.find((team)=>team.owner_id===user.id)
  const rosteredIds=new Set(safeRosters.map((row)=>row.player_id))
  const myRosterIds=safeRosters.filter((row)=>row.team_id===myTeam?.id).map((row)=>row.player_id)
  const myRoster=safePlayers.filter((player)=>myRosterIds.includes(player.id)).sort((a,b)=>(a.position||'').localeCompare(b.position||'')||a.name.localeCompare(b.name))
  const selectedPosition=POSITIONS.includes(query?.position)?query.position:'ALL'
  const search=String(query?.q||'').trim().toLowerCase().slice(0,40)
  const availablePlayers=safePlayers.map((player)=>({...player,dash_score:dashScore(player),projection:projectedFantasyPoints(player,league.scoring)||0}))
    .filter((player)=>!rosteredIds.has(player.id))
    .filter((player)=>selectedPosition==='ALL'||player.position===selectedPosition)
    .filter((player)=>!search||player.name.toLowerCase().includes(search)||player.team?.toLowerCase().includes(search))
    .sort((a,b)=>b.dash_score-a.dash_score||a.name.localeCompare(b.name))
  // #7: the list cut silently at 80 of 577 and the only count was up in the
  // board header, nowhere near the cut. The cut stays -- 577 rows of headshots
  // is not a page anyone wants on a phone -- but it now says so where it
  // happens, and grows by a link rather than not at all. Query param, not
  // client state: this page has no client JS and does not need any.
  const PAGE=80
  const limit=Math.min(560,Math.max(PAGE,Math.round(Number(query?.limit)||PAGE)))
  const shownPlayers=availablePlayers.slice(0,limit)
  const moreHref=`/fantasy/league/${leagueId}/wire?position=${selectedPosition}${query?.q?`&q=${encodeURIComponent(String(query.q))}`:''}&limit=${limit+PAGE}`
  const waiverMap=new Map(safeAvailability.map((row)=>[row.player_id,row]))
  const safeClaims=claims||[]
  const myClaims=safeClaims.filter((claim)=>claim.team_id===myTeam?.id&&claim.status==='pending')
  const nextProcessing=safeClaims.filter((claim)=>claim.status==='pending').sort((a,b)=>new Date(a.process_after)-new Date(b.process_after))[0]

  return <main className={styles.roomApp}>
    <header className={styles.roomHeader}><Link href="/fantasy">← FRANCHISE</Link><div><small>PLAYER MARKET</small><strong>{league.name}</strong></div><span>{myTeam?`Priority #${safeTeams.findIndex((team)=>team.id===myTeam.id)+1}`:'No team yet'}</span></header>
    <LeagueNav leagueId={leagueId} active="wire" role={membership?.role} className={styles.roomNav} activeClassName={styles.roomActive} />
    <div className={styles.roomBody}>
      {(query?.error||query?.message)&&<p className={query.error?styles.error:styles.message}>{query.error||query.message}</p>}
      <section className={styles.wireHero}><div><p className={styles.panelLabel}>THE WIRE</p><h1>Find the next difference-maker.</h1><p>Free agents join immediately. Dropped players spend 24 hours on rolling-priority waivers.</p></div><div className={styles.roomStats}><span><small>PRIORITY</small><b>{myTeam?`#${safeTeams.findIndex((team)=>team.id===myTeam.id)+1}`:'—'}</b></span><span><small>CLAIMS</small><b>{myClaims.length}</b></span><span><small>ROSTER</small><b>{myRoster.length}/15</b></span></div></section>
      {membership.role==='commissioner'&&<section className={styles.commishBar}><div><p className={styles.panelLabel}>COMMISSIONER</p><strong>{nextProcessing?`Next claims ${remaining(nextProcessing.process_after)}`:'No pending waiver run'}</strong></div><form action={processWaivers}><input type="hidden" name="leagueId" value={leagueId}/><SubmitButton disabled={!nextProcessing} pendingLabel="Processing…">Process cleared claims</SubmitButton></form></section>}
      <div className={styles.wireLayout}>
        <section className={styles.playerBoard}>{/* #71 / #77: the draft board and this page printed the same unlabelled
              number and it meant two different things -- which is also why the same
              player rendered green on one and orange on the other. The board is
              now season value; this stays the WEEKLY market score, because an
              in-season pickup is a question about the coming Sunday. Two
              questions, two numbers, and now each says which it is. */}
          <div className={styles.boardHead}><div><p className={styles.panelLabel}>AVAILABLE PLAYERS</p><h2>Free agents &amp; waivers</h2><small className={styles.boardNote}>Ranked by this week&apos;s market score — how likely each man is to clear a prop on Sunday. That is a different question from the draft board, which ranks season value.</small></div><form className={styles.playerSearch}><input aria-label="Search players" name="q" defaultValue={query?.q||''} placeholder="Search player or team"/><input type="hidden" name="position" value={selectedPosition}/><button>Search</button></form><span>{availablePlayers.length} players</span></div>
          <div className={styles.positionFilters}>{POSITIONS.map((position)=><Link key={position} className={selectedPosition===position?styles.positionActive:''} aria-current={selectedPosition===position?'true':undefined} href={`/fantasy/league/${leagueId}/wire?position=${position}${query?.q?`&q=${encodeURIComponent(String(query.q))}`:''}`}>{position}</Link>)}</div>
          <div className={styles.wireColumns}><span>POS</span><span>PLAYER</span><span>PROJ</span><span>DASH</span><span>STATUS</span><span>MOVE</span></div>
          {shownPlayers.map((player)=>{const waiver=waiverMap.get(player.id);const onWaivers=waiver&&new Date(waiver.waiver_until)>new Date();const action=onWaivers?submitWaiverClaim:addFreeAgent;return <form action={action} className={styles.wirePlayer} key={player.id}><span className={styles.positionTag}>{player.position}</span><div className={styles.playerIdentity}><PlayerFace player={player} size={32}/><span><b>{player.name}<InjuryTag status={player.injury_status}/></b><PlayerMeta player={player} game={gameForPlayer(schedule,player)} bye={isOnBye(player,byeTeams)} showPosition={false}/></span></div><span className={styles.wireProj} title={projectionIsPartial(player)?'The feed carries no passing touchdowns or defensive turnovers, so quarterback and defence projections are low.':`Projected ${player.projection.toFixed(1)} points this week under this league's scoring`}>{isOnBye(player,byeTeams)?'—':player.projection.toFixed(1)}{projectionIsPartial(player)&&!isOnBye(player,byeTeams)?<em className={styles.partialMark}>*</em>:null}<i>PROJ</i></span><strong title="This week's market score: how likely this man is to clear a prop on Sunday. Not points.">{player.dash_score}<i>DASH</i></strong><span className={onWaivers?styles.waiverStatus:styles.freeStatus}>{onWaivers?remaining(waiver.waiver_until):'FREE'}</span><div className={styles.wireMove}><select name="dropPlayerId" defaultValue=""><option value="">No drop</option>{myRoster.map((rosterPlayer)=><option value={rosterPlayer.id} key={rosterPlayer.id}>Drop {rosterPlayer.name}</option>)}</select><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="playerId" value={player.id}/><SubmitButton disabled={league.status!=='active'} pendingLabel="…">{onWaivers?'Claim':'Add'}</SubmitButton></div></form>})}
          {!availablePlayers.length&&<p className={styles.emptyRoom}>No available players match this filter.</p>}
          {availablePlayers.length>0&&<p className={styles.wireMore}><span>Showing {shownPlayers.length} of {availablePlayers.length}</span>{availablePlayers.length>shownPlayers.length&&<Link href={moreHref}>Show {Math.min(PAGE,availablePlayers.length-shownPlayers.length)} more →</Link>}</p>}
        </section>
        <aside className={styles.wireSide}><section><div className={styles.boardHead}><div><p className={styles.panelLabel}>MY CLAIMS</p><h2>Pending moves</h2></div><span>{myClaims.length}</span></div>{myClaims.map((claim)=><div className={styles.claimRow} key={claim.id}><div><b>{claim.player?.name}</b><small>{claim.player?.position} · clears in {remaining(claim.process_after)}</small></div><form action={cancelWaiverClaim}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="claimId" value={claim.id}/><SubmitButton pendingLabel="…">Cancel</SubmitButton></form></div>)}{!myClaims.length&&<p className={styles.emptyRoom}>You have no pending claims.</p>}</section>
          <section><div className={styles.boardHead}><div><p className={styles.panelLabel}>ROLLING PRIORITY</p><h2>Waiver order</h2></div></div>{safeTeams.map((team,index)=><div className={styles.priorityRow} key={team.id}><span>{index+1}</span><div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}><TeamMark size={22} team={team}/><b style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{team.name}</b></div><small>{team.id===myTeam?.id?'YOU':''}</small></div>)}</section>
          <section><div className={styles.boardHead}><div><p className={styles.panelLabel}>DASH COACH</p><h2>Wire basics</h2></div></div><p className={styles.emptyRoom}>{league.status==='active'?'Use free agency for immediate adds. A successful waiver claim moves your team to the back of the priority order.':'The Wire opens when the draft is complete.'}</p></section></aside>
      </div>
    </div>
  </main>
}
