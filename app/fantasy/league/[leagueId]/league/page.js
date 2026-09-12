import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import styles from '../../../fantasy.module.css'
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

const SEASON=2026

export default async function LeaguePage({params,searchParams}) {
  const [{leagueId},query]=await Promise.all([params,searchParams])
  const view=['standings','power','players','recap'].includes(query?.view)?query.view:'standings'
  const week=Math.min(14,Math.max(1,Number(query?.week)||1))
  const supabase=await createSupabaseServerClient()
  if(!supabase)redirect('/fantasy')
  const {data:{user}}=await supabase.auth.getUser()
  if(!user)redirect('/fantasy')
  const [{data:league},{data:membership},{data:teamRows},{data:matchupRows},{data:rankings},{data:awards},{data:recap}]=await Promise.all([
    supabase.from('fantasy_leagues').select('*').eq('id',leagueId).single(),
    supabase.from('fantasy_league_memberships').select('role').eq('league_id',leagueId).eq('user_id',user.id).single(),
    supabase.from('fantasy_teams').select('*').eq('league_id',leagueId).order('created_at'),
    supabase.from('fantasy_matchups').select('*').eq('league_id',leagueId).eq('season',SEASON).order('week'),
    supabase.from('fantasy_power_rankings').select('*').eq('league_id',leagueId).eq('season',SEASON).eq('week',week).order('rank'),
    supabase.from('fantasy_weekly_awards').select('*').eq('league_id',leagueId).eq('season',SEASON).eq('week',week),
    supabase.from('fantasy_weekly_recaps').select('*').eq('league_id',leagueId).eq('season',SEASON).eq('week',week).maybeSingle(),
  ])
  if(!league||!membership)notFound()
  const teams=teamRows||[]
  const matchups=matchupRows||[]
  const safeRankings=rankings||[]
  const safeAwards=awards||[]
  const table=teams.map((team)=>{const record={...team,wins:0,losses:0,ties:0,pointsFor:0,pointsAgainst:0};matchups.filter((game)=>game.status==='final'&&(game.home_team_id===team.id||game.away_team_id===team.id)).forEach((game)=>{const home=game.home_team_id===team.id;const pf=Number(home?game.home_score:game.away_score);const pa=Number(home?game.away_score:game.home_score);record.pointsFor+=pf;record.pointsAgainst+=pa;if(pf>pa)record.wins+=1;else if(pf<pa)record.losses+=1;else record.ties+=1});return record}).sort((a,b)=>b.wins-a.wins||b.pointsFor-a.pointsFor||b.ties-a.ties)
  const finalGames=matchups.filter((game)=>game.status==='final').length
  const weekFinals=matchups.filter((game)=>game.week===week&&game.status==='final').length
  const playoffSpots=Math.max(2,Math.min(6,Math.floor((teams.length||league.team_count||8)/2)))
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
  const morePlayersHref=`/fantasy/league/${leagueId}/league?view=players&week=${week}&players=${playerLimit+PLAYER_STEP}`

  return <main className={styles.roomApp}>
    <header className={styles.roomHeader}><NetworkSwitch variant="inline"/><div><small>{String(league.status||'').replace('_',' ').toUpperCase()}</small><strong>{league.name}</strong></div><span>{teams.length}/{league.team_count} teams</span></header>
    <LeagueNav leagueId={leagueId} active="league" isCommissioner={league.commissioner_id === user.id} className={styles.roomNav} activeClassName={styles.roomActive} />
    <div className={styles.roomBody}>
      {(query?.error||query?.message)&&<p className={query.error?styles.error:styles.message}>{query.error||query.message}</p>}
      <section className={styles.leagueHero}><div><p className={styles.panelLabel}>LEAGUE HQ</p><h1>{league.name}</h1><p>{String(league.scoring||'ppr').replace('_','-').toUpperCase()} · {league.team_count} teams</p><InviteCode className={styles.leagueInvite} code={league.invite_code} />{league.commissioner_id===user.id&&<Link className={styles.leagueSettingsLink} href={`/fantasy/league/${leagueId}/settings`}>⚙ Open Commissioner Control Room</Link>}</div><div className={styles.roomStats}><span><small>MEMBERS</small><b>{teams.length}</b></span><span><small>GAMES</small><b>{matchups.length}</b></span><span><small>FINAL</small><b>{finalGames}</b></span></div></section>
      <div className={styles.leagueViews}><Link className={view==='standings'?styles.leagueViewActive:''} href={`/fantasy/league/${leagueId}/league?view=standings&week=${week}`}>Standings</Link><Link className={view==='players'?styles.leagueViewActive:''} href={`/fantasy/league/${leagueId}/league?view=players&week=${week}`}>Players</Link><Link className={view==='power'?styles.leagueViewActive:''} href={`/fantasy/league/${leagueId}/league?view=power&week=${week}`}>Power Rankings</Link><Link className={view==='recap'?styles.leagueViewActive:''} href={`/fantasy/league/${leagueId}/league?view=recap&week=${week}`}>Weekly Recap</Link><form><input type="hidden" name="view" value={view}/><select name="week" defaultValue={week}>{Array.from({length:14},(_,i)=>i+1).map((number)=><option value={number} key={number}>Week {number}</option>)}</select><button>Go</button></form></div>
      {league.commissioner_id===user.id&&view!=='standings'&&<section className={styles.commishBar}><div><p className={styles.panelLabel}>WEEKLY PUBLISHER</p><strong>{weekFinals?`${weekFinals} final games available`:`Week ${week} still needs final scores`}</strong></div><form action={generateWeeklyContent}><input type="hidden" name="leagueId" value={leagueId}/><input type="hidden" name="week" value={week}/><SubmitButton disabled={!weekFinals} pendingLabel="Generating…">Generate Week {week}</SubmitButton></form></section>}
      {view==='standings'&&<Standings leagueId={leagueId} finalGames={finalGames} playoffSpots={playoffSpots} table={table} user={user}/>}
      {view==='power'&&<PowerRankings rankings={safeRankings} teamName={teamName} teams={teams}/>}
      {view==='players'&&<PlayerPower board={shownPlayerBoard} leagueId={leagueId} moreHref={playerBoard.length>shownPlayerBoard.length?morePlayersHref:null} teams={teams} total={playerBoard.length}/>}
      {view==='recap'&&<WeeklyRecap recap={recap} awards={safeAwards} teamName={teamName} week={week}/>}
    </div>
  </main>
}

