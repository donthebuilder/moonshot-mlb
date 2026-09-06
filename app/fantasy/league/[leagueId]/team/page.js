import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import PlayerFace from '../../../../../components/fantasy/PlayerFace'
import PlayerMeta from '../../../../../components/fantasy/PlayerMeta'
import InjuryTag from '../../../../../components/fantasy/InjuryTag'
import { gameForPlayer, teamScheduleFor } from '../../../../../lib/fantasy/schedule'
import { colorForPosition } from '../../../../../components/fantasy/positionColor'
import styles from '../../../fantasy.module.css'
import SubmitButton from '../../../../../components/fantasy/SubmitButton'
import TeamMark from '../../../../../components/fantasy/TeamMark'
import { TEAM_COLORS, teamColor, teamMonogram } from '../../../../../components/fantasy/teamIdentity'
import { byeTeamsFor, isOnBye } from '../../../../../lib/fantasy/bye'
import { projectedFantasyPoints } from '../../../../../lib/fantasy/scoring'
import { FANTASY_LAST_WEEK, FANTASY_SEASON, resolveFantasyWeek } from '../../../../../lib/fantasy/week'
import { moveLineupPlayer, saveLineupSlot, saveTeamIdentity } from './actions'
import LeagueNav from '../../../../../components/fantasy/LeagueNav'

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
  // #83: this page never read the membership row, which is why its copy of the
  // league nav showed Settings to everyone -- it had nothing to gate on. One
  // more single-row select, matching every other league page.
  const [{ data: league }, { data: team }, { data: membership }] = await Promise.all([
    supabase.from('fantasy_leagues').select('*').eq('id',leagueId).single(),
    supabase.from('fantasy_teams').select('*').eq('league_id',leagueId).eq('owner_id',user.id).single(),
    supabase.from('fantasy_league_memberships').select('role').eq('league_id',leagueId).eq('user_id',user.id).single(),
  ])
  if (!league) notFound()
  if (!team) return <main className={styles.roomApp}><div className={styles.roomBody}><section className={styles.waitingRoom}><span>◷</span><div><p className={styles.panelLabel}>NO TEAM YET</p><strong>You don&apos;t have a team in this league.</strong><small>Ask the commissioner to add you, then your lineup board opens here.</small></div></section><p><Link href={`/fantasy/league/${leagueId}`}>← Back to the league</Link></p></div></main>
  const [{ data: rosterRows }, { data: lineupRows }, { data: weekGames }] = await Promise.all([
    supabase.from('fantasy_roster_entries').select('id,player:nfl_players(id,name,position,team,injury_status,source_payload,source_player_id)').eq('team_id',team.id).is('released_at',null),
    supabase.from('fantasy_lineup_slots').select('*').eq('team_id',team.id).eq('season',SEASON).eq('week',WEEK),
    supabase.from('nfl_week_games').select('home_team,away_team,season_type,kickoff,status').eq('season',SEASON).eq('week',WEEK),
  ])
  // Null when the slate is too thin to be sure -- see lib/fantasy/bye.js. Every
  // use below checks, because "everybody is on bye" is the failure mode.
  const byeTeams = byeTeamsFor(weekGames)
  // Same rows, read the other way round: club -> its game. This is what puts an
  // opponent and a kickoff on a lineup row, which is the one thing you need to
  // know before deciding whether to start a man.
  const schedule = teamScheduleFor(weekGames)
  const roster = rosterRows || []
  const lineup = lineupRows || []
  const players = roster.map((entry)=>entry.player).filter(Boolean)
  // A PLAYER ON BYE PROJECTS NOTHING (2026-08-31). He used to carry a full
  // projection into this column and into the PROJECTED total in the hero,
  // which is how a lineup can look complete and score twelve points short.
  const projectionFor = (player) =>
    !player ? null : isOnBye(player, byeTeams) ? 0 : projectedFantasyPoints(player, league.scoring)
  const slotRows = slotsFor(league)
  const starterCount = slotRows.filter(([slot])=>!['BENCH','IR'].includes(slot)).length
  const benchCount = slotRows.filter(([slot])=>slot==='BENCH').length
  // NOBODY CREATES A LINEUP ROW WHEN A MAN IS DRAFTED. Straight after a draft
  // every player you own is here and nowhere else, so this group is not an edge
  // case -- it is the state the board opens in on the most important day of the
  // year. It used to be invisible, because the old <select>s listed these men
  // without the board ever admitting they existed.
  const slottedIds = new Set(lineup.map((row)=>row.player_id))
  const unassigned = players.filter((player)=>!slottedIds.has(player.id))
    .sort((a,b)=>(projectionFor(b)||0)-(projectionFor(a)||0)||a.name.localeCompare(b.name))
  // The board was one undifferentiated list of 15+ rows — you could not see
  // where the starters ended. Group it the way a lineup actually reads.
  const GROUPS = [
    ['STARTERS','Counts toward this week',(slot)=>!['BENCH','IR'].includes(slot)],
    ['BENCH','Available, not scoring',(slot)=>slot==='BENCH'],
    ['IR','Injured reserve',(slot)=>slot==='IR'],
  ]
  const startersProjected = slotRows
    .filter(([slot])=>!['BENCH','IR'].includes(slot))
    .reduce((sum,[slot,index])=>{
      const row = lineup.find((entry)=>entry.slot===slot&&entry.slot_index===index)
      const player = players.find((entry)=>entry.id===row?.player_id)
      return sum + (projectionFor(player) || 0)
    },0)
  // ── MOVE MODE (finding #3) ────────────────────────────────────────────────
  // Which man is currently picked up, if any. It lives in the URL rather than
  // in client state so the whole interaction is <a> and <form> and survives
  // with JavaScript off — see moveLineupPlayer's note in ./actions.
  const moveKey = String(query?.move || '')
  // Two shapes: "RB-2" is a man in a slot, "player-<uuid>" is one of the
  // unassigned. A uuid contains dashes, so it is split off by prefix, not by
  // splitting on '-'.
  const fromUnassigned = moveKey.startsWith('player-')
  const movingSlot = fromUnassigned ? '' : moveKey.split('-')[0]
  const movingIndex = fromUnassigned ? 0 : Number(moveKey.split('-')[1] || 0)
  const movingRow = fromUnassigned ? null : lineup.find((row)=>row.slot===movingSlot&&row.slot_index===movingIndex)
  const movingPlayer = fromUnassigned
    ? unassigned.find((player)=>player.id===moveKey.slice(7))
    : players.find((player)=>player.id===movingRow?.player_id)
  const moveActive = Boolean(movingPlayer) && !movingRow?.locked_at
  const teamHref = (params) => `/fantasy/league/${leagueId}/team?week=${WEEK}${params?`&${params}`:''}`

  return <main className={styles.roomApp}>
    <header className={styles.roomHeader}><Link href="/fantasy">← FRANCHISE</Link><div><small>WEEK {WEEK}</small><strong>{team.name}</strong></div><span className={styles.weekSwitch}>{WEEK>1&&<Link href={`/fantasy/league/${leagueId}/team?week=${WEEK-1}`}>‹</Link>}<b>{roster.length} rostered</b>{WEEK<FANTASY_LAST_WEEK&&<Link href={`/fantasy/league/${leagueId}/team?week=${WEEK+1}`}>›</Link>}</span></header>
    <LeagueNav leagueId={leagueId} active="team" role={membership?.role} className={styles.roomNav} activeClassName={styles.roomActive} />
    <div className={styles.roomBody}>
      {(query?.error||query?.message)&&<p className={query.error?styles.error:styles.message}>{query.error||query.message}</p>}
      <section className={styles.teamHero}><div><p className={styles.panelLabel}>WEEK {WEEK} LINEUP</p><h1 style={{display:'flex',alignItems:'center',gap:12}}><TeamMark size={38} team={team}/>{team.name}</h1><p>Set each player before their individual game begins. Locked players cannot be moved.</p></div><div className={styles.roomStats}><span><small>STARTERS</small><b>{lineup.filter((row)=>!['BENCH','IR'].includes(row.slot)).length}/{starterCount}</b></span><span><small>BENCH</small><b>{lineup.filter((row)=>row.slot==='BENCH').length}/6</b></span><span><small>IR</small><b>{lineup.filter((row)=>row.slot==='IR').length}/{league.ir_slots}</b></span><span><small>PROJECTED</small><b>{startersProjected.toFixed(1)}</b></span></div></section>
      {!players.length&&<section className={styles.waitingRoom}><span>◇</span><div><p className={styles.panelLabel}>ROSTER EMPTY</p><strong>Your players arrive here as they are drafted.</strong><small>Return to the draft room once the commissioner starts the board.</small></div></section>}
      <div className={styles.teamLayout}>
        <section className={styles.lineupBoard}><div className={styles.boardHead}><div><p className={styles.panelLabel}>ACTIVE ROSTER</p><h2>Set your lineup</h2></div><span>Individual game locks</span></div>
          {moveActive&&<p className={styles.moveBanner}><b>Moving {movingPlayer.name}</b><small>Pick any highlighted slot below. Slots that cannot take him stay dim.</small><Link href={teamHref()}>Cancel</Link></p>}
          <div className={styles.slotColumns}><span>SLOT</span><span>PLAYER</span><span>PROJ</span><span>LINEUP</span></div>
          {GROUPS.map(([title,note,test])=>{const rows=slotRows.filter(([slot])=>test(slot));if(!rows.length)return null;const filled=rows.filter(([slot,index])=>lineup.some((row)=>row.slot===slot&&row.slot_index===index&&row.player_id)).length;return <div className={styles.slotGroup} key={title}>
            <div className={styles.slotGroupHead}><span>{title}</span><small>{note}</small><b>{filled}/{rows.length}</b></div>
            {rows.map(([slot,index])=>{const assigned=lineup.find((row)=>row.slot===slot&&row.slot_index===index);const assignedPlayer=players.find((player)=>player.id===assigned?.player_id);const locked=Boolean(assigned?.locked_at);const starter=!['BENCH','IR'].includes(slot);const projection=projectionFor(assignedPlayer);
            // The row is one of five things, and only one of them is a control:
            // locked · the man being moved · a slot that will take him · a slot
            // that will not (during a move) · an ordinary row with a Move link.
            // #84 is solved by construction here — a row with nothing to do
            // renders no button at all, rather than a disabled one.
            // `fromUnassigned` in the swap test is not a shortcut. A man being
            // carried out of UNASSIGNED has no source slot to give back, so
            // there is nothing for the displaced player to be eligible FOR --
            // and `eligible(displaced, '')` is false for every position, which
            // silently made every occupied slot un-droppable. The action already
            // handles this case by landing the displaced man in the lowest free
            // bench slot; this is the UI catching up with it.
            const isSource=moveActive&&slot===movingSlot&&index===movingIndex;
            const canReceive=moveActive&&!isSource&&!locked&&eligible(movingPlayer,slot,league)&&(!assignedPlayer||fromUnassigned||eligible(assignedPlayer,movingSlot,league));
            const rowKey=`${slot}-${index}`;
            return <div className={`${styles.slotRow} ${locked?styles.slotLocked:''}`} data-empty={!assignedPlayer?'true':undefined} data-locked={locked?'true':undefined} data-moving={isSource?'true':undefined} data-target={canReceive?'true':undefined} data-starter={starter?'true':undefined} key={rowKey}><span className={styles.slotBadge} style={{ color: colorForPosition(assignedPlayer?.position || slot), borderColor: `${colorForPosition(assignedPlayer?.position || slot)}55` }}>{slot}{index>1?index:''}</span><div className={styles.lineupIdentity}>{assignedPlayer&&<PlayerFace player={assignedPlayer} size={34}/>}<span><b>{assignedPlayer?.name||'Open slot'}{assignedPlayer&&<InjuryTag status={assignedPlayer.injury_status}/>}</b>{assignedPlayer?<PlayerMeta player={assignedPlayer} game={gameForPlayer(schedule,assignedPlayer)} bye={isOnBye(assignedPlayer,byeTeams)}/>:<small>{moveActive?(canReceive?'Open — takes him':'Not eligible'):'Empty'}</small>}</span></div><span className={styles.slotProjection}>{projection===null?'—':isOnBye(assignedPlayer,byeTeams)?'—':projection.toFixed(1)}<i>{isOnBye(assignedPlayer,byeTeams)?'BYE':'PROJ'}</i></span><div className={styles.slotAction}>{locked?<span className={styles.slotLockedTag}>🔒 Locked</span>:isSource?<><span className={styles.slotMovingTag}>Moving</span><form action={saveLineupSlot}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="season" value={SEASON}/><input type="hidden" name="week" value={WEEK}/><input type="hidden" name="slot" value={slot}/><input type="hidden" name="slotIndex" value={index}/><SubmitButton className={styles.slotCancel} pendingLabel="…" title="Take him out of the lineup entirely">Remove</SubmitButton></form><Link className={styles.slotCancel} href={teamHref()}>Cancel</Link></>:canReceive?<form action={moveLineupPlayer}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="season" value={SEASON}/><input type="hidden" name="week" value={WEEK}/><input type="hidden" name="fromSlot" value={movingSlot}/><input type="hidden" name="fromIndex" value={movingIndex}/><input type="hidden" name="fromPlayerId" value={movingPlayer.id}/><input type="hidden" name="benchCount" value={benchCount}/><input type="hidden" name="toSlot" value={slot}/><input type="hidden" name="toIndex" value={index}/><SubmitButton className={styles.slotTargetButton} pendingLabel="Moving…">{assignedPlayer?'Swap here':'Move here'}</SubmitButton></form>:moveActive?null:assignedPlayer?<Link className={styles.slotMove} href={teamHref(`move=${rowKey}`)}>Move</Link>:null}</div></div>})}
          </div>})}
          {/* The men with no slot at all. See `unassigned` above for why this
              is the normal state of a board on draft night rather than a
              corner case. */}
          {unassigned.length>0&&<div className={styles.slotGroup}>
            <div className={styles.slotGroupHead}><span>UNASSIGNED</span><small>On your roster, not in this week&apos;s lineup</small><b>{unassigned.length}</b></div>
            {unassigned.map((player)=>{const carrying=moveActive&&fromUnassigned&&movingPlayer.id===player.id;const projection=projectionFor(player);
            return <div className={styles.slotRow} data-moving={carrying?'true':undefined} key={player.id}><span className={styles.slotBadge} style={{ color: colorForPosition(player.position), borderColor: `${colorForPosition(player.position)}55` }}>{player.position}</span><div className={styles.lineupIdentity}><PlayerFace player={player} size={34}/><span><b>{player.name}<InjuryTag status={player.injury_status}/></b><PlayerMeta player={player} game={gameForPlayer(schedule,player)} bye={isOnBye(player,byeTeams)}/></span></div><span className={styles.slotProjection}>{projection===null?'—':isOnBye(player,byeTeams)?'—':projection.toFixed(1)}<i>{isOnBye(player,byeTeams)?'BYE':'PROJ'}</i></span><div className={styles.slotAction}>{carrying?<><span className={styles.slotMovingTag}>Moving</span><Link className={styles.slotCancel} href={teamHref()}>Cancel</Link></>:moveActive?null:<Link className={styles.slotMove} href={teamHref(`move=player-${player.id}`)}>Move</Link>}</div></div>})}
          </div>}
        </section>
        <aside className={styles.teamSide}><section><div className={styles.boardHead}><div><p className={styles.panelLabel}>ROSTER BUILD</p><h2>Position count</h2></div></div>{['QB','RB','WR','TE','K','DEF'].map((position)=><div className={styles.positionCount} key={position}><span>{position}</span><b>{players.filter((player)=>player.position===position).length}</b></div>)}</section><section><div className={styles.boardHead}><div><p className={styles.panelLabel}>DASH COACH</p><h2>Lineup check</h2></div></div><p className={styles.emptyRoom}>{players.length?`${Math.max(0,starterCount-lineup.filter((row)=>!['BENCH','IR'].includes(row.slot)).length)} starting slots still need attention.`:'Draft players first, then DASH Coach will flag lineup gaps and risky starts.'}</p></section>
        {/* Team look — owner-picked color + monogram (C4 de-bland, 2026-08-29).
            Plain radios + a 3-char input, no client JS: the server action
            validates and the mark re-renders everywhere on redirect. */}
        <section><div className={styles.boardHead}><div><p className={styles.panelLabel}>TEAM LOOK</p><h2>Your colors</h2></div><TeamMark size={30} team={team}/></div>
          <form action={saveTeamIdentity} className={styles.identityForm}>
            <div className={styles.identitySwatches} role="radiogroup" aria-label="Team color">
              {TEAM_COLORS.map(([hex,label])=><label key={hex} title={label}><input defaultChecked={teamColor(team)===hex} name="color" type="radio" value={hex} required/><span style={{background:hex}}/></label>)}
            </div>
            <label className={styles.identityMonogram}>Monogram · up to 3 letters
              <input defaultValue={team.monogram||''} maxLength="3" name="monogram" pattern="[0-9A-Za-z]{0,3}" placeholder={teamMonogram(team)} autoComplete="off"/>
            </label>
            <input type="hidden" name="leagueId" value={leagueId}/>
            <SubmitButton pendingLabel="Saving…">Save team look</SubmitButton>
            <small className={styles.identityHint}>Shows on standings, matchups, the wire, and the draft board.</small>
          </form>
        </section></aside>
      </div>
    </div>
  </main>
}
