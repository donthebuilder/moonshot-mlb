import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import { byeTeamsFor, isOnBye } from '../../../../../lib/fantasy/bye'
import { fantasyPointsFromStats, projectedFantasyPoints } from '../../../../../lib/fantasy/scoring'
import { formatOdds, matchupOdds, oddsSentence } from '../../../../../lib/fantasy/odds'
import LiveMatchupCenter from '../../../../../components/fantasy/LiveMatchupCenter'
import LocalTime from '../../../../../components/fantasy/LocalTime'
import SubmitButton from '../../../../../components/fantasy/SubmitButton'
import { resolveFantasyWeek } from '../../../../../lib/fantasy/week'
import PlayerFace from '../../../../../components/fantasy/PlayerFace'
import PlayerMeta from '../../../../../components/fantasy/PlayerMeta'
import InjuryTag from '../../../../../components/fantasy/InjuryTag'
import { teamScheduleFor } from '../../../../../lib/fantasy/schedule'
import styles from '../../../fantasy.module.css'
import TeamMark from '../../../../../components/fantasy/TeamMark'
import { generateSchedule } from './actions'
import NetworkSwitch from '../../../../../components/NetworkSwitch'
import LeagueNav from '../../../../../components/fantasy/LeagueNav'

const SEASON = 2026

