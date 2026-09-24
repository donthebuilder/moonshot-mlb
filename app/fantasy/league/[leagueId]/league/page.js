import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import styles from '../../../fantasy.module.css'
import { matchupState, weekStates } from '../../../../../lib/fantasy/matchupState'
import TeamMark from '../../../../../components/fantasy/TeamMark'
import SubmitButton from '../../../../../components/fantasy/SubmitButton'
import { generateWeeklyContent } from './actions'
import NetworkSwitch from '../../../../../components/NetworkSwitch'
import LeagueNav from '../../../../../components/fantasy/LeagueNav'
import InviteCode from '../../../../../components/fantasy/InviteCode'
import PlayerFace from '../../../../../components/fantasy/PlayerFace'
import InjuryTag from '../../../../../components/fantasy/InjuryTag'
import { colorForPosition } from '../../../../../components/fantasy/positionColor'
import { loadPlayerCatalog } from '../../../../../lib/fantasy/playerCatalog'
import { draftValue, replacementLevels, seasonValue } from '../../../../../lib/fantasy/scoring'
import { PlayerSheetButton } from '../../../../../components/fantasy/PlayerSheet'
import { buildSheetData } from '../../../../../lib/fantasy/sheetEntry'
import { FANTASY_LAST_WEEK, FANTASY_REGULAR_WEEKS, resolveFantasyWeek } from '../../../../../lib/fantasy/week'
import { gameForPlayer, matchupLabel, teamScheduleFor } from '../../../../../lib/fantasy/schedule'
import { signedInUser } from '../../../../../lib/supabase/authUser'
import { ACTIVITY_PAGE, ACTIVITY_TYPES, activityType, byDay, playerIdsOf, shapeActivity, tradeIdsOf } from '../../../../../lib/fantasy/activity'
import LeagueActivity from '../../../../../components/fantasy/LeagueActivity'

const SEASON=2026

