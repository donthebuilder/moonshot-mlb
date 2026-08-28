import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import SubmitButton from '../../../../../components/fantasy/SubmitButton'
import LocalTime from '../../../../../components/fantasy/LocalTime'
import styles from '../../../fantasy.module.css'
import { cancelTrade, proposeTrade, respondTrade, reviewTrade } from './actions'

export default async function TradesPage({params,searchParams}) {
  const [{leagueId},query]=await Promise.all([params,searchParams])
  const selectedTeamId=String(query?.team||'')
  const supabase=await createSupabaseServerClient()
  if(!supabase)redirect('/fantasy')
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)redirect('/fantasy')
  const [{data:league},{data:membership},{data:teamRows},{data:rosterRows},{data:tradeRows}]=await Promise.all([
    supabase.from('fantasy_leagues').select('*').eq('id',leagueId).single(),
    supabase.from('fantasy_league_memberships').select('role').eq('league_id',leagueId).eq('user_id',user.id).single(),
    supabase.from('fantasy_teams').select('*').eq('league_id',leagueId).order('created_at'),
    supabase.from('fantasy_roster_entries').select('team_id,player:nfl_players(id,name,position,team,source_payload)').eq('league_id',leagueId).is('released_at',null),
    supabase.from('fantasy_trades').select('*,items:fantasy_trade_items(*,player:nfl_players(id,name,position,team))').eq('league_id',leagueId).order('created_at',{ascending:false}),
  ])
  if(!league||!membership)notFound()
  const teams=teamRows||[]
  const rosters=rosterRows||[]
  const trades=tradeRows||[]
  const myTeam=teams.find((team)=>team.owner_id===user.id)
  const otherTeams=teams.filter((team)=>team.id!==myTeam?.id)
  const target=otherTeams.find((team)=>team.id===selectedTeamId)||otherTeams[0]
  const rosterFor=(teamId)=>rosters.filter((row)=>row.team_id===teamId).map((row)=>row.player).filter(Boolean).sort((a,b)=>(a.position||'').localeCompare(b.position||'')||a.name.localeCompare(b.name))
  const myRoster=rosterFor(myTeam?.id)
  const targetRoster=rosterFor(target?.id)
  const relevant=trades.filter((trade)=>trade.proposer_team_id===myTeam?.id||trade.recipient_team_id===myTeam?.id||membership.role==='commissioner')
  const reviewCount=trades.filter((trade)=>trade.status==='accepted').length

  return <main className={styles.roomApp}>
    <header className={styles.roomHeader}><Link href="/fantasy">← FRANCHISE</Link><div><small>TRADE DESK</small><strong>{league.name}</strong></div><span>{reviewCount} awaiting review</span></header>
    <nav aria-label="League sections" className={styles.roomNav}><Link href={`/fantasy/league/${leagueId}`}>Draft</Link><Link href={`/fantasy/league/${leagueId}/team`}>Team</Link><Link href={`/fantasy/league/${leagueId}/matchup`}>Matchup</Link><Link href={`/fantasy/league/${leagueId}/league`}>League</Link><Link href={`/fantasy/league/${leagueId}/wire`}>Wire</Link><a className={styles.roomActive}>Trades</a><Link href={`/fantasy/league/${leagueId}/feed`}>Feed</Link><Link href={`/fantasy/league/${leagueId}/coach`}>Coach</Link></nav>
    <div className={styles.roomBody}>
      {(query?.error||query?.message)&&<p className={query.error?styles.error:styles.message}>{query.error||query.message}</p>}
      <section className={styles.tradeHero}><div><p className={styles.panelLabel}>TRADE DESK</p><h1>Build a deal. Make both teams better.</h1><p>Owners agree first. The commissioner reviews the final deal before any roster changes occur.</p></div><div className={styles.roomStats}><span><small>ACTIVE</small><b>{relevant.filter((trade)=>['pending','accepted'].includes(trade.status)).length}</b></span><span><small>REVIEW</small><b>{reviewCount}</b></span><span><small>DONE</small><b>{relevant.filter((trade)=>trade.status==='completed').length}</b></span></div></section>
      {!otherTeams.length&&<section className={styles.waitingRoom}><span>⇄</span><div><p className={styles.panelLabel}>TRADE PARTNERS</p><strong>Another owner needs to join first.</strong><small>Trade offers unlock as soon as the league has at least two teams with players.</small></div></section>}
      {otherTeams.length>0&&<section className={styles.tradeBuilder}><div className={styles.tradeBuilderHead}><div><p className={styles.panelLabel}>NEW OFFER</p><h2>Propose a trade</h2></div><form><label>Trade partner<select name="team" defaultValue={target?.id}>{otherTeams.map((team)=><option value={team.id} key={team.id}>{team.name}</option>)}</select></label><SubmitButton pendingLabel="Loading…">Load roster</SubmitButton></form></div><form action={proposeTrade}><div className={styles.tradeSides}><PlayerSelect title={`${myTeam?.name} sends`} name="offeredPlayerIds" players={myRoster}/><span className={styles.tradeArrow}>⇄</span><PlayerSelect title={`${target?.name} sends`} name="requestedPlayerIds" players={targetRoster}/></div><div className={styles.tradeNote}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="recipientTeamId" value={target?.id}/><input name="note" maxLength="280" placeholder="Optional note to the other owner"/><SubmitButton disabled={!myRoster.length||!targetRoster.length} pendingLabel="Sending…">Send offer</SubmitButton></div></form></section>}
      <section className={styles.tradeHistory}><div className={styles.boardHead}><div><p className={styles.panelLabel}>LEAGUE OFFERS</p><h2>Trade activity</h2></div><span>{relevant.length} deals</span></div>{relevant.map((trade)=><TradeCard trade={trade} teams={teams} myTeam={myTeam} commissioner={membership.role==='commissioner'} leagueId={leagueId} key={trade.id}/>)}{!relevant.length&&<p className={styles.emptyRoom}>No trade offers yet.</p>}</section>
    </div>
  </main>
}

