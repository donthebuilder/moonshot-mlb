import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../lib/supabase/server'
import styles from '../../fantasy.module.css'
import { addToQueue, assignDraftPick, draftPlayer, prepareDraft, removeFromQueue, runAutoPick, setDraftState, startDraft, syncPlayerCatalog } from './actions'

const POSITIONS = ['ALL','QB','RB','WR','TE','FLEX','K','DEF']

function dashScore(player) {
  const values = Object.values(player.source_payload?.scores || {}).map(Number).filter(Number.isFinite)
  return values.length ? Math.round(Math.max(...values)) : 50
}

export default async function LeagueRoom({ params, searchParams }) {
  const [{leagueId}, query] = await Promise.all([params, searchParams])
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/fantasy')

  const { data: league } = await supabase.from('fantasy_leagues').select('*').eq('id', leagueId).single()
  if (!league) notFound()
  const [{ data: membership }, { data: teams = [] }, { data: players = [] }, { data: draft }] = await Promise.all([
    supabase.from('fantasy_league_memberships').select('role').eq('league_id', leagueId).eq('user_id', user.id).single(),
    supabase.from('fantasy_teams').select('*').eq('league_id', leagueId).order('created_at'),
    supabase.from('nfl_players').select('id,name,position,team,injury_status,source_payload').eq('active', true),
    supabase.from('fantasy_drafts').select('*').eq('league_id', leagueId).maybeSingle(),
  ])
  if (!membership) notFound()
  const myTeam = teams.find((team) => team.owner_id === user.id)

  const [{ data: picks = [] }, { data: roster = [] }, { data: queue = [] }] = await Promise.all([
    draft ? supabase.from('fantasy_draft_picks').select('*').eq('draft_id', draft.id).order('overall_pick') : Promise.resolve({ data: [] }),
    supabase.from('fantasy_roster_entries').select('*,player:nfl_players(id,name,position,team)').eq('league_id', leagueId).is('released_at', null),
    draft && myTeam ? supabase.from('fantasy_draft_queue').select('*,player:nfl_players(id,name,position,team)').eq('draft_id', draft.id).eq('team_id', myTeam.id).order('rank') : Promise.resolve({ data: [] }),
  ])
  const draftedIds = new Set(picks.filter((pick) => pick.player_id).map((pick) => pick.player_id))
  const selectedPosition = POSITIONS.includes(query?.position) ? query.position : 'ALL'
  const search = String(query?.q || '').trim().toLowerCase().slice(0,40)
  const rankedPlayers = players.map((player) => ({ ...player, dash_score: dashScore(player) }))
    .sort((a,b) => b.dash_score - a.dash_score || a.name.localeCompare(b.name))
  const available = rankedPlayers.filter((player) => !draftedIds.has(player.id))
    .filter((player) => selectedPosition === 'ALL' || (selectedPosition === 'FLEX' ? ['RB','WR','TE'].includes(player.position) : player.position === selectedPosition))
    .filter((player) => !search || player.name.toLowerCase().includes(search) || player.team?.toLowerCase().includes(search))
  const currentPick = picks.find((pick) => pick.overall_pick === draft?.current_overall_pick)
  const currentTeam = teams.find((team) => team.id === currentPick?.team_id)
  const canPick = draft?.status === 'live' && (currentTeam?.owner_id === user.id || membership.role === 'commissioner')
  const myRoster = roster.filter((entry) => entry.team_id === myTeam?.id)

  return (
    <main className={styles.roomApp}>
      <header className={styles.roomHeader}><Link href="/fantasy">← FRANCHISE</Link><div><small>{league.status}</small><strong>{league.name}</strong></div><span>{teams.length}/{league.team_count} teams</span></header>
      <nav className={styles.roomNav}><a className={styles.roomActive}>Draft</a><Link href={`/fantasy/league/${leagueId}/team`}>Team</Link><Link href={`/fantasy/league/${leagueId}/matchup`}>Matchup</Link><Link href={`/fantasy/league/${leagueId}/league`}>League</Link><Link href={`/fantasy/league/${leagueId}/wire`}>Wire</Link><Link href={`/fantasy/league/${leagueId}/trades`}>Trades</Link><Link href={`/fantasy/league/${leagueId}/feed`}>Feed</Link><Link href={`/fantasy/league/${leagueId}/coach`}>Coach</Link></nav>
      <div className={styles.roomBody}>
        {(query?.error || query?.message) && <p className={query.error ? styles.error : styles.message}>{query.error || query.message}</p>}
        <section className={styles.draftHero}>
          <div><p className={styles.panelLabel}>LIVE LEAGUE ROOM</p><h1>{draft?.status === 'live' ? `Pick ${draft.current_overall_pick} is on the clock` : 'Build the draft board.'}</h1><p>{draft?.status === 'live' ? `${currentTeam?.name || 'Next team'} · ${draft.timer_seconds} second timer` : `${league.scoring.replace('_','-').toUpperCase()} · ${league.draft_order_method} order · ${league.draft_timer_seconds}s picks`}</p></div>
          <div className={styles.roomStats}><span><small>PLAYERS</small><b>{players.length}</b></span><span><small>DRAFTED</small><b>{draftedIds.size}</b></span><span><small>ROSTER</small><b>{myRoster.length}</b></span></div>
        </section>

        {membership.role === 'commissioner' && (
          <section className={styles.commishBar}>
            <div><p className={styles.panelLabel}>COMMISSIONER CONTROLS</p><strong>Catalog → order → live draft</strong></div>
            <form action={syncPlayerCatalog}><input type="hidden" name="leagueId" value={leagueId}/><button>Refresh NFL players</button></form>
            <form action={prepareDraft} className={styles.orderForm}><input type="hidden" name="leagueId" value={leagueId}/>{league.draft_order_method === 'manual' && teams.map((team,index)=><label key={team.id}>{team.name}<select name={`position_${team.id}`} defaultValue={index+1}>{teams.map((_,i)=><option key={i+1}>{i+1}</option>)}</select></label>)}<button disabled={!players.length}>Prepare snake draft</button></form>
            <form action={startDraft}><input type="hidden" name="leagueId" value={leagueId}/><button disabled={!draft || draft.status !== 'setup'}>Start draft</button></form>
            {['live','paused'].includes(draft?.status) && <form action={setDraftState}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="state" value={draft.status === 'live' ? 'paused' : 'live'}/><button>{draft.status === 'live' ? 'Pause draft' : 'Resume draft'}</button></form>}
          </section>
        )}

        {membership.role === 'commissioner' && draft && picks.some((pick)=>!pick.player_id) && <form action={assignDraftPick} className={styles.assignmentBar}><div><p className={styles.panelLabel}>MANUAL ASSIGNMENT</p><strong>Place a player into any open pick</strong></div><select name="overallPick">{picks.filter((pick)=>!pick.player_id).map((pick)=><option value={pick.overall_pick} key={pick.id}>#{pick.overall_pick} · {teams.find((team)=>team.id===pick.team_id)?.name}</option>)}</select><select name="playerId">{available.slice(0,134).map((player)=><option value={player.id} key={player.id}>{player.position} · {player.name}</option>)}</select><input type="hidden" name="leagueId" value={leagueId}/><button>Assign pick</button></form>}

        {membership.role !== 'commissioner' && (!draft || draft.status === 'setup') && <section className={styles.waitingRoom}><span>◷</span><div><p className={styles.panelLabel}>DRAFT LOBBY</p><strong>The commissioner is setting the draft order.</strong><small>You can study the DASH board now. Draft controls unlock when the room goes live.</small></div></section>}

        <div className={styles.draftLayout}>
          <section className={styles.playerBoard}>
            <div className={styles.boardHead}><div><p className={styles.panelLabel}>AVAILABLE PLAYERS</p><h2>DASH NFL board</h2></div><form className={styles.playerSearch}><input name="q" defaultValue={query?.q || ''} placeholder="Search player or team"/><input type="hidden" name="position" value={selectedPosition}/><button>Search</button></form><span>{available.length} available</span></div>
            <div className={styles.positionFilters}>{POSITIONS.map((position)=><Link key={position} className={selectedPosition===position?styles.positionActive:''} href={`/fantasy/league/${leagueId}?position=${position}`}>{position}</Link>)}</div>
            <div className={styles.draftColumns}><span>RK</span><span>POS</span><span>PLAYER</span><span>DASH</span><span>STATUS</span></div>
            {!players.length ? <p className={styles.emptyRoom}>Commissioner: sync the NFL player catalog to begin.</p> : available.slice(0,80).map((player) => (
              <div className={styles.draftPlayer} key={player.id}><span className={styles.rankNumber}>{rankedPlayers.findIndex((ranked)=>ranked.id===player.id)+1}</span><span className={styles.positionTag}>{player.position}</span><div><b>{player.name}</b><small>{player.team || 'FA'}{player.injury_status ? ` · ${player.injury_status}` : ''}</small></div><strong className={styles.playerDash}>{player.dash_score}</strong>{canPick?<form action={draftPlayer}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="playerId" value={player.id}/><button>Draft</button></form>:draft&&myTeam?<form action={addToQueue}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="playerId" value={player.id}/><button className={styles.queueButton}>+ Queue</button></form>:<span className={styles.lockedPick}>{draft?.status === 'paused' ? 'PAUSED' : draft?.status === 'live' ? 'WAIT' : 'SCOUT'}</span>}</div>
            ))}
          </section>
          <aside className={styles.draftSide}>
            <section><div className={styles.boardHead}><div><p className={styles.panelLabel}>DRAFT ORDER</p><h2>{draft?.status === 'paused' ? 'Draft paused' : 'On the clock'}</h2></div>{draft?.status==='live'&&<form action={runAutoPick}><input type="hidden" name="leagueId" value={leagueId}/><button className={styles.clockChip}>Check {draft.timer_seconds}s timer</button></form>}</div>{picks.slice(Math.max(0,(draft?.current_overall_pick||1)-3),Math.max(8,(draft?.current_overall_pick||1)+5)).map((pick)=><div className={pick.overall_pick===draft?.current_overall_pick?styles.activePick:styles.pickRow} key={pick.id}><span>{pick.overall_pick}</span><b>{teams.find((team)=>team.id===pick.team_id)?.name}</b><small>{rankedPlayers.find((player)=>player.id===pick.player_id)?.name || '—'}</small></div>)}{!picks.length&&<p className={styles.emptyRoom}>Draft order not prepared.</p>}</section>
            {draft && <section><div className={styles.boardHead}><div><p className={styles.panelLabel}>MY QUEUE</p><h2>Auto-pick priority</h2></div><span>{queue.length}</span></div>{queue.map((item)=><div className={styles.queueRow} key={item.id}><span>{item.rank}</span><div><b>{item.player.name}</b><small>{item.player.position} · {item.player.team}</small></div><form action={removeFromQueue}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="playerId" value={item.player_id}/><button>×</button></form></div>)}{!queue.length&&<p className={styles.emptyRoom}>Queue players from the board. If your timer expires, the first available name is selected.</p>}</section>}
            <section><div className={styles.boardHead}><div><p className={styles.panelLabel}>MY TEAM</p><h2>{myTeam?.name}</h2></div></div>{myRoster.map((entry)=><div className={styles.rosterRow} key={entry.id}><span>{entry.player.position}</span><b>{entry.player.name}</b><small>{entry.player.team}</small></div>)}{!myRoster.length&&<p className={styles.emptyRoom}>Your drafted players will appear here.</p>}</section>
          </aside>
        </div>
      </div>
    </main>
  )
}