export default async function LeaguePage({params,searchParams}) {
  const [{leagueId},query]=await Promise.all([params,searchParams])
  const view=['standings','playoffs','power','players','activity','recap'].includes(query?.view)?query.view:'standings'
  const week=Math.min(FANTASY_LAST_WEEK,Math.max(1,Number(query?.week)||1))
  const supabase=await createSupabaseServerClient()
  if(!supabase)redirect('/fantasy')
  const user=await signedInUser(supabase)
  if(!user)redirect('/fantasy')
  const [{data:league},{data:membership},{data:teamRows},{data:matchupRows},{data:rankings},{data:awards},{data:recap},{data:nflGameRows}]=await Promise.all([
    supabase.from('fantasy_leagues').select('*').eq('id',leagueId).single(),
    supabase.from('fantasy_league_memberships').select('role').eq('league_id',leagueId).eq('user_id',user.id).single(),
    supabase.from('fantasy_teams').select('*').eq('league_id',leagueId).order('created_at'),
    supabase.from('fantasy_matchups').select('*').eq('league_id',leagueId).eq('season',SEASON).order('week'),
    supabase.from('fantasy_power_rankings').select('*').eq('league_id',leagueId).eq('season',SEASON).eq('week',week).order('rank'),
    supabase.from('fantasy_weekly_awards').select('*').eq('league_id',leagueId).eq('season',SEASON).eq('week',week),
    supabase.from('fantasy_weekly_recaps').select('*').eq('league_id',leagueId).eq('season',SEASON).eq('week',week).maybeSingle(),
    supabase.from('nfl_week_games').select('week,status,season_type').eq('season',SEASON).eq('season_type',2).lte('week',FANTASY_LAST_WEEK),
  ])
  if(!league||!membership)notFound()
  const teams=teamRows||[]
  // A matchup is FINAL when its week's NFL games are all final -- derived from
  // the games, not the row's status column (see lib/fantasy/matchupState.js).
  const states=weekStates(nflGameRows||[])
  const matchups=(matchupRows||[]).map((game)=>({...game,status:matchupState(game,states[game.week])}))
  const safeRankings=rankings||[]
  const safeAwards=awards||[]
  // STANDINGS ARE THE REGULAR SEASON (2026-09-24): playoff games (Weeks 15-16)
  // decide the bracket, not the table -- and seeds are drawn from this table.
  const regular=matchups.filter((game)=>(game.round||'regular')==='regular'&&Number(game.week)<=FANTASY_REGULAR_WEEKS)
  const table=teams.map((team)=>{const record={...team,wins:0,losses:0,ties:0,pointsFor:0,pointsAgainst:0};regular.filter((game)=>game.status==='final'&&(game.home_team_id===team.id||game.away_team_id===team.id)).forEach((game)=>{const home=game.home_team_id===team.id;const pf=Number(home?game.home_score:game.away_score);const pa=Number(home?game.away_score:game.home_score);record.pointsFor+=pf;record.pointsAgainst+=pa;if(pf>pa)record.wins+=1;else if(pf<pa)record.losses+=1;else record.ties+=1});return record})
    // RANK BY WIN PERCENTAGE, NOT WINS (2026-09-14). Nine teams and four games
    // a week means five teams play 12 and four play 13 over the 14-week
    // schedule (generate_fantasy_schedule rotates one null slot). Sorting on
    // raw wins hands the 13-game teams a free rung; percentage is what every
    // odd-team league uses. Ties count half. Points for breaks the tie.
    .map((record)=>({...record,games:record.wins+record.losses+record.ties,pct:(record.wins+record.losses+record.ties)?(record.wins+record.ties*0.5)/(record.wins+record.losses+record.ties):0}))
    .sort((a,b)=>b.pct-a.pct||b.wins-a.wins||b.pointsFor-a.pointsFor)
  const finalGames=regular.filter((game)=>game.status==='final').length
  const weekFinals=matchups.filter((game)=>game.week===week&&game.status==='final').length
  // The league's own setting now (202609241200_franchise_playoffs.sql), 4 by default.
  const playoffSpots=Number.isFinite(Number(league.playoff_teams))?Number(league.playoff_teams):4
  const bracket=matchups.filter((game)=>(game.round||'regular')!=='regular')
  const teamName=(id)=>teams.find((team)=>team.id===id)?.name||'Team'

  // ── PLAYER POWER RANKINGS (2026-09-07) ────────────────────────────────────
  // Donovan asked for player power rankings alongside the team ones. Loaded
  // only when the tab is open: it is the whole catalogue plus every roster in
  // the league, and Standings has no use for either.
  //
  // Ranked by VALUE OVER REPLACEMENT, not by points per game. Raw PPG puts
  // four quarterbacks in the top ten of a one-QB league, which tells you
  // nothing about who is worth owning -- the same reason the draft board sorts
  // this way (lib/fantasy/scoring.js). Points per game is still shown, because
  // that is the number people recognise.
  //
  // Free agents are ranked in the same list rather than in a table of their
  // own. The useful fact is not "here are the best free agents", it is "the
  // 14th best player in this league is sitting on the wire".
  let playerBoard=[]
  if(view==='players'){
    const [catalog,{data:ownedRows}]=await Promise.all([
      loadPlayerCatalog(supabase),
      supabase.from('fantasy_roster_entries').select('team_id,player_id').eq('league_id',leagueId).is('released_at',null),
    ])
    const ownerByPlayer=new Map((ownedRows||[]).map((row)=>[row.player_id,row.team_id]))
    const all=Array.isArray(catalog)?catalog:[]
    const levels=replacementLevels(all,league,league.scoring)
    playerBoard=all
      .map((player)=>({
        player,
        ownerId:ownerByPlayer.get(player.id)||null,
        ppg:seasonValue(player,league.scoring),
        value:draftValue(player,levels,league.scoring),
      }))
      .sort((a,b)=>b.value-a.value||a.player.name.localeCompare(b.player.name))
  }
  // ── ACTIVITY (2026-09-24): every move, filterable (lib/fantasy/activity.js).
  // Read only when this view is open.
  const actType=activityType(query?.type)
  const actTeam=teams.some((team)=>team.id===query?.team)?query.team:'all'
  const actPage=Math.max(1,Math.min(200,Number(query?.page)||1))
  let activity=null
  if(view==='activity'){
    let q=supabase.from('fantasy_transactions').select('id,team_id,transaction_type,added_player_id,dropped_player_id,details,created_at').eq('league_id',leagueId)
    if(actTeam!=='all')q=q.eq('team_id',actTeam)
    if(ACTIVITY_TYPES[actType].apply)q=ACTIVITY_TYPES[actType].apply(q)
    const from=(actPage-1)*ACTIVITY_PAGE
    const {data:txRows,error:txError}=await q.order('created_at',{ascending:false}).range(from,from+ACTIVITY_PAGE)
    if(txError)console.error('[franchise/activity] read failed',txError.message)
    const pageRows=(txRows||[]).slice(0,ACTIVITY_PAGE)
    const tradeIds=tradeIdsOf(pageRows)
    // A filtered trade page holds one side; fetch both sides' rows so the trade reads whole.
    const [{data:tradeItems},{data:tradeTx}]=tradeIds.length?await Promise.all([
      supabase.from('fantasy_trade_items').select('trade_id,from_team_id,to_team_id,player_id').in('trade_id',tradeIds),
      supabase.from('fantasy_transactions').select('id,team_id,transaction_type,details,created_at').eq('league_id',leagueId).eq('transaction_type','trade').in('details->>trade_id',tradeIds),
    ]):[{data:[]},{data:[]}]
    const ids=playerIdsOf(pageRows,tradeItems)
    const {data:players}=ids.length?await supabase.from('nfl_players').select('id,name,position,team').in('id',ids):{data:[]}
    const merged=[...pageRows,...(tradeTx||[]).filter((row)=>!pageRows.some((p)=>p.id===row.id))]
    activity={groups:byDay(shapeActivity({transactions:merged,tradeItems:tradeItems||[],players:players||[]})),more:(txRows||[]).length>ACTIVITY_PAGE,failed:Boolean(txError)}
  }
  // ── LOOK ANYONE UP (2026-09-24) ───────────────────────────────────────────
  // Donovan: "make sure it's somewhere you can look up players and see who's
  // doing what." The index ranked everyone but could not be searched or
  // filtered, and a name did nothing when tapped. Now: search by name or club,
  // a position filter, owned/free, and every name opens the same player sheet
  // the Wire and Team pages use (game log, opponents, box scores).
  const POS_FILTERS=['ALL','QB','RB','WR','TE','K','DEF']
  const playerQ=String(query?.q||'').trim().toLowerCase().slice(0,40)
  const playerPos=POS_FILTERS.includes(String(query?.pos||'').toUpperCase())?String(query.pos).toUpperCase():'ALL'
  const playerOwn=['all','free','owned'].includes(query?.own)?query.own:'all'
  if(view==='players'){
    playerBoard=playerBoard.filter((row)=>
      (playerPos==='ALL'||row.player.position===playerPos)
      &&(playerOwn==='all'||(playerOwn==='free'?!row.ownerId:Boolean(row.ownerId)))
      &&(!playerQ||row.player.name.toLowerCase().includes(playerQ)||String(row.player.team||'').toLowerCase()===playerQ))
  }
  // ── THE INDEX STOPPED AT 60 AND NEVER SAID SO (2026-09-07) ────────────────
  // 135 men are rostered in a nine-team league and the board showed the first
  // 60, with no count, no cut line and nothing to click. The one question this
  // page exists to answer -- "who owns him?" -- was unanswerable for the other
  // 75, which is exactly the half you go looking for when you are hunting a
  // trade. Same pattern the Wire already uses: a query param, a stated count,
  // and a link that grows the list. No client JS on this page either.
  // 25, not 60: on a phone the index opens as a 60-row wall before the one
  // name you came for. The link grows it 60 at a time from there.
  const PLAYER_PAGE=25
  const PLAYER_STEP=60
  const playerLimit=Math.min(600,Math.max(PLAYER_PAGE,Math.round(Number(query?.players)||PLAYER_PAGE)))
  const shownPlayerBoard=playerBoard.slice(0,playerLimit)
  const playerKeep=`view=players&week=${week}${playerQ?`&q=${encodeURIComponent(playerQ)}`:''}${playerPos!=='ALL'?`&pos=${playerPos}`:''}${playerOwn!=='all'?`&own=${playerOwn}`:''}`
  const morePlayersHref=`/fantasy/league/${leagueId}/league?${playerKeep}&players=${playerLimit+PLAYER_STEP}`
  // Sheets for the rows on screen only: four weeks, each with its opponent.
  let playerSheets={}
  if(view==='players'&&shownPlayerBoard.length){
    const nflWeek=await resolveFantasyWeek(supabase)
    const ids=shownPlayerBoard.map((row)=>row.player.id)
    const [{data:weekRows},{data:thisWeekGames}]=await Promise.all([
      supabase.from('nfl_player_week_stats').select('player_id,week,stats,status,projected_points,game:nfl_week_games(home_team,away_team)')
        .in('player_id',ids).eq('season',SEASON).gte('week',Math.max(1,nflWeek-3)).lte('week',nflWeek),
      supabase.from('nfl_week_games').select('home_team,away_team,season_type,kickoff,status').eq('season',SEASON).eq('week',nflWeek),
    ])
    const byPlayer={}
    for(const row of weekRows||[])(byPlayer[row.player_id]||=[]).push(row)
    const schedule=teamScheduleFor(thisWeekGames||[])
    playerSheets=buildSheetData(shownPlayerBoard.map((row)=>row.player),byPlayer,league.scoring,(player)=>({opp:matchupLabel(gameForPlayer(schedule,player))}))
  }

  return <main className={styles.roomApp}>
    <header className={styles.roomHeader}><NetworkSwitch variant="inline"/><div><small>{String(league.status||'').replace('_',' ').toUpperCase()}</small><strong>{league.name}</strong></div><span>{teams.length}/{league.team_count} teams</span></header>
    <LeagueNav leagueId={leagueId} active="league" isCommissioner={league.commissioner_id === user.id} className={styles.roomNav} activeClassName={styles.roomActive} />
    <div className={styles.roomBody}>
      {(query?.error||query?.message)&&<p className={query.error?styles.error:styles.message}>{query.error||query.message}</p>}
      <section className={styles.leagueHero}><div><p className={styles.panelLabel}>LEAGUE HQ</p><h1>{league.name}</h1><p>{String(league.scoring||'ppr').replace('_','-').toUpperCase()} · {league.team_count} teams</p><InviteCode className={styles.leagueInvite} code={league.invite_code} />{league.commissioner_id===user.id&&<Link className={styles.leagueSettingsLink} href={`/fantasy/league/${leagueId}/settings`}>⚙ Open Commissioner Control Room</Link>}</div><div className={styles.roomStats}><span><small>MEMBERS</small><b>{teams.length}</b></span><span><small>GAMES</small><b>{matchups.length}</b></span><span><small>FINAL</small><b>{finalGames}</b></span></div></section>
      <div className={styles.leagueViews}><Link className={view==='standings'?styles.leagueViewActive:''} href={`/fantasy/league/${leagueId}/league?view=standings&week=${week}`}>Standings</Link><Link className={view==='playoffs'?styles.leagueViewActive:''} href={`/fantasy/league/${leagueId}/league?view=playoffs&week=${week}`}>Playoffs</Link><Link className={view==='players'?styles.leagueViewActive:''} href={`/fantasy/league/${leagueId}/league?view=players&week=${week}`}>Players</Link><Link className={view==='activity'?styles.leagueViewActive:''} href={`/fantasy/league/${leagueId}/league?view=activity&week=${week}`}>Activity</Link><Link className={view==='power'?styles.leagueViewActive:''} href={`/fantasy/league/${leagueId}/league?view=power&week=${week}`}>Power Rankings</Link><Link className={view==='recap'?styles.leagueViewActive:''} href={`/fantasy/league/${leagueId}/league?view=recap&week=${week}`}>Weekly Recap</Link><form><input type="hidden" name="view" value={view}/><select name="week" defaultValue={week}>{Array.from({length:FANTASY_LAST_WEEK},(_,i)=>i+1).map((number)=><option value={number} key={number}>{number>FANTASY_REGULAR_WEEKS?(number===FANTASY_REGULAR_WEEKS+1?'Semifinals':'Championship'):`Week ${number}`}</option>)}</select><button>Go</button></form></div>
      {league.commissioner_id===user.id&&['power','recap'].includes(view)&&<section className={styles.commishBar}><div><p className={styles.panelLabel}>WEEKLY PUBLISHER</p><strong>{weekFinals?`${weekFinals} final games available`:`Week ${week} still needs final scores`}</strong></div><form action={generateWeeklyContent}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="week" value={week}/><SubmitButton disabled={!weekFinals} pendingLabel="Generating…">Generate Week {week}</SubmitButton></form></section>}
      {view==='standings'&&<Standings leagueId={leagueId} finalGames={finalGames} playoffSpots={playoffSpots} table={table} user={user}/>}
      {view==='playoffs'&&<Playoffs bracket={bracket} table={table} playoffSpots={playoffSpots} startWeek={Number(league.playoff_start_week)||FANTASY_REGULAR_WEEKS+1} teams={teams} leagueId={leagueId} user={user} finalGames={finalGames}/>}
      {view==='power'&&<PowerRankings rankings={safeRankings} teamName={teamName} teams={teams}/>}
      {view==='players'&&<PlayerPower sheets={playerSheets} filters={{q:playerQ,pos:playerPos,own:playerOwn,week,posList:POS_FILTERS}} board={shownPlayerBoard} leagueId={leagueId} moreHref={playerBoard.length>shownPlayerBoard.length?morePlayersHref:null} teams={teams} total={playerBoard.length}/>}
      {view==='activity'&&<LeagueActivity activity={activity} leagueId={leagueId} teams={teams} type={actType} team={actTeam} page={actPage} week={week}/>}
      {view==='recap'&&<WeeklyRecap recap={recap} awards={safeAwards} teamName={teamName} week={week}/>}
    </div>
  </main>
}

