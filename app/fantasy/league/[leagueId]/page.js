import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../lib/supabase/server'
import NflTeamMark from '../../../../components/fantasy/NflTeamMark'
import { colorForPosition } from '../../../../components/fantasy/positionColor'
import styles from '../../fantasy.module.css'
import DraftBanner from '../../../../components/fantasy/DraftBanner'
import DraftRoomLive from '../../../../components/fantasy/DraftRoomLive'
import StartDraftButton from '../../../../components/fantasy/StartDraftButton'
import SubmitButton from '../../../../components/fantasy/SubmitButton'
import { addToQueue, assignDraftPick, draftPlayer, prepareDraft, removeFromQueue, runAutoPick, setDraftState, startDraft, syncPlayerCatalog, tickAutoPick } from './actions'

const POSITIONS = ['ALL','QB','RB','WR','TE','FLEX','K','DEF']

function dashScore(player) {
  const values = Object.values(player.source_payload?.scores || {}).map(Number).filter(Number.isFinite)
  return values.length ? Math.round(Math.max(...values)) : 50
}

export default async function LeagueRoom({ params, searchParams }) {
  const [{leagueId}, query] = await Promise.all([params, searchParams])
  const supabase = await createSupabaseServerClient()
  if (!supabase) redirect('/fantasy')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/fantasy')

  const { data: league } = await supabase.from('fantasy_leagues').select('*').eq('id', leagueId).single()
  if (!league) notFound()
  const [{ data: membership }, { data: teamRows }, { data: playerRows }, { data: draft }] = await Promise.all([
    supabase.from('fantasy_league_memberships').select('role').eq('league_id', leagueId).eq('user_id', user.id).single(),
    supabase.from('fantasy_teams').select('*').eq('league_id', leagueId).order('created_at'),
    supabase.from('nfl_players').select('id,name,position,team,injury_status,source_payload').eq('active', true),
    supabase.from('fantasy_drafts').select('*').eq('league_id', leagueId).maybeSingle(),
  ])
  if (!membership) notFound()
  const teams = teamRows || []
  const players = playerRows || []
  const myTeam = teams.find((team) => team.owner_id === user.id)

  const [{ data: pickRows }, { data: rosterRows }, { data: queueRows }] = await Promise.all([
    draft ? supabase.from('fantasy_draft_picks').select('*').eq('draft_id', draft.id).order('overall_pick') : Promise.resolve({ data: [] }),
    supabase.from('fantasy_roster_entries').select('*,player:nfl_players(id,name,position,team)').eq('league_id', leagueId).is('released_at', null),
    draft && myTeam ? supabase.from('fantasy_draft_queue').select('*,player:nfl_players(id,name,position,team)').eq('draft_id', draft.id).eq('team_id', myTeam.id).order('rank') : Promise.resolve({ data: [] }),
  ])
  const picks = pickRows || []
  const roster = rosterRows || []
  const queue = (queueRows || []).filter((item) => item.player)
  const draftedIds = new Set(picks.filter((pick) => pick.player_id).map((pick) => pick.player_id))
  const selectedPosition = POSITIONS.includes(query?.position) ? query.position : 'ALL'
  const search = String(query?.q || '').trim().toLowerCase().slice(0,40)
  const rankedPlayers = players.map((player) => ({ ...player, dash_score: dashScore(player) }))
    .sort((a,b) => b.dash_score - a.dash_score || a.name.localeCompare(b.name))
  const undrafted = rankedPlayers.filter((player) => !draftedIds.has(player.id))
  const available = undrafted
    .filter((player) => selectedPosition === 'ALL' || (selectedPosition === 'FLEX' ? ['RB','WR','TE'].includes(player.position) : player.position === selectedPosition))
    .filter((player) => !search || player.name.toLowerCase().includes(search) || player.team?.toLowerCase().includes(search))
  const currentPick = picks.find((pick) => pick.overall_pick === draft?.current_overall_pick)
  const currentTeam = teams.find((team) => team.id === currentPick?.team_id)
  const isMyPick = draft?.status === 'live' && currentTeam?.owner_id === user.id
  const canPick = draft?.status === 'live' && (currentTeam?.owner_id === user.id || membership.role === 'commissioner')
  const myRoster = roster.filter((entry) => entry.team_id === myTeam?.id)

  return (
    <main className={styles.roomApp}>
      <header className={styles.roomHeader}><Link href="/fantasy">← FRANCHISE</Link><div><small>{String(league.status||'').replace('_',' ').toUpperCase()}</small><strong>{league.name}</strong></div><span>{teams.length}/{league.team_count} teams</span></header>
      <nav aria-label="League sections" className={styles.roomNav}><a aria-current="page" className={styles.roomActive}>Draft</a><Link href={`/fantasy/league/${leagueId}/team`}>Team</Link><Link href={`/fantasy/league/${leagueId}/matchup`}>Matchup</Link><Link href={`/fantasy/league/${leagueId}/league`}>League</Link><Link href={`/fantasy/league/${leagueId}/wire`}>Wire</Link><Link href={`/fantasy/league/${leagueId}/trades`}>Trades</Link><Link href={`/fantasy/league/${leagueId}/feed`}>Feed</Link><Link href={`/fantasy/league/${leagueId}/coach`}>Coach</Link>{membership.role==='commissioner'&&<Link href={`/fantasy/league/${leagueId}/settings`}>Settings</Link>}</nav>
      <div className={styles.roomBody}>
        <DraftBanner error={query?.error} message={query?.message}/>
        <section className={styles.draftHero}>
          <div><p className={styles.panelLabel}>LIVE LEAGUE ROOM</p><h1>{draft?.status === 'live' ? `Pick ${draft.current_overall_pick} is on the clock` : 'Build the draft board.'}</h1><p>{draft?.status === 'live' ? `${currentTeam?.name || 'Next team'} · ${draft.timer_seconds} second timer` : `${String(league.scoring||'ppr').replace('_','-').toUpperCase()} · ${league.draft_order_method} order · ${league.draft_timer_seconds}s picks`}</p></div>
          <div className={styles.roomStats}><span><small>PLAYERS</small><b>{players.length}</b></span><span><small>DRAFTED</small><b>{draftedIds.size}</b></span><span><small>ROSTER</small><b>{myRoster.length}</b></span></div>
        </section>

        {draft && draft.status !== 'complete' && (
          <DraftRoomLive currentPick={draft.current_overall_pick} deadline={draft.pick_deadline} display={false} leagueId={leagueId} status={draft.status} tickAction={tickAutoPick}/>
        )}

        {draft && ['live','paused'].includes(draft.status) && (
          <section className={styles.clockBar} data-state={draft.status} data-yours={isMyPick ? 'true' : undefined}>
            <span className={styles.clockPick}>PICK {draft.current_overall_pick}</span>
            <div className={styles.clockWho}>
              <b>{isMyPick ? 'Your pick' : currentTeam?.name || 'Next team'}</b>
              <small>{draft.status === 'paused' ? 'Draft paused by the commissioner' : isMyPick ? 'Take a name off the board' : `Round ${currentPick?.round || 1} · ${draft.timer_seconds}s timer`}</small>
            </div>
            <span className={styles.clockTime}><DraftRoomLive currentPick={draft.current_overall_pick} deadline={draft.pick_deadline} leagueId={leagueId} status={draft.status} tickAction={tickAutoPick}/></span>
          </section>
        )}

        {membership.role === 'commissioner' && (
          <section className={styles.commishBar}>
            <div><p className={styles.panelLabel}>COMMISSIONER CONTROLS</p><strong>Catalog → order → live draft</strong></div>
            <form action={syncPlayerCatalog}><input type="hidden" name="leagueId" value={leagueId}/><button>Refresh NFL players</button></form>
            <form action={prepareDraft} className={styles.orderForm}><input type="hidden" name="leagueId" value={leagueId}/>{league.draft_order_method === 'manual' && teams.map((team,index)=><label key={team.id}>{team.name}<select name={`position_${team.id}`} defaultValue={index+1}>{teams.map((_,i)=><option key={i+1}>{i+1}</option>)}</select></label>)}<SubmitButton disabled={!players.length} pendingLabel="Preparing…">Prepare snake draft</SubmitButton></form>
            <form action={startDraft}><input type="hidden" name="leagueId" value={leagueId}/><StartDraftButton disabled={!draft || draft.status !== 'setup'} expected={league.team_count} joined={teams.length}/></form>
            {draft?.status==='live'&&<form action={runAutoPick}><input type="hidden" name="leagueId" value={leagueId}/><SubmitButton pendingLabel="Forcing…">Force expired pick</SubmitButton></form>}
            {['live','paused'].includes(draft?.status) && <form action={setDraftState}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="state" value={draft.status === 'live' ? 'paused' : 'live'}/><SubmitButton pendingLabel="Updating…">{draft.status === 'live' ? 'Pause draft' : 'Resume draft'}</SubmitButton></form>}
          </section>
        )}

        {membership.role === 'commissioner' && draft && draft.status !== 'paused' && picks.some((pick)=>!pick.player_id) && <form action={assignDraftPick} className={styles.assignmentBar}><div><p className={styles.panelLabel}>MANUAL ASSIGNMENT</p><strong>Place a player into any open pick</strong><small>Resume the draft first — assigning while paused leaves the clock behind.</small></div><select name="overallPick">{picks.filter((pick)=>!pick.player_id).map((pick)=><option value={pick.overall_pick} key={pick.id}>#{pick.overall_pick} · {teams.find((team)=>team.id===pick.team_id)?.name}</option>)}</select><select name="playerId">{undrafted.slice(0,600).map((player)=><option value={player.id} key={player.id}>{player.position} · {player.name}</option>)}</select><input type="hidden" name="leagueId" value={leagueId}/><SubmitButton pendingLabel="Assigning…">Assign pick</SubmitButton></form>}

        {membership.role !== 'commissioner' && (!draft || draft.status === 'setup') && <section className={styles.waitingRoom}><span>◷</span><div><p className={styles.panelLabel}>DRAFT LOBBY</p><strong>The commissioner is setting the draft order.</strong><small>You can study the DASH board now. Draft controls unlock when the room goes live.</small></div></section>}

        <div className={styles.draftLayout}>
          <section className={styles.playerBoard} data-live={draft?.status==='live'?'true':undefined} data-yours={isMyPick?'true':undefined}>
            <div className={styles.boardHead}><div><p className={styles.panelLabel}>AVAILABLE PLAYERS</p><h2>DASH NFL board</h2></div><form className={styles.playerSearch}><input aria-label="Search players" name="q" defaultValue={query?.q || ''} placeholder="Search player or team"/><input type="hidden" name="position" value={selectedPosition}/><button>Search</button></form><span>{available.length} available</span></div>
            <div className={styles.positionFilters}>{POSITIONS.map((position)=><Link key={position} className={selectedPosition===position?styles.positionActive:''} aria-current={selectedPosition===position?'true':undefined} href={`/fantasy/league/${leagueId}?position=${position}${query?.q?`&q=${encodeURIComponent(String(query.q))}`:''}`}>{position}</Link>)}</div>
            <div className={styles.draftColumns}><span>RK</span><span>POS</span><span>PLAYER</span><span>DASH</span><span>STATUS</span></div>
            {!players.length ? <p className={styles.emptyRoom}>Commissioner: sync the NFL player catalog to begin.</p> : available.slice(0,80).map((player) => (
              <div className={styles.draftPlayer} key={player.id} style={{ '--pos': colorForPosition(player.position) }}><span className={styles.rankNumber}>{rankedPlayers.findIndex((ranked)=>ranked.id===player.id)+1}</span><span className={styles.positionTag} style={{ color: colorForPosition(player.position), borderColor: `${colorForPosition(player.position)}55` }}>{player.position}</span><div className={styles.playerIdentity}><NflTeamMark team={player.team}/><span><b>{player.name}</b><small>{player.team || 'FA'}{player.injury_status ? ` · ${player.injury_status}` : ''}</small></span></div><strong className={styles.playerDash} style={{ color: colorForPosition(player.position) }}>{player.dash_score}<i className={styles.dashMeter} style={{ '--w': `${Math.max(4,Math.min(100,player.dash_score))}%`, '--c': colorForPosition(player.position) }}/></strong>{canPick?<><form action={draftPlayer}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="playerId" value={player.id}/><input type="hidden" name="overallPick" value={draft?.current_overall_pick||''}/><input type="hidden" name="viewPosition" value={selectedPosition}/><input type="hidden" name="viewQuery" value={String(query?.q||'')}/><SubmitButton pendingLabel="Drafting…">Draft</SubmitButton></form></>:draft&&myTeam?<form action={addToQueue}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="playerId" value={player.id}/><input type="hidden" name="viewPosition" value={selectedPosition}/><input type="hidden" name="viewQuery" value={String(query?.q||'')}/><SubmitButton className={styles.queueButton} pendingLabel="Adding…">+ Queue</SubmitButton></form>:<span className={styles.lockedPick}>{draft?.status === 'paused' ? 'PAUSED' : draft?.status === 'live' ? 'WAIT' : 'SCOUT'}</span>}</div>
            ))}
          </section>
          <aside className={styles.draftSide}>
            <section><div className={styles.boardHead}><div><p className={styles.panelLabel}>DRAFT ORDER</p><h2>{draft?.status === 'paused' ? 'Draft paused' : 'On the clock'}</h2></div><span>{picks.filter((pick)=>pick.player_id).length}/{picks.length}</span></div>{picks.slice(Math.max(0,(draft?.current_overall_pick||1)-3),Math.max(8,(draft?.current_overall_pick||1)+5)).map((pick)=><div className={pick.overall_pick===draft?.current_overall_pick?styles.activePick:styles.pickRow} key={pick.id}><span>{pick.overall_pick}</span><b>{teams.find((team)=>team.id===pick.team_id)?.name}</b><small>{rankedPlayers.find((player)=>player.id===pick.player_id)?.name || '—'}</small></div>)}{!picks.length&&<p className={styles.emptyRoom}>Draft order not prepared.</p>}</section>
            {draft && <section><div className={styles.boardHead}><div><p className={styles.panelLabel}>MY QUEUE</p><h2>Auto-pick priority</h2></div><span>{queue.length}</span></div>{queue.map((item)=><div className={styles.queueRow} key={item.id}><span>{item.rank}</span><div><b>{item.player.name}</b><small>{item.player.position} · {item.player.team}</small></div><form action={removeFromQueue}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="playerId" value={item.player_id}/><input type="hidden" name="viewPosition" value={selectedPosition}/><input type="hidden" name="viewQuery" value={String(query?.q||'')}/><SubmitButton aria-label={`Remove ${item.player.name} from queue`} pendingLabel="…">×</SubmitButton></form></div>)}{!queue.length&&<p className={styles.emptyRoom}>Queue players from the board. If your timer expires, the first available name is selected.</p>}</section>}
            <section><div className={styles.boardHead}><div><p className={styles.panelLabel}>MY TEAM</p><h2>{myTeam?.name}</h2></div></div>{myRoster.filter((entry)=>entry.player).map((entry)=><div className={styles.rosterRow} key={entry.id}><span>{entry.player.position}</span><b>{entry.player.name}</b><small>{entry.player.team}</small></div>)}{!myRoster.length&&<p className={styles.emptyRoom}>Your drafted players will appear here.</p>}</section>
          </aside>
        </div>
      </div>
    </main>
  )
}
