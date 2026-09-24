import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import SubmitButton from '../../../../../components/fantasy/SubmitButton'
import LocalTime from '../../../../../components/fantasy/LocalTime'
import PlayerFace from '../../../../../components/fantasy/PlayerFace'
import InjuryTag from '../../../../../components/fantasy/InjuryTag'
import TradeSideCount from '../../../../../components/fantasy/TradeSideCount'
import styles from '../../../fantasy.module.css'
import { cancelTrade, proposeTrade, respondTrade, reviewTrade } from './actions'
import NetworkSwitch from '../../../../../components/NetworkSwitch'
import LeagueNav from '../../../../../components/fantasy/LeagueNav'
import { PlayerSheetButton } from '../../../../../components/fantasy/PlayerSheet'
import { buildSheetData } from '../../../../../lib/fantasy/sheetEntry'
import { FANTASY_SEASON, resolveFantasyWeek } from '../../../../../lib/fantasy/week'

const TRADE_LIMIT=50

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
    supabase.from('fantasy_roster_entries').select('team_id,player:nfl_players(id,name,position,team,injury_status,source_payload,source_player_id)').eq('league_id',leagueId).is('released_at',null),
    // LIMITED (2026-09-20). This read had no bound: every trade ever proposed
    // in the league, each with its items and a player join, fetched and
    // rendered in full. It only grows, and a commissioner sees EVERY owner's
    // offers -- so the page got slower and longer all season with nothing
    // saying so. Fifty is far more than anyone scrolls; the count beside the
    // heading says when the list has been cut.
    supabase.from('fantasy_trades').select('*,items:fantasy_trade_items(*,player:nfl_players(id,name,position,team))').eq('league_id',leagueId).order('created_at',{ascending:false}).limit(TRADE_LIMIT),
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
  // ── WHAT HAS HE BEEN DOING? (2026-09-21) ────────────────────────────────
  // A trade is the decision with the least information on the page: two
  // rosters, a position and a club, and nothing either man has produced. The
  // sheet the Wire, Team and Matchup already carry fits here unchanged; this
  // page just never read the weekly table.
  //
  // Scoped to the two rosters actually on screen, four weeks, same as the
  // others -- not every player in the league.
  const TRADE_WEEK = await resolveFantasyWeek(supabase, query?.week)
  const sheetIds = [...myRoster, ...targetRoster].map((p) => p.id)
  let tradeWeeks = []
  if (sheetIds.length) {
    const { data = [] } = await supabase
      .from('nfl_player_week_stats')
      .select('player_id,week,stats,status,projected_points,game:nfl_week_games(home_team,away_team)')
      .in('player_id', sheetIds)
      .eq('season', FANTASY_SEASON)
      .gte('week', Math.max(1, TRADE_WEEK - 3))
      .lte('week', TRADE_WEEK)
    tradeWeeks = data || []
  }
  const tradeWeeksByPlayer = {}
  for (const row of tradeWeeks) (tradeWeeksByPlayer[row.player_id] ||= []).push(row)
  for (const rows of Object.values(tradeWeeksByPlayer)) rows.sort((a, b) => b.week - a.week)
  // Built server-side so the raw weekly stat blobs never cross to the
  // browser -- see lib/fantasy/sheetEntry.js for what that was costing.
  const sheetData = buildSheetData([...myRoster, ...targetRoster], tradeWeeksByPlayer, league.scoring)

  // Live offers first: a pending deal is the thing you came to act on, and it
  // must never be the one folded away.
  const relevant=trades.filter((trade)=>trade.proposer_team_id===myTeam?.id||trade.recipient_team_id===myTeam?.id||league.commissioner_id===user.id)
  // Pending offers always show; settled history previews and folds. Donovan's
  // standing rule is that a long list must preview a few rows everywhere it
  // appears -- this page comes FIRST on a phone once it has any history.
  const TRADE_PREVIEW=6
  const pendingTrades=relevant.filter((trade)=>trade.status==='pending')
  const settledTrades=relevant.filter((trade)=>trade.status!=='pending')
  const shownTrades=[...pendingTrades,...settledTrades].slice(0,Math.max(TRADE_PREVIEW,pendingTrades.length))
  const foldedTrades=[...pendingTrades,...settledTrades].slice(shownTrades.length)
  // A member cannot review anything, so "3 awaiting review" in their header was
  // a number about somebody else's job. Commissioners still see it.
  const reviewCount=league.commissioner_id===user.id?trades.filter((trade)=>trade.status==='accepted').length:0

  return <main className={styles.roomApp}>
    <header className={styles.roomHeader}><NetworkSwitch variant="inline"/><div><small>TRADE DESK</small><strong>{league.name}</strong></div><span>{league.commissioner_id===user.id?`${reviewCount} awaiting review`:`${relevant.filter((trade)=>['pending','accepted'].includes(trade.status)).length} open`}</span></header>
    <LeagueNav leagueId={leagueId} active="trades" isCommissioner={league.commissioner_id === user.id} className={styles.roomNav} activeClassName={styles.roomActive} />
    <div className={styles.roomBody}>
      {(query?.error||query?.message)&&<p className={query.error?styles.error:styles.message}>{query.error||query.message}</p>}
      <section className={styles.tradeHero}><div><p className={styles.panelLabel}>TRADE DESK</p><h1>Build a deal. Make both teams better.</h1><p>Owners agree first. The commissioner reviews the final deal before any roster changes occur.</p></div><div className={styles.roomStats}><span><small>ACTIVE</small><b>{relevant.filter((trade)=>['pending','accepted'].includes(trade.status)).length}</b></span><span><small>REVIEW</small><b>{reviewCount}</b></span><span><small>DONE</small><b>{relevant.filter((trade)=>trade.status==='completed').length}</b></span></div></section>
      {!otherTeams.length&&<section className={styles.waitingRoom}><span>⇄</span><div><p className={styles.panelLabel}>TRADE PARTNERS</p><strong>Another owner needs to join first.</strong><small>Trade offers unlock as soon as the league has at least two teams with players.</small></div></section>}
      {otherTeams.length>0&&<section className={styles.tradeBuilder}><div className={styles.tradeBuilderHead}><div><p className={styles.panelLabel}>NEW OFFER</p><h2>Propose a trade</h2></div><form><label>Trade partner<select name="team" defaultValue={target?.id}>{otherTeams.map((team)=><option value={team.id} key={team.id}>{team.name}</option>)}</select></label><SubmitButton pendingLabel="Loading…">Load roster</SubmitButton></form></div><form action={proposeTrade}><div className={styles.tradeSides}><PlayerSelect title={`${myTeam?.name} sends`} name="offeredPlayerIds" players={myRoster} sheet={sheetData} scoring={league.scoring}/><span className={styles.tradeArrow}>⇄</span><PlayerSelect title={`${target?.name} sends`} name="requestedPlayerIds" players={targetRoster} sheet={sheetData} scoring={league.scoring}/></div><div className={styles.tradeNote}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="recipientTeamId" value={target?.id}/><input name="note" maxLength="280" placeholder="Optional note to the other owner"/><SubmitButton disabled={!myRoster.length||!targetRoster.length} pendingLabel="Sending…">Send offer</SubmitButton></div></form></section>}
      <section className={styles.tradeHistory}><div className={styles.boardHead}><div><p className={styles.panelLabel}>LEAGUE OFFERS</p><h2>Trade activity</h2></div><span>{relevant.length} deals</span></div>{shownTrades.map((trade)=><TradeCard trade={trade} teams={teams} myTeam={myTeam} commissioner={league.commissioner_id===user.id} leagueId={leagueId} key={trade.id}/>)}{foldedTrades.length>0&&<details className={styles.moreFold}><summary>{foldedTrades.length} older {foldedTrades.length===1?'offer':'offers'}</summary>{foldedTrades.map((trade)=><TradeCard trade={trade} teams={teams} myTeam={myTeam} commissioner={league.commissioner_id===user.id} leagueId={leagueId} key={trade.id}/>)}</details>}{!relevant.length&&<p className={styles.emptyRoom}>No trade offers yet.</p>}</section>
    </div>
  </main>
}