function Standings({finalGames,leagueId,playoffSpots,table,user}){return <section className={styles.standings}><div className={styles.boardHead}><div><p className={styles.panelLabel}>2026 REGULAR SEASON · WEEKS 1-{FANTASY_REGULAR_WEEKS}</p><h2>Standings</h2></div><span>{table.length%2?`By win % · ${table.length} teams, one idle a week`:'W-L-T · Points'}</span></div><div className={styles.standingHead}><span>RK</span><span>TEAM</span><span>W</span><span>L</span><span>T</span><span>PF</span><span>PA</span></div>{table.map((team,index)=><div className={styles.standingRow} data-cut={finalGames&&index===playoffSpots-1?'true':undefined} data-mine={team.owner_id===user.id?'true':undefined} key={team.id}><span>{index+1}</span><div style={{display:'flex',alignItems:'center',gap:9}}><TeamMark team={team}/><div><b><Link className={styles.teamLink} href={`/fantasy/league/${leagueId}/team/${team.id}`}>{team.name}</Link></b>{/* NO GAMES YET, printed under all nine teams, is the same fact the 0-0-0
        and the 0.0 already carry -- and it cost a line of row height on every
        one of them. The line is rendered only when it distinguishes a team. */}
      {(team.owner_id===user.id||finalGames)&&<small>{team.owner_id===user.id?(index<playoffSpots&&finalGames?`YOUR TEAM · #${index+1} SEED`:'YOUR TEAM'):index<playoffSpots?`PLAYOFF SPOT · #${index+1} SEED`:'IN THE HUNT'}</small>}</div></div><strong>{team.wins}</strong><strong>{team.losses}</strong><strong>{team.ties}</strong><span>{team.pointsFor.toFixed(1)}</span><span>{team.pointsAgainst.toFixed(1)}</span></div>)}</section>}