export default async function MatchupPage({ params, searchParams }) {
  const [{leagueId},query] = await Promise.all([params,searchParams])
  const supabase = await createSupabaseServerClient()
  if (!supabase) redirect('/fantasy')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/fantasy')
  const week = await resolveFantasyWeek(supabase, query?.week)
  const [{ data: league }, { data: membership }, { data: teamRows }, { data: matchupRows }, {data:nflGameRows}, {data:latestSync}] = await Promise.all([
    supabase.from('fantasy_leagues').select('*').eq('id',leagueId).single(),
    supabase.from('fantasy_league_memberships').select('role').eq('league_id',leagueId).eq('user_id',user.id).single(),
    supabase.from('fantasy_teams').select('*').eq('league_id',leagueId).order('created_at'),
    supabase.from('fantasy_matchups').select('*').eq('league_id',leagueId).eq('season',SEASON).eq('week',week),
    supabase.from('nfl_week_games').select('*').eq('season',SEASON).eq('week',week).order('kickoff'),
    supabase.from('fantasy_scoring_sync_runs').select('completed_at,status').order('started_at',{ascending:false}).limit(1).maybeSingle(),
  ])
  if (!league || !membership) notFound()
  const teams = teamRows || []
  const matchups = matchupRows || []
  const nflGames = nflGameRows || []
  const myTeam = teams.find((team)=>team.owner_id===user.id)
  const myMatchup = matchups.find((game)=>game.home_team_id===myTeam?.id||game.away_team_id===myTeam?.id)
  // Any game in "Around the League" opens here now (2026-09-12, Donovan: "the
  // ability to look at the different matchups") -- ?matchup=<id> picks which
  // one is featured; the default with no param is still your own matchup, or
  // the first one if you don't have a team yet.
  const requestedMatchup = query?.matchup ? matchups.find((game)=>String(game.id)===String(query.matchup)) : null
  const featured = requestedMatchup || myMatchup || matchups[0]
  // NINE TEAMS, FOUR GAMES (2026-09-14). An odd league pairs one team with
  // nobody each week (generate_fantasy_schedule appends a null slot), and this
  // page fell through to matchups[0] and featured a stranger's game as if it
  // were yours, with nothing saying why. Idle is a fact worth one line.
  const idleTeams = teams.filter((team)=>!matchups.some((game)=>game.home_team_id===team.id||game.away_team_id===team.id))
  const iAmIdle = Boolean(myTeam && matchups.length && !myMatchup)
  const home = teams.find((team)=>team.id===featured?.home_team_id)
  const away = teams.find((team)=>team.id===featured?.away_team_id)
  // EVERY TEAM'S STARTERS, not just the featured pair (2026-09-07). The extra
  // rows are what price the rest of the league's games: nine teams times nine
  // starters is 81 rows on one query that was already being made, and without
  // them "AROUND THE LEAGUE" is a list of names with no idea who is favoured.
  let lineups = []
  if (featured && teams.length) {
    const { data = [] } = await supabase.from('fantasy_lineup_slots')
      .select('*,player:nfl_players(id,name,position,team,injury_status,source_payload,source_player_id)')
      .in('team_id',teams.map((team)=>team.id)).eq('season',SEASON).eq('week',week)
      .not('slot','in','(BENCH,IR)').order('slot_index')
    lineups = data || []
  }
  const homeLineup = lineups.filter((row)=>row.team_id===home?.id)
  const awayLineup = lineups.filter((row)=>row.team_id===away?.id)
  // Live stats are only ever rendered for the featured game's two lineups, so
  // only those player ids go to nfl_player_week_stats. Pricing the other games
  // needs projections, which come off the player row already in hand.
  const playerIds=[...homeLineup,...awayLineup].map((row)=>row.player_id).filter(Boolean)
  let weeklyStats=[]
  if(playerIds.length){const {data=[]}=await supabase.from('nfl_player_week_stats').select('player_id,game_id,stats,status,updated_at').in('player_id',playerIds).eq('season',SEASON).eq('week',week);weeklyStats=data||[]}
  const statsByPlayer=new Map(weeklyStats.map((item)=>[item.player_id,item]))
  // Null when the slate is too thin to be sure -- never "nobody is on bye".
  const byeTeams=byeTeamsFor(nflGames)
  const schedule=teamScheduleFor(nflGames)
  const withLiveScores=(rows)=>rows.map((row)=>({...row,weekStats:statsByPlayer.get(row.player_id)}))
  const scoredHomeLineup=withLiveScores(homeLineup)
  const scoredAwayLineup=withLiveScores(awayLineup)
  // A starter on bye contributed a full projection to this total, so a matchup
  // could be projected 118-112 when eleven of those points belonged to players
  // who were not going to be on a field. See lib/fantasy/bye.js.
  const projectOne = (row) => isOnBye(row.player, byeTeams) ? 0 : projectedFantasyPoints(row.player, league.scoring)
  const homeProjection = homeLineup.reduce((sum,row)=>sum+projectOne(row),0)
  const awayProjection = awayLineup.reduce((sum,row)=>sum+projectOne(row),0)
  const projectionByTeam = new Map()
  for (const row of lineups) projectionByTeam.set(row.team_id, (projectionByTeam.get(row.team_id)||0) + projectOne(row))
  const oddsFor = (game) => matchupOdds(projectionByTeam.get(game.home_team_id)||0, projectionByTeam.get(game.away_team_id)||0)
  const featuredOdds = featured ? matchupOdds(homeProjection, awayProjection) : null

  // Slot-by-slot pairing for the duel board above. Points come from the same
  // two rules the lineups use: a live/final game reads the real stat line, a
  // scheduled one reads the projection, and a man on bye is zero either way.
  //
  // ACTIVE MEANS THE GAME HAS STARTED, NOT THAT HE HAS A STAT LINE (2026-09-14).
  // This used to require both, so a starter who did not play in a FINAL game
  // -- inactive, a healthy scratch, a kicker who never kicked -- had an empty
  // line, failed the check, and fell through to his PROJECTION: the duel board
  // credited him 14 points the hero score (summed in SQL off the real line, so
  // 0) did not, and the two disagreed by exactly his projection. Once kickoff
  // has happened the real number is the number, and for him it is 0.0.
  const pointsForRow = (row) => {
    if (!row?.player) return 0
    if (isOnBye(row.player, byeTeams)) return 0
    return rowIsActive(row) ? fantasyPointsFromStats(row.weekStats?.stats || {}, league.scoring) : projectedFantasyPoints(row.player, league.scoring)
  }
  // Paired BY POSITION WITHIN THE SLOT NAME, not by slot_index. Keying on
  // `${slot}#${slot_index}` looks equivalent and is not: a null or duplicated
  // index collapses RB1 and RB2 into one key and one of the two men vanishes
  // from the board with nothing to show it happened. Grouping and then zipping
  // cannot lose a row -- the longer side decides how many there are, and the
  // shorter side pairs against Empty.
  const groupBySlot = (rows) => {
    const out = new Map()
    for (const row of rows) {
      if (!out.has(row.slot)) out.set(row.slot, [])
      out.get(row.slot).push(row)
    }
    for (const list of out.values()) list.sort((a, b) => (a.slot_index || 0) - (b.slot_index || 0))
    return out
  }
  const homeSlots = groupBySlot(scoredHomeLineup)
  const awaySlots = groupBySlot(scoredAwayLineup)
  const duels = featured ? [...new Set([...homeSlots.keys(), ...awaySlots.keys()])].flatMap((slot) => {
    const hs = homeSlots.get(slot) || []
    const as = awaySlots.get(slot) || []
    return Array.from({ length: Math.max(hs.length, as.length) }, (_, i) => {
      const h = hs[i]
      const a = as[i]
      const homePoints = pointsForRow(h)
      const awayPoints = pointsForRow(a)
      return {
        key: `${slot}#${i}`,
        slot: `${slot}${i > 0 ? i + 1 : ''}`,
        homeName: h?.player?.name || 'Empty',
        awayName: a?.player?.name || 'Empty',
        homePoints, awayPoints,
        edge: Math.round((homePoints - awayPoints) * 10) / 10,
      }
    })
  }).sort((x, y) => Math.abs(y.edge) - Math.abs(x.edge)) : []
  const hasLiveGames=nflGames.some((game)=>game.status==='live')
  // THE WEEK IS IN PROGRESS ONCE ANY GAME HAS STARTED (2026-09-14). The
  // matchup row's own status comes from SQL and said 'scheduled' on a Sunday
  // night with fifteen finals (fixed in migration 202609140300, but a page
  // must not print dashes over real scores while a migration waits). The
  // games are already loaded here, so the page decides for itself.
  const weekStarted=nflGames.some((game)=>game.status==='live'||game.status==='final')
  const weekFinal=nflGames.length>0&&nflGames.every((game)=>game.status==='final')
  const stateOf=(game)=>weekFinal?'final':weekStarted?'live':(game?.status||'scheduled')
  const featuredState=featured?stateOf(featured):'scheduled'
  // 🐛 the margin bar and its legend read homeShare/leader/margin, but nothing
  // in this file ever computed them -- a ReferenceError on every render where
  // `featured` is set, i.e. any league with a schedule (Donovan, 2026-08-29:
  // "the matchup page broke"; a draft in progress was not the cause -- this
  // throws whether the draft is done or not, the instant a schedule exists).
  // Mirrors the scheduled-vs-live split the legend text already made: before
  // kickoff the bar reads on the season projection, live/final reads on the
  // real score, so the fill and the sentence next to it always agree.
  const featuredHomeScore = featured ? (featuredState==='scheduled' ? homeProjection : Number(featured.home_score)) : 0
  const featuredAwayScore = featured ? (featuredState==='scheduled' ? awayProjection : Number(featured.away_score)) : 0
  const featuredTotal = featuredHomeScore + featuredAwayScore
  const homeShare = featuredTotal > 0 ? Math.min(100, Math.max(0, (featuredHomeScore / featuredTotal) * 100)) : 50
  const leader = featuredHomeScore === featuredAwayScore ? null : (featuredHomeScore > featuredAwayScore ? home?.name : away?.name)
  const margin = Math.abs(featuredHomeScore - featuredAwayScore)

  return <main className={styles.roomApp}>
    <header className={styles.roomHeader}><NetworkSwitch variant="inline"/><div><small>WEEK {week}</small><strong>{league.name}</strong></div><span>{matchups.length} matchups</span></header>
    <LeagueNav leagueId={leagueId} active="matchup" isCommissioner={league.commissioner_id === user.id} className={styles.roomNav} activeClassName={styles.roomActive} />
    <div className={styles.roomBody}>
      {(query?.error||query?.message)&&<p className={query.error?styles.error:styles.message}>{query.error||query.message}</p>}
      {iAmIdle&&!requestedMatchup&&<p className={styles.message}>{myTeam.name} is idle in Week {week} — nine teams, four games, one sits. Showing {home?.name} vs {away?.name}; your record doesn&apos;t move this week.</p>}
      <LiveMatchupCenter leagueId={leagueId} live={hasLiveGames} lastUpdated={latestSync?.completed_at}/>
      <div className={styles.weekStrip}>{Array.from({length:14},(_,i)=>i+1).map((number)=><Link className={number===week?styles.weekActive:''} href={`/fantasy/league/${leagueId}/matchup?week=${number}`} key={number}>W{number}</Link>)}</div>
      {!featured && <section className={styles.scheduleEmpty}><span>VS</span><div><p className={styles.panelLabel}>SEASON SCHEDULE</p><h1>Your matchups are ready to be built.</h1><p>Franchise creates a balanced 14-week round-robin schedule from the teams currently in this league.</p></div>{league.commissioner_id===user.id?<form action={generateSchedule}><input type="hidden" name="leagueId" value={leagueId}/><SubmitButton pendingLabel="Building…">Create schedule</SubmitButton></form>:<small>Waiting for the commissioner</small>}</section>}
      {featured && <>
        <section className={styles.matchupHero}><div><small>HOME</small><h1 style={{display:'flex',alignItems:'center',gap:10}}><TeamMark size={30} team={home}/>{home?.name}</h1><strong>{featuredState==='scheduled'?'—':Number(featured.home_score).toFixed(2)}</strong><em>{homeProjection.toFixed(1)} projected</em></div><span><b>WEEK {week}</b><i>{featuredState==='live'&&!hasLiveGames?'IN PROGRESS':featuredState.toUpperCase()}</i></span><div><small>AWAY</small><h1 style={{display:'flex',alignItems:'center',gap:10}}><TeamMark size={30} team={away}/>{away?.name}</h1><strong>{featuredState==='scheduled'?'—':Number(featured.away_score).toFixed(2)}</strong><em>{awayProjection.toFixed(1)} projected</em></div></section>
        <section className={styles.marginBar} data-live={featuredState==='live'&&hasLiveGames?'true':undefined}>
          <div className={styles.marginTrack}><i style={{ width: `${homeShare}%` }}/><b style={{ left: `${homeShare}%` }}/></div>
          <div className={styles.marginLegend}>
            <span>{home?.name}</span>
            <em>{featuredState==='scheduled' ? `${Math.abs(homeProjection-awayProjection).toFixed(1)} projected margin` : (leader ? `${leader} by ${margin.toFixed(2)}` : `Tied, ${margin.toFixed(2)}`)}</em>
            <span>{away?.name}</span>
          </div>
        </section>
        <NflGameStrip games={nflGames} week={week}/>
        {/* THE LINE (2026-09-07). Donovan: "add like betting odds moneyline for
            fun and like a spread type thing." Nothing is staked on these; the
            note under them says where the number comes from and where it does
            not, because a price that looks certain is the easiest way to lie
            with arithmetic. Only shown before kickoff -- once a game is live
            the real score is the story and a pre-game line beside it is
            clutter. See lib/fantasy/odds.js. */}
        {featuredOdds && featuredState==='scheduled' && <section className={styles.oddsCard}>
          <div className={styles.boardHead}><div><p className={styles.panelLabel}>THE LINE · JUST FOR FUN</p><h2>{featuredOdds.pickEm ? 'Pick em' : `${(featuredOdds.spread>0?home:away)?.name} by ${Math.abs(featuredOdds.spread)}`}</h2></div><span>NO VIG</span></div>
          <div className={styles.oddsGrid}>
            <div><small>{home?.name}</small><b>{featuredOdds.homeSpreadLabel}</b><em>{formatOdds(featuredOdds.homeOdds)}</em><i>{Math.round(featuredOdds.homeWinProbability*100)}% to win</i></div>
            <div><small>{away?.name}</small><b>{featuredOdds.awaySpreadLabel}</b><em>{formatOdds(featuredOdds.awayOdds)}</em><i>{Math.round(featuredOdds.awayWinProbability*100)}% to win</i></div>
            <div><small>TOTAL</small><b>{featuredOdds.total}</b><em>O/U</em><i>both projections added up</i></div>
          </div>
          <p className={styles.oddsNote}>{oddsSentence(featuredOdds, home?.name, away?.name)} The spread is the projected margin. The moneyline also assumes a fantasy team lands within about 25 points of its projection in a week — a stated figure, not one measured off this league, which has not played a game yet.</p>
        </section>}
        {/* ── SLOT BY SLOT (2026-09-07) ───────────────────────────────────
            Donovan: "let's turn up the matchup page." Two lineups side by side
            is a pair of lists; a matchup is a set of duels, and nothing on the
            page said which of them you were winning. This pairs the two teams
            by slot -- QB against QB, FLEX against FLEX -- and sorts by the size
            of the gap, so the row that decides the week is the first one you
            read instead of the one that happens to be QB.

            Live where there are live numbers, projected before kickoff, using
            exactly the same points the lineups below print. A slot where one
            side has nobody is still shown: an empty starting slot is the
            biggest edge on the board and hiding it would be the one thing this
            section must not do. */}
        {Boolean(duels.length) && <section className={styles.duelBoard}>
          <div className={styles.boardHead}><div><p className={styles.panelLabel}>SLOT BY SLOT</p><h2>Where this is won</h2></div><span>{featuredState==='scheduled'?'projected':'live'}</span></div>
          {duels.map((duel)=>(
            <div className={styles.duelRow} key={duel.key} data-side={duel.edge > 0 ? 'home' : duel.edge < 0 ? 'away' : undefined}>
              <div className={styles.duelName} data-win={duel.edge > 0 ? 'true' : undefined}>
                <b>{duel.homeName}</b><small>{duel.homePoints.toFixed(1)}</small>
              </div>
              <div className={styles.duelSlot}>
                <span>{duel.slot}</span>
                <i>{duel.edge === 0 ? 'even' : `${duel.edge > 0 ? '+' : ''}${duel.edge.toFixed(1)}`}</i>
              </div>
              <div className={styles.duelName} data-win={duel.edge < 0 ? 'true' : undefined} data-away="true">
                <b>{duel.awayName}</b><small>{duel.awayPoints.toFixed(1)}</small>
              </div>
            </div>
          ))}
        </section>}
        <div className={styles.matchupGrid}><Lineup title={home?.name} rows={scoredHomeLineup} scoring={league.scoring} byeTeams={byeTeams} schedule={schedule}/><Lineup title={away?.name} rows={scoredAwayLineup} scoring={league.scoring} byeTeams={byeTeams} schedule={schedule}/></div>
        <section className={styles.weekGames}><div className={styles.boardHead}><div><p className={styles.panelLabel}>AROUND THE LEAGUE</p><h2>Week {week}</h2></div><span>{matchups.length} games</span></div>{matchups.map((game)=><div className={styles.weekGame} key={game.id}><b style={{display:'flex',alignItems:'center',gap:7,minWidth:0}}><TeamMark size={20} team={teams.find((team)=>team.id===game.home_team_id)}/><Link className={styles.teamLink} href={`/fantasy/league/${leagueId}/team/${game.home_team_id}`} style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{teams.find((team)=>team.id===game.home_team_id)?.name}</Link></b><Link href={`/fantasy/league/${leagueId}/matchup?week=${week}&matchup=${game.id}`} className={`${styles.gameCell}${featured?.id===game.id?` ${styles.gameCellActive}`:''}`}>{stateOf(game)==='scheduled'?(()=>{const o=oddsFor(game);return o?<><i className={styles.gameLine}>{o.pickEm?'PK':`${(o.spread>0?teams.find((t)=>t.id===game.home_team_id):teams.find((t)=>t.id===game.away_team_id))?.name} ${-Math.abs(o.spread)}`}</i><em className={styles.gameTotal}>O/U {o.total}</em></>:'vs'})():`${Number(game.home_score).toFixed(1)} — ${Number(game.away_score).toFixed(1)}`}</Link><b style={{display:'flex',alignItems:'center',gap:7,minWidth:0,justifyContent:'flex-end'}}><Link className={styles.teamLink} href={`/fantasy/league/${leagueId}/team/${game.away_team_id}`} style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{teams.find((team)=>team.id===game.away_team_id)?.name}</Link><TeamMark size={20} team={teams.find((team)=>team.id===game.away_team_id)}/></b></div>)}{Boolean(idleTeams.length)&&<p className={styles.emptyRoom}>Idle this week: {idleTeams.map((team)=>team.name).join(', ')}</p>}</section>
      </>}
    </div>
  </main>
}

