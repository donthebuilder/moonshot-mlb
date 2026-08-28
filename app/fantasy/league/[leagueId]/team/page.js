import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import NflTeamMark from '../../../../../components/fantasy/NflTeamMark'
import { colorForPosition } from '../../../../../components/fantasy/positionColor'
import styles from '../../../fantasy.module.css'
import SubmitButton from '../../../../../components/fantasy/SubmitButton'
import { FANTASY_LAST_WEEK, FANTASY_SEASON, resolveFantasyWeek } from '../../../../../lib/fantasy/week'
import { saveLineupSlot } from './actions'

const SEASON = FANTASY_SEASON

function slotsFor(league) {
  const slots = [['QB',1],['RB',1],['RB',2],['WR',1],['WR',2],['TE',1],['FLEX',1]]
  if (league.has_kicker) slots.push(['K',1])
  if (league.has_defense) slots.push(['DEF',1])
  const bench = Math.max(1, 15 - slots.length)
  for (let i=1;i<=bench;i+=1) slots.push(['BENCH',i])
  for (let i=1;i<=league.ir_slots;i+=1) slots.push(['IR',i])
  return slots
}

function eligible(player, slot, league) {
  if (slot === 'BENCH') return true
  if (slot === 'FLEX') return ['RB','WR','TE'].includes(player.position)
  if (slot === 'IR') return Boolean(player.injury_status)
  if (slot === 'K' && !league.has_kicker) return false
  if (slot === 'DEF' && !league.has_defense) return false
  return player.position === slot
}