// ── THE BRACKET (2026-09-24) ──────────────────────────────────────────────
// Four teams, Weeks 15-16: semifinals 1v4 and 2v3, then the championship and
// a 3rd-place game. Before Week 14 is final it shows the field as it stands
// ("if the season ended today"), so the race has something to look at.
function Playoffs({bracket,table,playoffSpots,startWeek,teams,leagueId,user,finalGames}){
  const teamOf=(id)=>teams.find((team)=>team.id===id)
  const seedOf=(id)=>{const i=table.findIndex((t)=>t.id===id);return i<0?null:i+1}
  const by=(round)=>bracket.filter((g)=>g.round===round).sort((a,b)=>(a.home_seed||9)-(b.home_seed||9))
  const semis=by('semifinal'), finals=by('final'), third=by('third_place')
  const winnerOf=(g)=>g&&g.status==='final'?(Number(g.home_score)>=Number(g.away_score)?g.home_team_id:g.away_team_id):null
  const champ=winnerOf(finals[0])
  const Side=({id,seed,score,won,show})=>{const t=teamOf(id);return <div className={styles.bracketSide} data-won={won?'true':undefined} data-mine={t?.owner_id===user.id?'true':undefined}>
    <span className={styles.bracketSeed}>{seed?`#${seed}`:''}</span>
    <Link className={styles.teamLink} href={`/fantasy/league/${leagueId}/team/${id}`}>{t?.name||'TBD'}</Link>
    <b>{show?Number(score).toFixed(1):''}</b></div>}
  const Game=({g,label})=>{const w=winnerOf(g);const show=g&&g.status!=='scheduled';return <article className={styles.bracketGame}>
    <small>{label} · WEEK {g?.week}{g?.status==='live'?' · LIVE':g?.status==='final'?' · FINAL':''}</small>
    {g?<><Side id={g.home_team_id} seed={g.home_seed} score={g.home_score} won={w===g.home_team_id} show={show}/><Side id={g.away_team_id} seed={g.away_seed} score={g.away_score} won={w===g.away_team_id} show={show}/></>:<p className={styles.emptyRoom}>Set when the semifinals are final.</p>}
    {g&&<Link className={styles.bracketLink} href={`/fantasy/league/${leagueId}/matchup?week=${g.week}&matchup=${g.id}`}>Open matchup ›</Link>}
  </article>}
  if(!playoffSpots)return <section className={styles.standings}><p className={styles.emptyRoom}>This league has no playoffs.</p></section>
  if(!semis.length&&!finals.length){
    const field=table.slice(0,playoffSpots)
    return <section className={styles.standings}>
      <div className={styles.boardHead}><div><p className={styles.panelLabel}>PLAYOFFS · WEEKS {startWeek}-{startWeek+1}</p><h2>{finalGames?'If the season ended today':'The field is set after Week 14'}</h2></div><span>Top {playoffSpots} make it</span></div>
      <p className={styles.boardNote}>Four teams. Week {startWeek}: #1 vs #4 and #2 vs #3, higher seed at home. Week {startWeek+1}: the championship and a 3rd-place game. Seeds follow the standings (win %, then wins, then points for); a tied playoff game goes to the higher seed.</p>
      {finalGames>0&&<div className={styles.bracketGrid}>
        <article className={styles.bracketGame}><small>SEMIFINAL · PROJECTED</small><Side id={field[0]?.id} seed={1}/><Side id={field[3]?.id} seed={4}/></article>
        <article className={styles.bracketGame}><small>SEMIFINAL · PROJECTED</small><Side id={field[1]?.id} seed={2}/><Side id={field[2]?.id} seed={3}/></article>
      </div>}
    </section>
  }
  return <section className={styles.standings}>
    <div className={styles.boardHead}><div><p className={styles.panelLabel}>PLAYOFFS · WEEKS {startWeek}-{startWeek+1}</p><h2>{champ?`${teamOf(champ)?.name} are champions`:'The bracket'}</h2></div><span>{champ?'2026 CHAMPION':'Four teams, two weeks'}</span></div>
    <div className={styles.bracketGrid}>
      {semis.map((g)=><Game key={g.id} g={g} label="SEMIFINAL"/>)}
      <Game g={finals[0]} label="CHAMPIONSHIP"/>
      {third[0]&&<Game g={third[0]} label="3RD PLACE"/>}
    </div>
  </section>
}