// A row is scoring for real once its game has kicked off. An empty stat line
// in a live or final game is a real 0.0, not "pending" -- see pointsForRow.
const rowIsActive = (row) => Boolean(row?.weekStats?.status && row.weekStats.status !== 'scheduled')

function Lineup({ title, rows, scoring, byeTeams, schedule }) {
  return <section className={styles.matchupLineup}><div className={styles.boardHead}><div><p className={styles.panelLabel}>STARTING LINEUP</p><h2>{title}</h2></div><span>{rows.length} set</span></div>{rows.map((row)=>{const active=rowIsActive(row);const bye=isOnBye(row.player,byeTeams);const points=fantasyPointsFromStats(row.weekStats?.stats||{},scoring);return <div className={styles.matchupPlayer} key={row.id}><span>{row.slot}</span><div className={styles.playerIdentity}><PlayerFace player={row.player} size={30}/><span><b>{row.player?.name}<InjuryTag status={row.player?.injury_status}/></b><PlayerMeta player={row.player} game={schedule?.get(String(row.player?.team||'').toUpperCase())} bye={bye}/></span></div><span className={styles.playerState} data-state={bye?'bye':active?row.weekStats.status:'projected'}>{bye?'BYE':active?String(row.weekStats.status).toUpperCase():'PROJ'}</span><strong className={active&&!bye?styles.livePlayerScore:''}>{bye?'0.0':(active?points:projectedFantasyPoints(row.player,scoring)).toFixed(1)}</strong></div>})}{!rows.length&&<p className={styles.emptyRoom}>No starters have been set for this week.</p>}</section>
}