function PlayerSelect({title,name,players,sheet,scoring}) {
  return <section><p className={styles.tradeSideHead}>{title}<TradeSideCount name={name}/></p><div className={styles.tradeRoster}>{players.map((player)=><div className={styles.tradeRow} key={player.id}><label><input type="checkbox" name={name} value={player.id}/><span>{player.position}</span><PlayerFace player={player} size={28}/><div><b>{player.name}<InjuryTag status={player.injury_status}/></b><small>{player.team}</small></div></label><PlayerSheetButton sheet={sheet?.[player.id]} className={styles.tradeInfo}>ⓘ</PlayerSheetButton></div>)}{!players.length&&<p className={styles.emptyRoom}>No players rostered.</p>}</div></section>
}

function TradeCard({trade,teams,myTeam,commissioner,leagueId}) {
  const proposer=teams.find((team)=>team.id===trade.proposer_team_id)
  const recipient=teams.find((team)=>team.id===trade.recipient_team_id)
  const offered=trade.items?.filter((item)=>item.from_team_id===proposer?.id)||[]
  const requested=trade.items?.filter((item)=>item.from_team_id===recipient?.id)||[]
  const incoming=trade.recipient_team_id===myTeam?.id&&trade.status==='pending'
  const outgoing=trade.proposer_team_id===myTeam?.id&&trade.status==='pending'
  return <article className={styles.tradeCard}><div className={styles.tradeCardTop}><span className={`${styles.tradeStatus} ${styles[`trade_${trade.status}`]||''}`}>{trade.status}</span><small><LocalTime mode="date" value={trade.created_at}/></small></div><div className={styles.tradeSummary}><div><b>{proposer?.name}</b>{offered.map((item)=><span key={item.id}>{item.player?.position} · {item.player?.name}</span>)}</div><em>⇄</em><div><b>{recipient?.name}</b>{requested.map((item)=><span key={item.id}>{item.player?.position} · {item.player?.name}</span>)}</div></div>{trade.note&&<p className={styles.tradeMessage}>“{trade.note}”</p>}<div className={styles.tradeActions}>{incoming&&<><TradeAction action={respondTrade} leagueId={leagueId} tradeId={trade.id} name="response" value="accepted" label="Accept"/><TradeAction action={respondTrade} leagueId={leagueId} tradeId={trade.id} name="response" value="rejected" label="Reject"/></>}{outgoing&&<TradeAction action={cancelTrade} leagueId={leagueId} tradeId={trade.id} label="Cancel offer"/>}{commissioner&&trade.status==='accepted'&&<>{(trade.proposer_team_id===myTeam?.id||trade.recipient_team_id===myTeam?.id)&&<em className={styles.tradeSelfReview}>your own deal</em>}<TradeAction action={reviewTrade} leagueId={leagueId} tradeId={trade.id} name="decision" value="approve" label="Approve trade"/><TradeAction action={reviewTrade} leagueId={leagueId} tradeId={trade.id} name="decision" value="veto" label="Veto"/></>}</div></article>
}

function TradeAction({action,leagueId,tradeId,name,value,label}) {
  return <form action={action}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="tradeId" value={tradeId}/>{name&&<input type="hidden" name={name} value={value}/>}<SubmitButton pendingLabel="…">{label}</SubmitButton></form>
}