function PowerRankings({rankings,teamName,teams=[]}){const teamOf=(id)=>teams.find((team)=>team.id===id);return <section className={styles.powerBoard}><div className={styles.boardHead}><div><p className={styles.panelLabel}>DASH POWER INDEX</p><h2>Power Rankings</h2></div><span>Results · scoring · momentum</span></div>{rankings.map((item)=><article key={item.team_id}><strong>{item.rank}</strong><div><h3 style={{display:'flex',alignItems:'center',gap:8}}><TeamMark size={22} team={teamOf(item.team_id)}/>{teamName(item.team_id)}</h3><p>{item.explanation}</p></div><span>{item.previous_rank?item.previous_rank-item.rank>0?`▲ ${item.previous_rank-item.rank}`:item.previous_rank-item.rank<0?`▼ ${Math.abs(item.previous_rank-item.rank)}`:'—':'NEW'}</span><b>{Number(item.power_score).toFixed(1)}</b></article>)}{!rankings.length&&<p className={styles.leagueEmpty}>Power rankings publish after the commissioner generates a completed week.</p>}</section>}

function WeeklyRecap({recap,awards,teamName,week}){return <><section className={styles.recapHero}><p className={styles.panelLabel}>WEEK {week} RECAP</p><h2>{recap?.headline||'The story is still being written.'}</h2><p>{recap?.summary||'Finalize the week, then generate the recap to publish awards and the latest power rankings.'}</p></section><section className={styles.awardGrid}>{awards.map((award)=><article key={award.id}><span>{award.award_type==='high_score'?'🏆':award.award_type==='closest_win'?'🎯':'💥'}</span><small>{award.title}</small><h3>{teamName(award.team_id)}</h3><p>{award.detail}</p></article>)}</section></>}


