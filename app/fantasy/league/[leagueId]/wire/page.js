import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import styles from '../../../fantasy.module.css'
import { addFreeAgent, cancelWaiverClaim, processWaivers, submitWaiverClaim } from './actions'

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
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)redirect('/fantasy')
  const [{data:league},{data:membership},{data:teams=[]},{data:players=[]},{data:rosters=[]},{data:availability=[]},{data:claims=[]}]=await Promise.all([
    supabase.from('fantasy_leagues').select('*').eq('id',leagueId).single(),
    supabase.from('fantasy_league_memberships').select('role').eq('league_id',leagueId).eq('user_id',user.id).single(),
    supabase.from('fantasy_teams').select('*').eq('league_id',leagueId).order('waiver_priority'),
    supabase.from('nfl_players').select('id,name,position,team,injury_status,source_payload').eq('active',true),
    supabase.from('fantasy_roster_entries').select('team_id,player_id').eq('league_id',leagueId).is('released_at',null),
    supabase.from('fantasy_player_availability').select('*').eq('league_id',leagueId),
    supabase.from('fantasy_waiver_claims').select('*,player:nfl_players!fantasy_waiver_claims_player_id_fkey(name,position,team)').eq('league_id',leagueId).order('created_at',{ascending:false}),
  ])
  if(!league||!membership)notFound()
  const safeTeams=teams||[]
  const safePlayers=players||[]
  const safeRosters=rosters||[]
  const safeAvailability=availability||[]
  const myTeam=safeTeams.find((team)=>team.owner_id===user.id)
  const rosteredIds=new Set(safeRosters.map((row)=>row.player_id))
  const myRosterIds=safeRosters.filter((row)=>row.team_id===myTeam?.id).map((row)=>row.player_id)
  const myRoster=safePlayers.filter((player)=>myRosterIds.includes(player.id)).sort((a,b)=>a.position.localeCompare(b.position)||a.name.localeCompare(b.name))
  const selectedPosition=POSITIONS.includes(query?.position)?query.position:'ALL'
  const search=String(query?.q||'').trim().toLowerCase().slice(0,40)
  const availablePlayers=safePlayers.map((player)=>({...player,dash_score:dashScore(player)}))
    .filter((player)=>!rosteredIds.has(player.id))
    .filter((player)=>selectedPosition==='ALL'||player.position===selectedPosition)
    .filter((player)=>!search||player.name.toLowerCase().includes(search)||player.team?.toLowerCase().includes(search))
    .sort((a,b)=>b.dash_score-a.dash_score||a.name.localeCompare(b.name))
  const waiverMap=new Map(safeAvailability.map((row)=>[row.player_id,row]))
  const safeClaims=claims||[]
  const myClaims=safeClaims.filter((claim)=>claim.team_id===myTeam?.id&&claim.status==='pending')
  const nextProcessing=safeClaims.filter((claim)=>claim.status==='pending').sort((a,b)=>new Date(a.process_after)-new Date(b.process_after))[0]

  return <main className={styles.roomApp}>
    <header className={styles.roomHeader}><Link href="/fantasy">← FRANCHISE</Link><div><small>PLAYER MARKET</small><strong>{league.name}</strong></div><span>Priority #{safeTeams.findIndex((team)=>team.id===myTeam?.id)+1}</span></header>
    <nav className={styles.roomNav}><Link href={`/fantasy/league/${leagueId}`}>Draft</Link><Link href={`/fantasy/league/${leagueId}/team`}>Team</Link><Link href={`/fantasy/league/${leagueId}/matchup`}>Matchup</Link><Link href={`/fantasy/league/${leagueId}/league`}>League</Link><a className={styles.roomActive}>Wire</a><Link href={`/fantasy/league/${leagueId}/trades`}>Trades</Link><Link href={`/fantasy/league/${leagueId}/feed`}>Feed</Link><Link href={`/fantasy/league/${leagueId}/coach`}>Coach</Link></nav>
    <div className={styles.roomBody}>
      {(query?.error||query?.message)&&<p className={query.error?styles.error:styles.message}>{query.error||query.message}</p>}
      <section className={styles.wireHero}><div><p className={styles.panelLabel}>THE WIRE</p><h1>Find the next difference-maker.</h1><p>Free agents join immediately. Dropped players spend 24 hours on rolling-priority waivers.</p></div><div className={styles.roomStats}><span><small>PRIORITY</small><b>#{safeTeams.findIndex((team)=>team.id===myTeam?.id)+1}</b></span><span><small>CLAIMS</small><b>{myClaims.length}</b></span><span><small>ROSTER</small><b>{myRoster.length}/15</b></span></div></section>
      {membership.role==='commissioner'&&<section className={styles.commishBar}><div><p className={styles.panelLabel}>COMMISSIONER</p><strong>{nextProcessing?`Next claims ${remaining(nextProcessing.process_after)}`:'No pending waiver run'}</strong></div><form action={processWaivers}><input type="hidden" name="leagueId" value={leagueId}/><button disabled={!nextProcessing}>Process cleared claims</button></form></section>}
      <div className={styles.wireLayout}>
        <section className={styles.playerBoard}><div className={styles.boardHead}><div><p className={styles.panelLabel}>AVAILABLE PLAYERS</p><h2>Free agents & waivers</h2></div><form className={styles.playerSearch}><input name="q" defaultValue={query?.q||''} placeholder="Search player or team"/><input type="hidden" name="position" value={selectedPosition}/><button>Search</button></form><span>{availablePlayers.length} players</span></div>
          <div className={styles.positionFilters}>{POSITIONS.map((position)=><Link key={position} className={selectedPosition===position?styles.positionActive:''} href={`/fantasy/league/${leagueId}/wire?position=${position}`}>{position}</Link>)}</div>
          <div className={styles.wireColumns}><span>POS</span><span>PLAYER</span><span>DASH</span><span>STATUS</span><span>MOVE</span></div>
          {availablePlayers.slice(0,80).map((player)=>{const waiver=waiverMap.get(player.id);const onWaivers=waiver&&new Date(waiver.waiver_until)>new Date();const action=onWaivers?submitWaiverClaim:addFreeAgent;return <form action={action} className={styles.wirePlayer} key={player.id}><span className={styles.positionTag}>{player.position}</span><div><b>{player.name}</b><small>{player.team||'FA'}{player.injury_status?` · ${player.injury_status}`:''}</small></div><strong>{player.dash_score}</strong><span className={onWaivers?styles.waiverStatus:styles.freeStatus}>{onWaivers?remaining(waiver.waiver_until):'FREE'}</span><div className={styles.wireMove}><select name="dropPlayerId" defaultValue=""><option value="">No drop</option>{myRoster.map((rosterPlayer)=><option value={rosterPlayer.id} key={rosterPlayer.id}>Drop {rosterPlayer.name}</option>)}</select><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="playerId" value={player.id}/><button disabled={league.status!=='active'}>{onWaivers?'Claim':'Add'}</button></div></form>})}
          {!availablePlayers.length&&<p className={styles.emptyRoom}>No available players match this filter.</p>}
        </section>
        <aside className={styles.wireSide}><section><div className={styles.boardHead}><div><p className={styles.panelLabel}>MY CLAIMS</p><h2>Pending moves</h2></div><span>{myClaims.length}</span></div>{myClaims.map((claim)=><div className={styles.claimRow} key={claim.id}><div><b>{claim.player?.name}</b><small>{claim.player?.position} · clears in {remaining(claim.process_after)}</small></div><form action={cancelWaiverClaim}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="claimId" value={claim.id}/><button>Cancel</button></form></div>)}{!myClaims.length&&<p className={styles.emptyRoom}>You have no pending claims.</p>}</section>
          <section><div className={styles.boardHead}><div><p className={styles.panelLabel}>ROLLING PRIORITY</p><h2>Waiver order</h2></div></div>{safeTeams.map((team,index)=><div className={styles.priorityRow} key={team.id}><span>{index+1}</span><b>{team.name}</b><small>{team.id===myTeam?.id?'YOU':''}</small></div>)}</section>
          <section><div className={styles.boardHead}><div><p className={styles.panelLabel}>DASH COACH</p><h2>Wire basics</h2></div></div><p className={styles.emptyRoom}>{league.status==='active'?'Use free agency for immediate adds. A successful waiver claim moves your team to the back of the priority order.':'The Wire opens when the draft is complete.'}</p></section></aside>
      </div>
    </div>
  </main>
}
