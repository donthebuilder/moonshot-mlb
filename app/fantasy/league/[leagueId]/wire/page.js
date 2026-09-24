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
import { gameForPlayer, matchupLabel, teamScheduleFor } from '../../../../../lib/fantasy/schedule'
import { dashScore, hasMarketScore, projectionIsPartial } from '../../../../../lib/fantasy/scoring'
import { FANTASY_SEASON, resolveFantasyWeek } from '../../../../../lib/fantasy/week'
import { addFreeAgent, cancelWaiverClaim, dropPlayer, processWaivers, submitWaiverClaim } from './actions'
import NetworkSwitch from '../../../../../components/NetworkSwitch'
import LeagueNav from '../../../../../components/fantasy/LeagueNav'
import { loadPlayerCatalog } from '../../../../../lib/fantasy/playerCatalog'
import { loadMatchupData, matchupNote, weeklyProjector } from '../../../../../lib/fantasy/matchupProjection'
import { PlayerSheetButton } from '../../../../../components/fantasy/PlayerSheet'
import { buildSheetData } from '../../../../../lib/fantasy/sheetEntry'
import PlayerForm from '../../../../../components/fantasy/PlayerForm'
import { formRank, playerForm } from '../../../../../lib/fantasy/form'

const POSITIONS=['ALL','QB','RB','WR','TE','K','DEF']
// How the board is ranked. DASH is the market score this page shipped with;
// FORM ranks on points actually scored in the last four weeks, which is the
// "hot players and not hot" question the market score cannot answer.
const SORTS={dash:'DASH SCORE',form:'RECENT FORM',proj:'PROJECTION'}

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
  // Matchup payload, fetched in parallel with everything below (cached 15 min).
  const matchupPromise=loadMatchupData()
  const WEEK=await resolveFantasyWeek(supabase,query?.week)
  const [{data:league},{data:membership},{data:teams=[]},{data:players=[]},{data:rosters=[]},{data:availability=[]},{data:claims=[]},{data:weekGames=[]}]=await Promise.all([
    supabase.from('fantasy_leagues').select('*').eq('id',leagueId).single(),
    supabase.from('fantasy_league_memberships').select('role').eq('league_id',leagueId).eq('user_id',user.id).single(),
    supabase.from('fantasy_teams').select('*').eq('league_id',leagueId).order('waiver_priority'),
    loadPlayerCatalog(supabase).then((rows) => ({ data: rows })),
    supabase.from('fantasy_roster_entries').select('team_id,player_id,player:nfl_players(id,name,position,team)').eq('league_id',leagueId).is('released_at',null),
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
  // Roster comes from the roster rows (same join as the Team page), not the
  // ACTIVE catalog -- an inactive rostered player used to vanish from the
  // Drop panel and the count while the server still counted him (2026-09-23).
  const myRoster=safeRosters.filter((row)=>row.team_id===myTeam?.id)
    .map((row)=>row.player||{id:row.player_id,name:'Unknown player',position:'',team:null})
    .sort((a,b)=>(a.position||'').localeCompare(b.position||'')||(a.name||'').localeCompare(b.name||''))
  const rosterFull=myRoster.length>=15
  // ── ?pos= SILENTLY SHOWED EVERYTHING (2026-09-07) ──────────────────────────
  // The filter chips write `position`; every hand-built link, and everyone's
  // first guess, writes `pos`. An unrecognised value fell through to 'ALL'
  // with no error and no clue -- the page looked like the filter had simply
  // decided not to work. Both spellings are read, and the value is upper-cased
  // so `?position=def` means what it obviously means.
  const requestedPosition=String(query?.position??query?.pos??'').trim().toUpperCase()
  const selectedPosition=POSITIONS.includes(requestedPosition)?requestedPosition:'ALL'
  const search=String(query?.q||'').trim().toLowerCase().slice(0,40)
  const requestedSort=String(query?.sort||'').trim().toLowerCase()
  const selectedSort=Object.keys(SORTS).includes(requestedSort)?requestedSort:'dash'
  // PROJ is this week's matchup projection (2026-09-23), not the bare average.
  const project=weeklyProjector(league.scoring,schedule,await matchupPromise)
  const availablePlayers=safePlayers.map((player)=>{const proj=project(player);return {...player,dash_score:dashScore(player),priced:hasMarketScore(player),projection:proj?.points||0,projNote:matchupNote(proj)}})
    .filter((player)=>!rosteredIds.has(player.id))
    .filter((player)=>selectedPosition==='ALL'||player.position===selectedPosition)
    .filter((player)=>!search||player.name.toLowerCase().includes(search)||player.team?.toLowerCase().includes(search))
    // Projection is the tiebreak, not the alphabet. Every unpriced player
    // shares the same defaulted 50 (see hasMarketScore), so for a whole
    // position -- D/ST, always -- the second key WAS the ranking.
    .sort((a,b)=>b.dash_score-a.dash_score||b.projection-a.projection||a.name.localeCompare(b.name))
  // #7: the list cut silently at 80 of 577 and the only count was up in the
  // board header, nowhere near the cut. The cut stays -- 577 rows of headshots
  // is not a page anyone wants on a phone -- but it now says so where it
  // happens, and grows by a link rather than not at all. Query param, not
  // client state: this page has no client JS and does not need any.
  // 40, not 80 (2026-09-20, Donovan: "drop to 40"). The Wire was the heaviest
  // page on the site -- ~1MB of HTML -- and half of what is left after the
  // payload fix is simply the React tree for the rows themselves. Forty rows
  // is still more than anyone scrolls in one go on a phone, and "Show 40 more"
  // was already the way to see the rest.
  const PAGE=40
  const limit=Math.min(560,Math.max(PAGE,Math.round(Number(query?.limit)||PAGE)))
  const RECENT_WEEKS = 4
  const firstWeek = Math.max(1, WEEK - (RECENT_WEEKS - 1))
  // ── RANKING THE WIRE (2026-09-20) ─────────────────────────────────────────
  // Donovan: "should also be a cool moving power ranking thing to help pick
  // hot players and not hot." DASH and PROJ can both be ordered from the
  // catalog row alone, so those two sort before the stat read and the read
  // covers exactly the page being shown. FORM cannot: ranking on what men
  // have scored means knowing what they scored, so it reads a pool first and
  // ranks it afterwards.
  //
  // The pool is capped. 577 free agents x 4 weeks would be a large read and a
  // query string of 577 uuids, on a page that shows 80 rows. Capping at the
  // top 160 by market score (or the page size, whichever is larger, so paging
  // still widens it) keeps the read bounded, and where the cap actually bites
  // the board note says so rather than implying the ranking is league-wide.
  // With a position filter on, the pool is usually the whole list.
  const FORM_POOL = Math.max(limit, 160)
  const marketOrder = availablePlayers
  const projOrder = [...availablePlayers].sort((a,b)=>b.projection-a.projection||b.dash_score-a.dash_score||a.name.localeCompare(b.name))
  const baseOrder = selectedSort==='proj'?projOrder:marketOrder
  const statsPool = selectedSort==='form' ? marketOrder.slice(0,FORM_POOL) : baseOrder.slice(0,limit)
  const formPoolCapped = selectedSort==='form' && availablePlayers.length > FORM_POOL
  // ── WHAT DID HE ACTUALLY DO? (2026-09-21) ──────────────────────────────
  // nfl_player_week_stats has carried a real weekly line per player since the
  // scoring feed shipped -- yards, touchdowns, catches, status -- and the
  // Matchup and Team pages both read it. The Wire never did. So the one page
  // you are on when deciding whether to ADD a man showed a projection and a
  // market score and nothing he has actually produced.
  const poolIds = statsPool.map((player) => player.id)
  let recentStats = []
  if (poolIds.length) {
    const { data = [] } = await supabase
      .from('nfl_player_week_stats')
      // dash_score is NOT read here: the row's DASH comes from the catalog via
      // dashScore(player). It was a column fetched for nobody.
      .select('player_id,week,stats,status,projected_points,game:nfl_week_games(home_team,away_team)')
      .in('player_id', poolIds)
      .eq('season', FANTASY_SEASON)
      .gte('week', firstWeek)
      .lte('week', WEEK)
    recentStats = data || []
  }
  // player id -> weeks, newest first. Built once here rather than filtered per
  // row in the client: the sheet opens on one man and should not walk a
  // 320-row array to find him.
  const statsByPlayer = {}
  for (const row of recentStats) {
    (statsByPlayer[row.player_id] ||= []).push(row)
  }
  for (const rows of Object.values(statsByPlayer)) rows.sort((a, b) => b.week - a.week)
  const formByPlayer = {}
  for (const player of statsPool) formByPlayer[player.id] = playerForm(statsByPlayer[player.id] || [], league.scoring, WEEK, RECENT_WEEKS)
  // A man with no played week ranks -1, behind everyone with a record: no
  // record is not the same as a good one (see formRank).
  const orderedPlayers = selectedSort==='form'
    ? [...statsPool].sort((a,b)=>formRank(formByPlayer[b.id])-formRank(formByPlayer[a.id])||b.dash_score-a.dash_score||a.name.localeCompare(b.name))
    : baseOrder
  const shownPlayers=orderedPlayers.slice(0,limit)
  const keep=`position=${selectedPosition}${query?.q?`&q=${encodeURIComponent(String(query.q))}`:''}`
  const moreHref=`/fantasy/league/${leagueId}/wire?${keep}&sort=${selectedSort}&limit=${limit+PAGE}`
  const sortHref=(key)=>`/fantasy/league/${leagueId}/wire?${keep}&sort=${key}`
  // What the sheet needs, keyed by id: the man and his recent weeks. Only the
  // fields the sheet reads -- shipping the whole catalog row to the client
  // would put 577 players' worth of columns in the HTML for a panel that opens
  // one at a time.
  // Built server-side so the raw weekly stat blobs never cross to the
  // browser -- see lib/fantasy/sheetEntry.js for what that was costing.
  const sheetData = buildSheetData(shownPlayers, statsByPlayer, league.scoring, (player) => ({ opp: matchupLabel(gameForPlayer(schedule, player)), proj: player.projection }))

  const waiverMap=new Map(safeAvailability.map((row)=>[row.player_id,row]))
  const safeClaims=claims||[]
  const myClaims=safeClaims.filter((claim)=>claim.team_id===myTeam?.id&&claim.status==='pending')
  const nextProcessing=safeClaims.filter((claim)=>claim.status==='pending').sort((a,b)=>new Date(a.process_after)-new Date(b.process_after))[0]

  return <main className={styles.roomApp}>
    <header className={styles.roomHeader}><NetworkSwitch variant="inline"/><div><small>PLAYER MARKET</small><strong>{league.name}</strong></div><span>{myTeam?`Priority #${safeTeams.findIndex((team)=>team.id===myTeam.id)+1}`:'No team yet'}</span></header>
    <LeagueNav leagueId={leagueId} active="wire" isCommissioner={league.commissioner_id === user.id} className={styles.roomNav} activeClassName={styles.roomActive} />
    <div className={styles.roomBody}>
      {(query?.error||query?.message)&&<p className={query.error?styles.error:styles.message}>{query.error||query.message}</p>}
      <section className={styles.wireHero}><div><p className={styles.panelLabel}>THE WIRE</p><h1>Find the next difference-maker.</h1><p>Free agents join immediately. Dropped players spend 24 hours on rolling-priority waivers.</p></div><div className={styles.roomStats}><span><small>PRIORITY</small><b>{myTeam?`#${safeTeams.findIndex((team)=>team.id===myTeam.id)+1}`:'—'}</b></span><span><small>CLAIMS</small><b>{myClaims.length}</b></span><span><small>ROSTER</small><b>{myRoster.length}/15</b></span></div></section>
      {league.commissioner_id===user.id&&<section className={styles.commishBar}><div><p className={styles.panelLabel}>COMMISSIONER</p><strong>{nextProcessing?`Next claims ${remaining(nextProcessing.process_after)}`:'No pending waiver run'}</strong><small>Claims clear on their own once their 24 hours are up, checked every 10 minutes. This runs them now.</small></div><form action={processWaivers}><input type="hidden" name="leagueId" value={leagueId}/><SubmitButton disabled={!nextProcessing} pendingLabel="Processing…">Process cleared claims</SubmitButton></form></section>}
      <div className={styles.wireLayout}>
        
        <section className={styles.playerBoard}>{/* #71 / #77: the draft board and this page printed the same unlabelled
              number and it meant two different things -- which is also why the same
              player rendered green on one and orange on the other. The board is
              now season value; this stays the WEEKLY market score, because an
              in-season pickup is a question about the coming Sunday. Two
              questions, two numbers, and now each says which it is. */}
          <div className={styles.boardHead}><div><p className={styles.panelLabel}>AVAILABLE PLAYERS</p><h2>Free agents &amp; waivers</h2><small className={styles.boardNote}>Ranked by this week&apos;s market score — how likely each man is to clear a prop on Sunday. That is a different question from the draft board, which ranks season value.</small></div><form className={styles.playerSearch}><input aria-label="Search players" name="q" defaultValue={query?.q||''} placeholder="Search player or team"/><input type="hidden" name="position" value={selectedPosition}/><button>Search</button></form><span>{availablePlayers.length} players</span></div>
          <div className={styles.sortFilters}><span>RANK BY</span>{Object.entries(SORTS).map(([key,label])=><Link key={key} className={selectedSort===key?styles.sortActive:''} aria-current={selectedSort===key?'true':undefined} href={sortHref(key)}>{label}</Link>)}</div>
          {selectedSort==='form'&&<p className={styles.sortNote}>Ranked on points actually scored in weeks {firstWeek}–{WEEK} under this league&apos;s scoring — a record, not a forecast. Men with no completed week sort last, because no record is not the same as a good one.{formPoolCapped?` Covers the top ${FORM_POOL} free agents by market score, not all ${availablePlayers.length}.`:''}</p>}
          <div className={styles.positionFilters}>{POSITIONS.map((position)=><Link key={position} className={selectedPosition===position?styles.positionActive:''} aria-current={selectedPosition===position?'true':undefined} href={`/fantasy/league/${leagueId}/wire?position=${position}${query?.q?`&q=${encodeURIComponent(String(query.q))}`:''}&sort=${selectedSort}`}>{position}</Link>)}</div>
          <div className={styles.wireColumns}><span>POS</span><span>PLAYER</span><span>FORM</span><span>PROJ</span><span>DASH</span><span>STATUS</span><span>MOVE</span></div>
          {shownPlayers.map((player)=>{const waiver=waiverMap.get(player.id);const onWaivers=waiver&&new Date(waiver.waiver_until)>new Date();const action=onWaivers?submitWaiverClaim:addFreeAgent;return <form action={action} className={styles.wirePlayer} key={player.id}><span className={styles.positionTag}>{player.position}</span><PlayerSheetButton sheet={sheetData[player.id]} className={styles.playerTap}><span className={styles.playerIdentity}><PlayerFace player={player} size={32}/><span><b>{player.name}<InjuryTag status={player.injury_status}/></b><PlayerMeta player={player} game={gameForPlayer(schedule,player)} bye={isOnBye(player,byeTeams)} showPosition={false}/></span><i className={styles.tapHint} aria-hidden="true">›</i></span></PlayerSheetButton><PlayerForm form={formByPlayer[player.id]} span={RECENT_WEEKS} week={WEEK}/><span className={styles.wireProj} title={projectionIsPartial(player)?'The feed carries no passing touchdowns or defensive turnovers, so quarterback and defence projections are low.':`Projected ${player.projection.toFixed(1)} this week. ${player.projNote}`}>{isOnBye(player,byeTeams)?'—':player.projection.toFixed(1)}{projectionIsPartial(player)&&!isOnBye(player,byeTeams)?<em className={styles.partialMark}>*</em>:null}<i>PROJ</i></span><strong className={player.priced?undefined:styles.dashUnpriced} title={player.priced?"This week's market score: how likely this man is to clear a prop on Sunday. Not points.":'No prop market priced this man this week — defences never have one. Sorted by projection instead.'}>{player.priced?player.dash_score:'—'}<i>DASH</i></strong><span className={onWaivers?styles.waiverStatus:styles.freeStatus}>{onWaivers?remaining(waiver.waiver_until):'FREE'}</span><div className={styles.wireMove}><select name="dropPlayerId" defaultValue="" required={rosterFull}><option value="">{rosterFull?'Drop who?':'No drop'}</option>{myRoster.map((rosterPlayer)=><option value={rosterPlayer.id} key={rosterPlayer.id}>Drop {rosterPlayer.name}</option>)}</select><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="playerId" value={player.id}/><SubmitButton disabled={league.status!=='active'} pendingLabel="…">{onWaivers?'Claim':'Add'}</SubmitButton></div></form>})}
          {!availablePlayers.length&&<p className={styles.emptyRoom}>No available players match this filter.</p>}
          {availablePlayers.length>0&&<p className={styles.wireMore}><span>Showing {shownPlayers.length} of {availablePlayers.length}</span>{availablePlayers.length>shownPlayers.length&&<Link href={moreHref}>Show {Math.min(PAGE,availablePlayers.length-shownPlayers.length)} more →</Link>}</p>}
        </section>
        
        <aside className={styles.wireSide}>
        {/* ── DROP, WITHOUT HAVING TO ADD (2026-09-07) ────────────────────────
            Donovan: "removing players should be easier." Until tonight it was
            not merely hard -- the only way to release a player was to sign
            another one in the same submit, because p_drop_player_id is a
            PARAMETER of the add. A full roster and nobody worth adding was a
            dead end. This panel calls drop_fantasy_player on its own.

            The list is the roster in position order, which is the order you
            think in when you are looking for the man to cut. Preview of five
            with the rest behind a details toggle: fifteen rows of buttons in
            a side rail is a wall on a phone. */}
        {Boolean(myRoster.length)&&<section>
          <div className={styles.boardHead}><div><p className={styles.panelLabel}>YOUR ROSTER</p><h2>Drop a player</h2></div><span>{myRoster.length}/15</span></div>
          {myRoster.slice(0,5).map((rosterPlayer)=><DropRow key={rosterPlayer.id} leagueId={leagueId} player={rosterPlayer}/>)}
          {myRoster.length>5&&<details className={styles.dropMore}>
            <summary>{myRoster.length-5} more on the roster</summary>
            {myRoster.slice(5).map((rosterPlayer)=><DropRow key={rosterPlayer.id} leagueId={leagueId} player={rosterPlayer}/>)}
          </details>}
          <p className={styles.boardNote}>A dropped player spends 24 hours on waivers before anyone can add him. A player whose game has kicked off cannot be dropped.</p>
        </section>}
        <section><div className={styles.boardHead}><div><p className={styles.panelLabel}>MY CLAIMS</p><h2>Pending moves</h2></div><span>{myClaims.length}</span></div>{myClaims.map((claim)=><div className={styles.claimRow} key={claim.id}><div><b>{claim.player?.name}</b><small>{claim.player?.position} · clears in {remaining(claim.process_after)}</small></div><form action={cancelWaiverClaim}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="claimId" value={claim.id}/><SubmitButton pendingLabel="…">Cancel</SubmitButton></form></div>)}{!myClaims.length&&<p className={styles.emptyRoom}>You have no pending claims.</p>}</section>
          <section><div className={styles.boardHead}><div><p className={styles.panelLabel}>ROLLING PRIORITY</p><h2>Waiver order</h2></div></div>{safeTeams.map((team,index)=><div className={styles.priorityRow} key={team.id}><span>{index+1}</span><div style={{display:'flex',alignItems:'center',gap:8,minWidth:0}}><TeamMark size={22} team={team}/><b style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{team.name}</b></div><small>{team.id===myTeam?.id?'YOU':''}</small></div>)}</section>
          <section><div className={styles.boardHead}><div><p className={styles.panelLabel}>DASH COACH</p><h2>Wire basics</h2></div></div><p className={styles.emptyRoom}>{league.status==='active'?'Use free agency for immediate adds. A successful waiver claim moves your team to the back of the priority order.':'The Wire opens when the draft is complete.'}</p></section></aside>
      </div>
    </div>
  </main>
}


// One roster row with a Drop button. Its own component so the roster list and
// the "more" drawer cannot drift apart.
function DropRow({leagueId,player}){
  return <form action={dropPlayer} className={styles.claimRow}>
    <div><b>{player.name}</b><small>{player.position} · {player.team||'FA'}</small></div>
    <input type="hidden" name="leagueId" value={leagueId}/>
    <input type="hidden" name="playerId" value={player.id}/>
    <SubmitButton pendingLabel="Dropping…">Drop</SubmitButton>
  </form>
}