function PlayerSelect({title,name,players}) {
  return <section><p className={styles.panelLabel}>{title}</p><div className={styles.tradeRoster}>{players.map((player)=><label key={player.id}><input type="checkbox" name={name} value={player.id}/><span>{player.position}</span><div><b>{player.name}</b><small>{player.team}</small></div></label>)}{!players.length&&<p className={styles.emptyRoom}>No players rostered.</p>}</div></section>
}

function TradeCard({trade,teams,myTeam,commissioner,leagueId}) {
  const proposer=teams.find((team)=>team.id===trade.proposer_team_id)
  const recipient=teams.find((team)=>team.id===trade.recipient_team_id)
  const offered=trade.items?.filter((item)=>item.from_team_id===proposer?.id)||[]
  const requested=trade.items?.filter((item)=>item.from_team_id===recipient?.id)||[]
  const incoming=trade.recipient_team_id===myTeam?.id&&trade.status==='pending'
  const outgoing=trade.proposer_team_id===myTeam?.id&&trade.status==='pending'
  return <article className={styles.tradeCard}><div className={styles.tradeCardTop}><span className={`${styles.tradeStatus} ${styles[`trade_${trade.status}`]||''}`}>{trade.status}</span><small><LocalTime mode="date" value={trade.created_at}/></small></div><div className={styles.tradeSummary}><div><b>{proposer?.name}</b>{offered.map((item)=><span key={item.id}>{item.player?.position} · {item.player?.name}</span>)}</div><em>⇄</em><div><b>{recipient?.name}</b>{requested.map((item)=><span key={item.id}>{item.player?.position} · {item.player?.name}</span>)}</div></div>{trade.note&&<p className={styles.tradeMessage}>“{trade.note}”</p>}<div className={styles.tradeActions}>{incoming&&<><TradeAction action={respondTrade} leagueId={leagueId} tradeId={trade.id} name="response" value="accepted" label="Accept"/><TradeAction action={respondTrade} leagueId={leagueId} tradeId={trade.id} name="response" value="rejected" label="Reject"/></>}{outgoing&&<TradeAction action={cancelTrade} leagueId={leagueId} tradeId={trade.id} label="Cancel offer"/>}{commissioner&&trade.status==='accepted'&&<><TradeAction action={reviewTrade} leagueId={leagueId} tradeId={trade.id} name="decision" value="approve" label="Approve trade"/><TradeAction action={reviewTrade} leagueId={leagueId} tradeId={trade.id} name="decision" value="veto" label="Veto"/></>}</div></article>
}

function TradeAction({action,leagueId,tradeId,name,value,label}) {
  return <form action={action}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="tradeId" value={tradeId}/>{name&&<input type="hidden" name={name} value={value}/>}<SubmitButton pendingLabel="…">{label}</SubmitButton></form>
}