// A ranked board of everyone worth owning in this league, free agents included.
// `value` is points per game above the replacement player at that position,
// from this league's own roster settings; `ppg` is the projection people
// recognise. The two disagree constantly, which is the point of showing both.
function PlayerPower({board,leagueId,moreHref,teams,total,sheets={},filters}){
  const owner=(id)=>teams.find((team)=>team.id===id)
  const base=`/fantasy/league/${leagueId}/league?view=players&week=${filters.week}`
  const href=(patch)=>{const f={q:filters.q,pos:filters.pos,own:filters.own,...patch};return `${base}${f.q?`&q=${encodeURIComponent(f.q)}`:''}${f.pos!=='ALL'?`&pos=${f.pos}`:''}${f.own!=='all'?`&own=${f.own}`:''}`}
  const filtered=filters.q||filters.pos!=='ALL'||filters.own!=='all'
  return <section className={styles.powerBoard}>
    <div className={styles.boardHead}><div><p className={styles.panelLabel}>DASH PLAYER INDEX</p><h2>Look up any player</h2></div>
      <form className={styles.playerSearch} action={`/fantasy/league/${leagueId}/league`}><input type="hidden" name="view" value="players"/><input type="hidden" name="week" value={filters.week}/><input type="hidden" name="pos" value={filters.pos}/><input type="hidden" name="own" value={filters.own}/><input aria-label="Search players" name="q" defaultValue={filters.q} placeholder="Player or team (KC)"/><button>Search</button></form></div>
    <div className={styles.positionFilters}>{filters.posList.map((pos)=><Link key={pos} className={filters.pos===pos?styles.positionActive:''} aria-current={filters.pos===pos?'true':undefined} href={href({pos})}>{pos}</Link>)}
      {['all','free','owned'].map((own)=><Link key={own} className={filters.own===own?styles.positionActive:''} aria-current={filters.own===own?'true':undefined} href={href({own})}>{own==='all'?'EVERYONE':own==='free'?'FREE AGENTS':'ROSTERED'}</Link>)}</div>
    <p className={styles.boardNote}>Tap a name for his game log — who he played each week and what he did. Ranked by value over replacement; PPG is his per-game average this season.</p>
    {!board.length&&<p className={styles.emptyRoom}>{filtered?'Nobody matches that search. Clear a filter above.':'The player catalogue has not synced yet.'}</p>}
    {board.map((row,index)=>{
      const team=owner(row.ownerId)
      return <div className={styles.playerRankRow} key={row.player.id}>
        <span className={styles.playerRankNumber}>{index+1}</span>
        <PlayerSheetButton sheet={sheets[row.player.id]} className={styles.playerTap}><span className={styles.playerIdentity}>
          <PlayerFace player={row.player} size={30}/>
          <span><b>{row.player.name}<InjuryTag status={row.player.injury_status}/></b>
            <small style={{color:colorForPosition(row.player.position)}}>{row.player.position} · {row.player.team||'FA'}{sheets[row.player.id]?.next?.opp?` · ${sheets[row.player.id].next.opp}`:''}</small></span>
          <i className={styles.tapHint} aria-hidden="true">›</i>
        </span></PlayerSheetButton>
        <span className={styles.playerRankOwner}>
          {team
            ? <Link className={styles.teamLink} href={`/fantasy/league/${leagueId}/team/${team.id}`}>{team.name}</Link>
            : <em className={styles.freeStatus}>FREE AGENT</em>}
        </span>
        <strong>{row.ppg.toFixed(1)}<i>PPG</i></strong>
        <strong>{row.value >= 0 ? '+' : ''}{row.value.toFixed(1)}<i>VOR</i></strong>
      </div>
    })}
    {board.length>0&&<p className={styles.wireMore}><span>Showing {board.length} of {total}</span>{moreHref&&<Link href={moreHref}>Show 60 more →</Link>}</p>}
  </section>
}

