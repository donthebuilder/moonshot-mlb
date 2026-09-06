import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../lib/supabase/server'
import PlayerFace from '../../../../components/fantasy/PlayerFace'
import InjuryTag from '../../../../components/fantasy/InjuryTag'
import { colorForPosition } from '../../../../components/fantasy/positionColor'
import styles from '../../fantasy.module.css'
import TeamMark from '../../../../components/fantasy/TeamMark'
import DraftBanner from '../../../../components/fantasy/DraftBanner'
import DraftRoomLive from '../../../../components/fantasy/DraftRoomLive'
import StartDraftButton from '../../../../components/fantasy/StartDraftButton'
import SubmitButton from '../../../../components/fantasy/SubmitButton'
import { addToQueue, assignDraftPick, draftPlayer, prepareDraft, removeFromQueue, runAutoPick, setDraftState, startDraft, syncPlayerCatalog, tickAutoPick } from './actions'
import LeagueNav from '../../../../components/fantasy/LeagueNav'
import { draftValue, projectionIsPartial, replacementLevels, seasonValue } from '../../../../lib/fantasy/scoring'

const POSITIONS = ['ALL','QB','RB','WR','TE','FLEX','K','DEF']

// #71: this page used to rank by its own inline copy of dashScore -- the MAX
// of TUDDY's per-market scores for the coming week. That is "how likely is he
// to clear a prop on Sunday," which is not the question a season draft asks.
// It put Jared Goff 11th overall and a KICKER 14th in a single-QB PPR league.
// seasonValue reads the same slate's SEASON PER-GAME averages instead. See
// lib/fantasy/scoring.js for the re-rank and for the one thing it gets wrong
// (the feed carries no passing touchdowns, so QBs read low, and that is
// surfaced rather than patched with a guess).
//
// The meter beside each number was scaled as a percentage, which was right for
// a 0-100 score and wrong for points per game. TOP_PPG is the elite mark on
// the current board (McCaffrey, 24.5), so the bar reads as "share of the best
// man on the board" rather than a percentage of nothing.
const TOP_PPG = 25

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
    supabase.from('nfl_players').select('id,name,position,team,injury_status,source_payload,source_player_id').eq('active', true),
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
  // WHO IS TAKEN is a roster question, not a draft-pick question. The board used
  // to hide only players with a fantasy_draft_picks row, but a pick is just one
  // way to get a roster entry - free agency off the Wire, a commissioner
  // assignment, or a partial reset that nulls player_id on the picks all leave a
  // rostered player on the board, draftable a second time. wire/page.js has
  // always filtered on roster entries; this asks the same table the same thing.
  const takenIds = new Set(draftedIds)
  for (const entry of roster) if (entry.player_id) takenIds.add(entry.player_id)
  const selectedPosition = POSITIONS.includes(query?.position) ? query.position : 'ALL'
  const search = String(query?.q || '').trim().toLowerCase().slice(0,40)
  // The number shown is points per game; the ORDER is points per game above
  // replacement at that position, from this league's own roster settings. Two
  // quantities on purpose -- see lib/fantasy/scoring.js. Sorting by raw PPG
  // put four quarterbacks in the top ten of a one-QB league the moment the
  // bot published passing touchdowns; sorting by value over replacement is
  // stable whether that field is present or not, which is the test that
  // convinced me it was the right sort rather than a cleverer one.
  const levels = replacementLevels(players, league, league.scoring)
  const posRank = new Map()
  const seenAt = {}
  const rankedPlayers = players
    .map((player) => ({ ...player, dash_score: seasonValue(player, league.scoring), draft_value: draftValue(player, levels, league.scoring) }))
    .sort((a,b) => b.draft_value - a.draft_value || a.name.localeCompare(b.name))
  for (const player of rankedPlayers) {
    seenAt[player.position] = (seenAt[player.position] || 0) + 1
    posRank.set(player.id, `${player.position}${seenAt[player.position]}`)
  }
  const undrafted = rankedPlayers.filter((player) => !takenIds.has(player.id))
  const available = undrafted
    .filter((player) => selectedPosition === 'ALL' || (selectedPosition === 'FLEX' ? ['RB','WR','TE'].includes(player.position) : player.position === selectedPosition))
    .filter((player) => !search || player.name.toLowerCase().includes(search) || player.team?.toLowerCase().includes(search))
  const currentPick = picks.find((pick) => pick.overall_pick === draft?.current_overall_pick)
  const currentTeam = teams.find((team) => team.id === currentPick?.team_id)
  const isMyPick = draft?.status === 'live' && currentTeam?.owner_id === user.id
  const canPick = draft?.status === 'live' && (currentTeam?.owner_id === user.id || membership.role === 'commissioner')
  const myRoster = roster.filter((entry) => entry.team_id === myTeam?.id)
  // #70: an order snaked over an incomplete league is a placeholder, not a
  // ranking. Only true before the draft is live -- once it starts, the order
  // is the order.
  const orderProvisional = (!draft || draft.status === 'setup') && teams.length < Number(league.team_count || 0)

  return (
    <main className={styles.roomApp}>
      <header className={styles.roomHeader}><Link href="/fantasy">← FRANCHISE</Link><div><small>{String(league.status||'').replace('_',' ').toUpperCase()}</small><strong>{league.name}</strong></div><span>{teams.length}/{league.team_count} teams</span></header>
      <LeagueNav leagueId={leagueId} active="draft" role={membership?.role} className={styles.roomNav} activeClassName={styles.roomActive} />
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
            {/* #71: the board's number changed meaning, so it says what it is. It was
                an opaque 0-100 that people read as a rating; it is now projected
                fantasy points per game in this league's scoring, which is a
                quantity a first-time drafter already understands. The asterisk
                note is not a disclaimer for its own sake -- a QB projection
                here is genuinely low, and a board that knows its own number is
                incomplete should say so on the page rather than in a comment. */}
            <div className={styles.boardHead}><div><p className={styles.panelLabel}>AVAILABLE PLAYERS</p><h2>DASH NFL board</h2></div><form className={styles.playerSearch}><input aria-label="Search players" name="q" defaultValue={query?.q || ''} placeholder="Search player or team"/><input type="hidden" name="position" value={selectedPosition}/><button>Search</button></form><span>{available.length} available</span></div>
            <div className={styles.positionFilters}>{POSITIONS.map((position)=><Link key={position} className={selectedPosition===position?styles.positionActive:''} aria-current={selectedPosition===position?'true':undefined} href={`/fantasy/league/${leagueId}?position=${position}${query?.q?`&q=${encodeURIComponent(String(query.q))}`:''}`}>{position}</Link>)}</div>
            <p className={styles.boardNote}>The number is projected {String(league.scoring||'ppr').replace('_','-').toUpperCase()} points per game, from this season&apos;s per-game averages — not this week&apos;s matchup. The <b>order</b> also accounts for how many of each position you start, so a quarterback who scores more than a running back can still rank below him: you start one QB and can only use so many. The tag beside each name is his rank at his own position. <b>*</b> marks a projection the feed cannot complete.</p>
            <div className={styles.draftColumns}><span>RK</span><span>POS</span><span>PLAYER</span><span>PPG</span><span>STATUS</span></div>
            {/* Deliberately BELOW the sticky stack, not inside the board head.
                .playerBoard's three sticky rows are pinned at hardcoded offsets
                (0 / 62 / 104), so anything that makes the head taller silently
                pushes the pills under it -- which is #78's exact mechanism. An
                explanation is read once; it does not need to be pinned. */}
            {!players.length ? <p className={styles.emptyRoom}>Commissioner: sync the NFL player catalog to begin.</p> : available.slice(0,80).map((player) => (
              <div className={styles.draftPlayer} key={player.id} style={{ '--pos': colorForPosition(player.position) }}><span className={styles.rankNumber}>{rankedPlayers.findIndex((ranked)=>ranked.id===player.id)+1}</span><span className={styles.positionTag} title={`${posRank.get(player.id)} — ${player.position} number ${(posRank.get(player.id)||'').replace(player.position,'')} on this board`} style={{ color: colorForPosition(player.position), borderColor: `${colorForPosition(player.position)}55` }}>{posRank.get(player.id) || player.position}</span><div className={styles.playerIdentity}><PlayerFace player={player} size={34}/><span><b>{player.name}<InjuryTag status={player.injury_status}/></b><small>{player.team || 'FA'}</small></span></div><strong className={styles.playerDash} data-partial={projectionIsPartial(player)?'true':undefined} title={projectionIsPartial(player)?`Projected ${player.dash_score} points per game. ${player.position==='QB'?'The feed carries no passing touchdowns, so quarterback projections are low by roughly 6-8 points a game.':'The feed carries no sacks, interceptions or fumble recoveries, so defence projections are low.'}`:`Projected ${player.dash_score} points per game, from this season's per-game averages`} style={{ color: colorForPosition(player.position) }}>{player.dash_score}{projectionIsPartial(player)?<em className={styles.partialMark}>*</em>:null}<i className={styles.dashMeter} style={{ '--w': `${Math.max(4,Math.min(100,Math.round(player.dash_score/TOP_PPG*100)))}%`, '--c': colorForPosition(player.position) }}/></strong>{canPick?<><form action={draftPlayer}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="playerId" value={player.id}/><input type="hidden" name="overallPick" value={draft?.current_overall_pick||''}/><input type="hidden" name="viewPosition" value={selectedPosition}/><input type="hidden" name="viewQuery" value={String(query?.q||'')}/><SubmitButton pendingLabel="Drafting…">Draft</SubmitButton></form></>:draft&&myTeam?<form action={addToQueue}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="playerId" value={player.id}/><input type="hidden" name="viewPosition" value={selectedPosition}/><input type="hidden" name="viewQuery" value={String(query?.q||'')}/><SubmitButton className={styles.queueButton} pendingLabel="Adding…">+ Queue</SubmitButton></form>:<span className={styles.lockedPick}>{draft?.status === 'paused' ? 'PAUSED' : draft?.status === 'live' ? 'WAIT' : 'SCOUT'}</span>}</div>
            ))}
          </section>
          <aside className={styles.draftSide}>
            {/* #70: in a league with one team of fifteen, prepareDraft snakes over the
                teams that EXIST -- so the panel correctly listed that one team in
                every slot, and read as "one team picks the whole board." The order
                logic is fine (a mid-draft league alternates properly); what was
                missing is that a board built before everyone has joined is
                provisional. It says so now instead of showing you your own name
                fifteen times with no explanation. */}
            <section><div className={styles.boardHead}><div><p className={styles.panelLabel}>DRAFT ORDER</p><h2>{draft?.status === 'paused' ? 'Draft paused' : orderProvisional ? 'Order not final yet' : 'On the clock'}</h2>{orderProvisional&&<small className={styles.boardNote}>{teams.length} of {league.team_count} teams have joined. This order is built from the teams that exist right now and is rebuilt when the rest join — that is why the same name repeats.</small>}</div><span>{picks.filter((pick)=>pick.player_id).length}/{picks.length}</span></div>{picks.slice(Math.max(0,(draft?.current_overall_pick||1)-3),Math.max(8,(draft?.current_overall_pick||1)+5)).map((pick)=><div className={pick.overall_pick===draft?.current_overall_pick?styles.activePick:styles.pickRow} key={pick.id}><span>{pick.overall_pick}</span><b style={{display:'flex',alignItems:'center',gap:7,minWidth:0}}><TeamMark size={18} team={teams.find((team)=>team.id===pick.team_id)}/><span style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{teams.find((team)=>team.id===pick.team_id)?.name}</span></b><small title={pick.player_id && draft && pick.overall_pick > draft.current_overall_pick ? 'Pre-assigned by the commissioner — this pick has not come round yet' : undefined}>{rankedPlayers.find((player)=>player.id===pick.player_id)?.name || '—'}{pick.player_id && draft && pick.overall_pick > draft.current_overall_pick ? <em style={{fontStyle:'normal',opacity:.75,marginLeft:6}}>· pre-assigned</em> : null}</small></div>)}{!picks.length&&<p className={styles.emptyRoom}>Draft order not prepared.</p>}</section>
            {draft && <section><div className={styles.boardHead}><div><p className={styles.panelLabel}>MY QUEUE</p><h2>Auto-pick priority</h2></div><span>{queue.length}</span></div>{queue.map((item)=><div className={styles.queueRow} key={item.id}><span>{item.rank}</span><div><b>{item.player.name}</b><small>{item.player.position} · {item.player.team}</small></div><form action={removeFromQueue}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="playerId" value={item.player_id}/><input type="hidden" name="viewPosition" value={selectedPosition}/><input type="hidden" name="viewQuery" value={String(query?.q||'')}/><SubmitButton aria-label={`Remove ${item.player.name} from queue`} pendingLabel="…">×</SubmitButton></form></div>)}{!queue.length&&<p className={styles.emptyRoom}>Queue players from the board. If your timer expires, the first available name is selected.</p>}</section>}
            <section><div className={styles.boardHead}><div><p className={styles.panelLabel}>MY TEAM</p><h2 style={{display:'flex',alignItems:'center',gap:8}}>{myTeam&&<TeamMark size={22} team={myTeam}/>}{myTeam?.name}</h2></div></div>{myRoster.filter((entry)=>entry.player).map((entry)=><div className={styles.rosterRow} key={entry.id}><span>{entry.player.position}</span><b>{entry.player.name}</b><small>{entry.player.team}</small></div>)}{!myRoster.length&&<p className={styles.emptyRoom}>Your drafted players will appear here.</p>}</section>
          </aside>
        </div>
      </div>
    </main>
  )
}