export default async function TeamPage({ params, searchParams }) {
  const [{leagueId},query] = await Promise.all([params,searchParams])
  const supabase = await createSupabaseServerClient()
  if (!supabase) redirect('/fantasy')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/fantasy')
  // Was a hardcoded WEEK = 1: from week 2 on, lineups were written for week 1
  // while the matchup page scored the real week, so every team scored 0.00.
  const WEEK = await resolveFantasyWeek(supabase, query?.week)
  const [{ data: league }, { data: team }] = await Promise.all([
    supabase.from('fantasy_leagues').select('*').eq('id',leagueId).single(),
    supabase.from('fantasy_teams').select('*').eq('league_id',leagueId).eq('owner_id',user.id).single(),
  ])
  if (!league) notFound()
  if (!team) return <main className={styles.roomApp}><div className={styles.roomBody}><section className={styles.waitingRoom}><span>◷</span><div><p className={styles.panelLabel}>NO TEAM YET</p><strong>You don&apos;t have a team in this league.</strong><small>Ask the commissioner to add you, then your lineup board opens here.</small></div></section><p><Link href={`/fantasy/league/${leagueId}`}>← Back to the league</Link></p></div></main>
  const [{ data: rosterRows }, { data: lineupRows }] = await Promise.all([
    supabase.from('fantasy_roster_entries').select('id,player:nfl_players(id,name,position,team,injury_status,source_payload)').eq('team_id',team.id).is('released_at',null),
    supabase.from('fantasy_lineup_slots').select('*').eq('team_id',team.id).eq('season',SEASON).eq('week',WEEK),
  ])
  const roster = rosterRows || []
  const lineup = lineupRows || []
  const players = roster.map((entry)=>entry.player).filter(Boolean)
  // Only STARTING slots block a player. Counting bench/IR rows here meant a
  // benched player could never be promoted without emptying his slot first.
  const usedIds = new Set(lineup.filter((row)=>!['BENCH','IR'].includes(row.slot)).map((row)=>row.player_id))
  const slotOf = new Map(lineup.map((row)=>[row.player_id,`${row.slot}${row.slot_index>1?row.slot_index:''}`]))
  const slotRows = slotsFor(league)
  const starterCount = slotRows.filter(([slot])=>!['BENCH','IR'].includes(slot)).length

  return <main className={styles.roomApp}>
    <header className={styles.roomHeader}><Link href="/fantasy">← FRANCHISE</Link><div><small>WEEK {WEEK}</small><strong>{team.name}</strong></div><span className={styles.weekSwitch}>{WEEK>1&&<Link href={`/fantasy/league/${leagueId}/team?week=${WEEK-1}`}>‹</Link>}<b>{roster.length} rostered</b>{WEEK<FANTASY_LAST_WEEK&&<Link href={`/fantasy/league/${leagueId}/team?week=${WEEK+1}`}>›</Link>}</span></header>
    <nav className={styles.roomNav}><Link href={`/fantasy/league/${leagueId}`}>Draft</Link><a className={styles.roomActive}>Team</a><Link href={`/fantasy/league/${leagueId}/matchup`}>Matchup</Link><Link href={`/fantasy/league/${leagueId}/league`}>League</Link><Link href={`/fantasy/league/${leagueId}/wire`}>Wire</Link><Link href={`/fantasy/league/${leagueId}/trades`}>Trades</Link><Link href={`/fantasy/league/${leagueId}/feed`}>Feed</Link><Link href={`/fantasy/league/${leagueId}/coach`}>Coach</Link></nav>
    <div className={styles.roomBody}>
      {(query?.error||query?.message)&&<p className={query.error?styles.error:styles.message}>{query.error||query.message}</p>}
      <section className={styles.teamHero}><div><p className={styles.panelLabel}>WEEK {WEEK} LINEUP</p><h1>{team.name}</h1><p>Set each player before their individual game begins. Locked players cannot be moved.</p></div><div className={styles.roomStats}><span><small>STARTERS</small><b>{lineup.filter((row)=>!['BENCH','IR'].includes(row.slot)).length}/{starterCount}</b></span><span><small>BENCH</small><b>{lineup.filter((row)=>row.slot==='BENCH').length}/6</b></span><span><small>IR</small><b>{lineup.filter((row)=>row.slot==='IR').length}/{league.ir_slots}</b></span></div></section>
      {!players.length&&<section className={styles.waitingRoom}><span>◇</span><div><p className={styles.panelLabel}>ROSTER EMPTY</p><strong>Your players arrive here as they are drafted.</strong><small>Return to the draft room once the commissioner starts the board.</small></div></section>}
      <div className={styles.teamLayout}>
        <section className={styles.lineupBoard}><div className={styles.boardHead}><div><p className={styles.panelLabel}>ACTIVE ROSTER</p><h2>Set your lineup</h2></div><span>Individual game locks</span></div>
          {slotRows.map(([slot,index])=>{const assigned=lineup.find((row)=>row.slot===slot&&row.slot_index===index);const assignedPlayer=players.find((player)=>player.id===assigned?.player_id);return <form action={saveLineupSlot} className={`${styles.slotRow} ${assigned?.locked_at?styles.slotLocked:''}`} key={`${slot}-${index}`}><span className={styles.slotBadge} style={{ color: colorForPosition(assignedPlayer?.position || slot), borderColor: `${colorForPosition(assignedPlayer?.position || slot)}55` }}>{slot}{index>1?index:''}</span><div className={styles.lineupIdentity}>{assignedPlayer&&<NflTeamMark team={assignedPlayer.team}/>}<span><b>{assignedPlayer?.name||'Open slot'}</b><small>{assignedPlayer?`${assignedPlayer.position} · ${assignedPlayer.team}`:'Choose an eligible player'}</small></span></div><select name="playerId" defaultValue={assignedPlayer?.id||''} disabled={Boolean(assigned?.locked_at)}><option value="">— Empty —</option>{players.filter((player)=>eligible(player,slot,league)&&(player.id===assignedPlayer?.id||!usedIds.has(player.id))).map((player)=><option value={player.id} key={player.id}>{player.position} · {player.name} · {player.team}{slotOf.get(player.id)&&slotOf.get(player.id)!==`${slot}${index>1?index:''}`?` (${slotOf.get(player.id)})`:''}</option>)}</select><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="season" value={SEASON}/><input type="hidden" name="week" value={WEEK}/><input type="hidden" name="slot" value={slot}/><input type="hidden" name="slotIndex" value={index}/><SubmitButton disabled={Boolean(assigned?.locked_at)} pendingLabel="Saving…">{assigned?.locked_at?'Locked':'Save'}</SubmitButton></form>})}
        </section>
        <aside className={styles.teamSide}><section><div className={styles.boardHead}><div><p className={styles.panelLabel}>ROSTER BUILD</p><h2>Position count</h2></div></div>{['QB','RB','WR','TE','K','DEF'].map((position)=><div className={styles.positionCount} key={position}><span>{position}</span><b>{players.filter((player)=>player.position===position).length}</b></div>)}</section><section><div className={styles.boardHead}><div><p className={styles.panelLabel}>DASH COACH</p><h2>Lineup check</h2></div></div><p className={styles.emptyRoom}>{players.length?`${Math.max(0,starterCount-lineup.filter((row)=>!['BENCH','IR'].includes(row.slot)).length)} starting slots still need attention.`:'Draft players first, then DASH Coach will flag lineup gaps and risky starts.'}</p></section></aside>
      </div>
    </div>
  </main>
}