// ── #81: TWO PRODUCTS IN ONE NETWORK, DISAGREEING ABOUT THE SCHEDULE ────────
//
// This panel read "The NFL slate has not published games for this week yet"
// while TUDDY's Games tab had the same week fully populated -- NE @ SEA 9/9,
// SF @ LA 9/10, TB @ CIN 9/13, twelve more. A commissioner reading FRANCHISE
// concluded the season had not been posted.
//
// Both statements were made in good faith about different things. TUDDY reads
// the slate JSON directly. FRANCHISE reads `nfl_week_games` in Supabase, which
// is filled by /api/fantasy/scoring. So an empty panel means "this week has not
// synced here yet," which is a fact about a pipeline, not about the NFL.
//
// The copy now says the thing that is actually true and names the week it
// looked for, so an empty panel is a lead rather than a false statement. The
// sync runs on a cron, so the honest instruction is to wait, not to go
// looking for a schedule that already exists.
// ── SIXTEEN COPIES OF THE SAME DATE (2026-09-07, from a phone screenshot) ──
// Every card carried its own "Sun, Sep 13" under the teams. Thirteen of the
// sixteen week-1 games are on that Sunday, so the panel spent a third of its
// height, and a full extra line per card on a 390px screen, restating a fact
// the card above had just made. The date moves up to a heading per day and the
// cards keep the one thing that differs: kickoff.
//
// Grouped in EASTERN, deliberately. A server has no viewer zone, and grouping
// in UTC would file a Sunday night kickoff under Monday -- which is the exact
// bug LocalTime was just fixed for. The heading is plain text rather than a
// <LocalTime>: a day heading that re-labels itself after hydration would
// reshuffle nothing and re-render everything.
function NflGameStrip({games, week}) {
  const finals=games.filter((game)=>game.status==='final').length
  const live=games.filter((game)=>game.status==='live')
  const upcoming=games.filter((game)=>game.status==='scheduled')
  if(!games.length)return <p className={styles.gameStrip}><b>NFL WEEK {week}</b><span>No week {week} games have synced to FRANCHISE yet — the schedule arrives with the scoring sync, usually within a few minutes.</span></p>
  return <p className={styles.gameStrip}>
    <b>NFL WEEK {week}</b>
    <span>{finals} of {games.length} final</span>
    {live.map((game)=><em className={styles.gameStripLive} key={game.game_id}>● {game.away_team} at {game.home_team}</em>)}
    {upcoming.slice(0,4).map((game)=><em key={game.game_id}>{game.away_team} at {game.home_team} · <LocalTime value={game.kickoff}/></em>)}
    {upcoming.length>4&&<em>+{upcoming.length-4} more</em>}
    {!live.length&&!upcoming.length&&<em>Week complete</em>}
  </p>
}