function Standings({finalGames,leagueId,playoffSpots,table,user}){return <section className={styles.standings}><div className={styles.boardHead}><div><p className={styles.panelLabel}>2026 REGULAR SEASON</p><h2>Standings</h2></div><span>W-L-T · Points</span></div><div className={styles.standingHead}><span>RK</span><span>TEAM</span><span>W</span><span>L</span><span>T</span><span>PF</span><span>PA</span></div>{table.map((team,index)=><div className={styles.standingRow} data-cut={finalGames&&index===playoffSpots-1?'true':undefined} data-mine={team.owner_id===user.id?'true':undefined} key={team.id}><span>{index+1}</span><div style={{display:'flex',alignItems:'center',gap:9}}><TeamMark team={team}/><div><b><Link className={styles.teamLink} href={`/fantasy/league/${leagueId}/team/${team.id}`}>{team.name}</Link></b>{/* NO GAMES YET, printed under all nine teams, is the same fact the 0-0-0
        and the 0.0 already carry -- and it cost a line of row height on every
        one of them. The line is rendered only when it distinguishes a team. */}
      {(team.owner_id===user.id||finalGames)&&<small>{team.owner_id===user.id?'YOUR TEAM':index<playoffSpots?'IN THE FIELD':'IN THE HUNT'}</small>}</div></div><strong>{team.wins}</strong><strong>{team.losses}</strong><strong>{team.ties}</strong><span>{team.pointsFor.toFixed(1)}</span><span>{team.pointsAgainst.toFixed(1)}</span></div>)}</section>}

function PowerRankings({rankings,teamName,teams=[]}){const teamOf=(id)=>teams.find((team)=>team.id===id);return <section className={styles.powerBoard}><div className={styles.boardHead}><div><p className={styles.panelLabel}>DASH POWER INDEX</p><h2>Power Rankings</h2></div><span>Results · scoring · momentum</span></div>{rankings.map((item)=><article key={item.team_id}><strong>{item.rank}</strong><div><h3 style={{display:'flex',alignItems:'center',gap:8}}><TeamMark size={22} team={teamOf(item.team_id)}/>{teamName(item.team_id)}</h3><p>{item.explanation}</p></div><span>{item.previous_rank?item.previous_rank-item.rank>0?`▲ ${item.previous_rank-item.rank}`:item.previous_rank-item.rank<0?`▼ ${Math.abs(item.previous_rank-item.rank)}`:'—':'NEW'}</span><b>{Number(item.power_score).toFixed(1)}</b></article>)}{!rankings.length&&<p className={styles.leagueEmpty}>Power rankings publish after the commissioner generates a completed week.</p>}</section>}

function WeeklyRecap({recap,awards,teamName,week}){return <><section className={styles.recapHero}><p className={styles.panelLabel}>WEEK {week} RECAP</p><h2>{recap?.headline||'The story is still being written.'}</h2><p>{recap?.summary||'Finalize the week, then generate the recap to publish awards and the latest power rankings.'}</p></section><section className={styles.awardGrid}>{awards.map((award)=><article key={award.id}><span>{award.award_type==='high_score'?'🏆':award.award_type==='closest_win'?'🎯':'💥'}</span><small>{award.title}</small><h3>{teamName(award.team_id)}</h3><p>{award.detail}</p></article>)}</section></>}


// A ranked board of everyone worth owning in this league, free agents included.
// `value` is points per game above the replacement player at that position,
// from this league's own roster settings; `ppg` is the projection people
// recognise. The two disagree constantly, which is the point of showing both.
function PlayerPower({board,leagueId,moreHref,teams,total}){
  const owner=(id)=>teams.find((team)=>team.id===id)
  return <section className={styles.powerBoard}>
    <div className={styles.boardHead}><div><p className={styles.panelLabel}>DASH PLAYER INDEX</p><h2>Player power rankings</h2></div><span>Value over replacement</span></div>
    {!board.length&&<p className={styles.emptyRoom}>The player catalogue has not synced yet.</p>}
    {board.map((row,index)=>{
      const team=owner(row.ownerId)
      return <div className={styles.playerRankRow} key={row.player.id}>
        <span className={styles.playerRankNumber}>{index+1}</span>
        <div className={styles.playerIdentity}>
          <PlayerFace player={row.player} size={30}/>
          <span><b>{row.player.name}<InjuryTag status={row.player.injury_status}/></b>
            <small style={{color:colorForPosition(row.player.position)}}>{row.player.position} · {row.player.team||'FA'}</small></span>
        </div>
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
