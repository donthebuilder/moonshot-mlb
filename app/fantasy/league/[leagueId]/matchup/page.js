import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../lib/supabase/server'
import { byeTeamsFor, isOnBye } from '../../../../../lib/fantasy/bye'
import { fantasyPointsFromStats } from '../../../../../lib/fantasy/scoring'
import { loadMatchupData, weeklyProjector } from '../../../../../lib/fantasy/matchupProjection'
import { formatOdds, matchupOdds, oddsSentence } from '../../../../../lib/fantasy/odds'
import LiveMatchupCenter from '../../../../../components/fantasy/LiveMatchupCenter'
import LocalTime from '../../../../../components/fantasy/LocalTime'
import SubmitButton from '../../../../../components/fantasy/SubmitButton'
import { resolveFantasyWeek, FANTASY_LAST_WEEK, FANTASY_PLAYOFF_ROUNDS, FANTASY_REGULAR_WEEKS } from '../../../../../lib/fantasy/week'
import PlayerFace from '../../../../../components/fantasy/PlayerFace'
import { PlayerSheetButton } from '../../../../../components/fantasy/PlayerSheet'
import { buildSheetData } from '../../../../../lib/fantasy/sheetEntry'
import PlayerMeta from '../../../../../components/fantasy/PlayerMeta'
import InjuryTag from '../../../../../components/fantasy/InjuryTag'
import { teamScheduleFor } from '../../../../../lib/fantasy/schedule'
import styles from '../../../fantasy.module.css'
import TeamMark from '../../../../../components/fantasy/TeamMark'
import { generateSchedule } from './actions'
import NetworkSwitch from '../../../../../components/NetworkSwitch'
import LeagueNav from '../../../../../components/fantasy/LeagueNav'
import { matchupResult, matchupState, weekStateFromGames, weekStates } from '../../../../../lib/fantasy/matchupState'
import { seasonRecord, streakOf, recentForm, seriesBetween, lastResultFor } from '../../../../../lib/fantasy/receipts'
import { signedInUser } from '../../../../../lib/supabase/authUser'

const SEASON = 2026

export default async function MatchupPage({ params, searchParams }) {
  const [{leagueId},query] = await Promise.all([params,searchParams])
  const supabase = await createSupabaseServerClient()
  if (!supabase) redirect('/fantasy')
  const user=await signedInUser(supabase)
  if (!user) redirect('/fantasy')
  const matchupPromise = loadMatchupData()
  const week = await resolveFantasyWeek(supabase, query?.week)
  const [{ data: league }, { data: membership }, { data: teamRows }, { data: seasonMatchupRows }, {data:nflGameRows}, {data:seasonGameRows}, {data:latestSync}, {data:lineupRows}] = await Promise.all([
    supabase.from('fantasy_leagues').select('*').eq('id',leagueId).single(),
    supabase.from('fantasy_league_memberships').select('role').eq('league_id',leagueId).eq('user_id',user.id).single(),
    supabase.from('fantasy_teams').select('*').eq('league_id',leagueId).order('created_at'),
    // THE WHOLE SEASON, not just this week (2026-09-20). The receipts band
    // needs every finished game to know a record, a streak or a series; a
    // 14-week league is ~56 rows on one indexed read, which is cheaper than
    // the second round trip the week-scoped version used to cost.
    supabase.from('fantasy_matchups').select('*').eq('league_id',leagueId).eq('season',SEASON).order('week'),
    supabase.from('nfl_week_games').select('*').eq('season',SEASON).eq('week',week).order('kickoff'),
    // Slim, season-wide: four columns per game, only ever used to decide
    // which weeks are actually over. fantasy_matchups.status cannot answer
    // that -- see lib/fantasy/matchupState.js.
    supabase.from('nfl_week_games').select('week,status,season_type').eq('season',SEASON),
    supabase.from('fantasy_scoring_sync_runs').select('completed_at,status').order('started_at',{ascending:false}).limit(1).maybeSingle(),
    supabase.from('fantasy_lineup_slots')
      .select('*,player:nfl_players(id,name,position,team,injury_status,source_payload,source_player_id)')
      .eq('league_id',leagueId).eq('season',SEASON).eq('week',week)
      .not('slot','in','(BENCH,IR)').order('slot_index'),
  ])
  if (!league || !membership) notFound()
  const teams = teamRows || []
  const seasonMatchups = seasonMatchupRows || []
  const matchups = seasonMatchups.filter((game)=>Number(game.week)===Number(week))
  const nflGames = nflGameRows || []
  // Every matchup this league has actually finished, decided the same way the
  // scoreboard decides this one. This is the only input the receipts read --
  // no projections, no model, nothing that did not happen. See receipts.js.
  const seasonWeekStates = weekStates(seasonGameRows || [])
  const finals = seasonMatchups.filter((game)=>matchupState(game,seasonWeekStates[Number(game.week)])==='final')
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
  // Was a serial round trip keyed on teams.map(id) -- but fantasy_lineup_slots
  // carries league_id, so it never needed to wait for the teams query at all.
  // It runs in the batch above now (2026-09-20, "everything loads slow").
  const lineups = (featured && teams.length) ? (lineupRows || []) : []
  const homeLineup = lineups.filter((row)=>row.team_id===home?.id)
  const awayLineup = lineups.filter((row)=>row.team_id===away?.id)
  // Live stats are only ever rendered for the featured game's two lineups, so
  // only those player ids go to nfl_player_week_stats. Pricing the other games
  // needs projections, which come off the player row already in hand.
  const playerIds=[...homeLineup,...awayLineup].map((row)=>row.player_id).filter(Boolean)
  // ── THE PLAYER SHEET'S FOUR-WEEK STRIP (2026-09-21) ──────────────────────
  // The page already reads this table for THIS week, which is what the points
  // cell needs. The sheet shows a trend, so it needs the weeks before it too.
  // A second scoped read rather than widening the one above: that query feeds
  // every row's number on first paint and has no business getting four times
  // bigger for a panel nobody has opened.
  const SHEET_WEEKS = 4
  let sheetRows = []
  if (playerIds.length) {
    const { data = [] } = await supabase
      .from('nfl_player_week_stats')
      .select('player_id,week,game_id,stats,status,projected_points,updated_at,game:nfl_week_games(home_team,away_team)')
      .in('player_id', playerIds)
      .eq('season', SEASON)
      .gte('week', Math.max(1, week - (SHEET_WEEKS - 1)))
      .lte('week', week)
    sheetRows = data || []
  }
  // ONE READ, NOT TWO (2026-09-20). This window is gte(week-3)..lte(week), so
  // it already contains THIS week -- which a second query was separately
  // asking the same table for, on the same ids, a round trip earlier.
  const statsByPlayer=new Map(sheetRows.filter((row)=>Number(row.week)===Number(week)).map((item)=>[item.player_id,item]))
  const sheetWeeksByPlayer = {}
  for (const row of sheetRows) (sheetWeeksByPlayer[row.player_id] ||= []).push(row)
  for (const rows of Object.values(sheetWeeksByPlayer)) rows.sort((a, b) => b.week - a.week)
  // Built server-side so the raw weekly stat blobs never cross to the
  // browser -- see lib/fantasy/sheetEntry.js for what that was costing.
  const sheetData = buildSheetData([...homeLineup,...awayLineup].map((row)=>row.player), sheetWeeksByPlayer, league.scoring)

  // Null when the slate is too thin to be sure -- never "nobody is on bye".
  const byeTeams=byeTeamsFor(nflGames)
  const schedule=teamScheduleFor(nflGames)
  // This week's matchup projection (2026-09-23) -- lib/fantasy/matchupProjection.js.
  const projectWeek=weeklyProjector(league.scoring,schedule,await matchupPromise)
  const projectPoints=(player)=>projectWeek(player)?.points ?? 0
  const withLiveScores=(rows)=>rows.map((row)=>({...row,weekStats:statsByPlayer.get(row.player_id)}))
  const scoredHomeLineup=withLiveScores(homeLineup)
  const scoredAwayLineup=withLiveScores(awayLineup)
  // A starter on bye contributed a full projection to this total, so a matchup
  // could be projected 118-112 when eleven of those points belonged to players
  // who were not going to be on a field. See lib/fantasy/bye.js.
  const projectOne = (row) => isOnBye(row.player, byeTeams) ? 0 : projectPoints(row.player)
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
    return rowIsActive(row) ? fantasyPointsFromStats(row.weekStats?.stats || {}, league.scoring) : projectPoints(row.player)
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
  const weekState=weekStateFromGames(nflGames)
  const stateOf=(game)=>matchupState(game,weekState)
  const featuredState=featured?stateOf(featured):'scheduled'
  const result=featured?matchupResult(featured,featuredState):null
  // Starters whose own game has not kicked off yet -- the honest "this can
  // still change" number beside a live score.
  const yetToPlay=(rows)=>rows.filter((row)=>row.player&&!isOnBye(row.player,byeTeams)&&!(row.weekStats?.status&&row.weekStats.status!=='scheduled')).length
  const homeLeft=yetToPlay(scoredHomeLineup)
  const awayLeft=yetToPlay(scoredAwayLineup)
  const nextKick=nflGames.find((game)=>game.status==='scheduled')
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

  // ── THE DRAMA (2026-09-20) ────────────────────────────────────────────────
  // Donovan: "stat wise not really seeing nothing entertaining." A live score
  // on its own does not say whether a lead is safe, and that is the only
  // question anybody is asking on a Sunday. Three facts answer it, and all
  // three are already on this page:
  //
  //   onTable   what the starters who HAVE NOT KICKED OFF are projected for
  //   playing   who is on a field right this second
  //   best      the highest real score on the side so far
  //
  // onTable deliberately counts scheduled starters ONLY. A man in the second
  // quarter has points left too, but nobody can say how many, and guessing
  // would be the invented number rule #16 exists to stop. He is counted in
  // `playing` instead, which is a fact.
  const dramaFor = (rows) => {
    let onTable = 0
    const playing = []
    let best = null
    let done = 0
    for (const row of rows) {
      if (!row.player || isOnBye(row.player, byeTeams)) continue
      const status = row.weekStats?.status || 'scheduled'
      if (status === 'scheduled') { onTable += projectOne(row); continue }
      const points = fantasyPointsFromStats(row.weekStats?.stats || {}, league.scoring)
      if (status === 'live') playing.push({ name: row.player.name, points })
      else done += 1
      if (!best || points > best.points) best = { name: row.player.name, points, live: status === 'live' }
    }
    playing.sort((a, b) => b.points - a.points)
    return { onTable: Math.round(onTable * 10) / 10, playing, best, done }
  }
  const homeDrama = featured ? dramaFor(scoredHomeLineup) : null
  const awayDrama = featured ? dramaFor(scoredAwayLineup) : null
  const dramaLive = featuredState !== 'scheduled' && (homeLeft > 0 || awayLeft > 0 || Boolean(homeDrama?.playing.length) || Boolean(awayDrama?.playing.length))

  // ── THE RECEIPTS (2026-09-20) ─────────────────────────────────────────────
  // What these two have actually done to each other and to everyone else.
  // Empty in week 1 by definition, and the panel says so rather than printing
  // a 0-0 that reads like a result.
  const homeRecord = home ? seasonRecord(finals, home.id) : null
  const awayRecord = away ? seasonRecord(finals, away.id) : null
  const homeStreak = home ? streakOf(finals, home.id) : null
  const awayStreak = away ? streakOf(finals, away.id) : null
  const homeForm = home ? recentForm(finals, home.id) : []
  const awayForm = away ? recentForm(finals, away.id) : []
  // THE GAME YOU ARE LOOKING AT IS NOT A RECEIPT ABOUT ITSELF. Once this week
  // goes final it joins `finals`, which is right for a record -- a 3-1 ought
  // to count the game just played -- and absurd for "last meeting" and "last
  // out", which would then point at the scoreboard six inches above them.
  // Those three lines read the season with this matchup taken out.
  const priorFinals = finals.filter((game) => game.id !== featured?.id)
  const homeLast = home ? lastResultFor(priorFinals, home.id) : null
  const awayLast = away ? lastResultFor(priorFinals, away.id) : null
  const series = home && away ? seriesBetween(priorFinals, home.id, away.id) : null
  const teamName = (id) => teams.find((team) => team.id === id)?.name || 'a bye'
  const hasReceipts = Boolean(homeRecord?.games || awayRecord?.games)

  return <main className={styles.roomApp}>
    <header className={styles.roomHeader}><NetworkSwitch variant="inline"/><div><small>WEEK {week}</small><strong>{league.name}</strong></div><span>{matchups.length} matchups</span></header>
    <LeagueNav leagueId={leagueId} active="matchup" isCommissioner={league.commissioner_id === user.id} className={styles.roomNav} activeClassName={styles.roomActive} />
    <div className={styles.roomBody}>
      {(query?.error||query?.message)&&<p className={query.error?styles.error:styles.message}>{query.error||query.message}</p>}
      {iAmIdle&&!requestedMatchup&&(Number(week)>FANTASY_REGULAR_WEEKS
        ? <p className={styles.message}>{myTeam.name} isn&apos;t in the Week {week} bracket. Showing {home?.name} vs {away?.name} — see the full bracket under <Link href={`/fantasy/league/${leagueId}/league?view=playoffs`}>League › Playoffs</Link>.</p>
        : <p className={styles.message}>{myTeam.name} is idle in Week {week} — nine teams, four games, one sits. Showing {home?.name} vs {away?.name}; your record doesn&apos;t move this week.</p>)}
      {featured?.round&&featured.round!=='regular'&&<p className={styles.message}><b>{FANTASY_PLAYOFF_ROUNDS[featured.round]}</b> · #{featured.home_seed} {home?.name} vs #{featured.away_seed} {away?.name}{featured.round==='final'?' — winner takes the title':''}</p>}
      <LiveMatchupCenter leagueId={leagueId} live={hasLiveGames} lastUpdated={latestSync?.completed_at}/>
      <div className={styles.weekStrip}>{Array.from({length:FANTASY_LAST_WEEK},(_,i)=>i+1).map((number)=><Link className={number===week?styles.weekActive:''} href={`/fantasy/league/${leagueId}/matchup?week=${number}`} key={number} title={number>FANTASY_REGULAR_WEEKS?(number===FANTASY_REGULAR_WEEKS+1?'Playoff semifinals':'Championship week'):undefined}>{number>FANTASY_REGULAR_WEEKS?(number===FANTASY_REGULAR_WEEKS+1?'SEMI':'FINAL'):`W${number}`}</Link>)}</div>
      {!featured && Number(week)>FANTASY_REGULAR_WEEKS && <section className={styles.scheduleEmpty}><span>🏆</span><div><p className={styles.panelLabel}>{Number(week)===FANTASY_REGULAR_WEEKS+1?'PLAYOFF SEMIFINALS':'CHAMPIONSHIP WEEK'}</p><h1>{Number(week)===FANTASY_REGULAR_WEEKS+1?`Set when Week ${FANTASY_REGULAR_WEEKS} is final.`:'Set when the semifinals are final.'}</h1><p>Top four by the standings: #1 vs #4 and #2 vs #3, then the title game. <Link href={`/fantasy/league/${leagueId}/league?view=playoffs`}>See the race →</Link></p></div></section>}
      {!featured && Number(week)<=FANTASY_REGULAR_WEEKS && <section className={styles.scheduleEmpty}><span>VS</span><div><p className={styles.panelLabel}>SEASON SCHEDULE</p><h1>Your matchups are ready to be built.</h1><p>Franchise creates a balanced 14-week round-robin schedule from the teams currently in this league.</p></div>{league.commissioner_id===user.id?<form action={generateSchedule}><input type="hidden" name="leagueId" value={leagueId}/><SubmitButton pendingLabel="Building…">Create schedule</SubmitButton></form>:<small>Waiting for the commissioner</small>}</section>}
      {featured && <>
        {/* ── THE SCOREBOARD (2026-09-14) ─────────────────────────────────
            Donovan: "still can't tell who's winning or losing." The old hero
            printed two equal numbers and a word. This one takes a side: the
            leader's score is lit, the trailer's is dimmed, the middle says
            WINS BY / LEADS BY / a kickoff time, and each side carries how
            many starters still have a game to play -- the one number that
            tells you whether a lead is safe. Nothing decorative. */}
        <div className={styles.scoreStack}>
        <section className={styles.scoreboard} data-state={featuredState}>
          <div className={styles.scoreStatus}>
            <b>WEEK {week}</b>
            <i>{featuredState==='final'?'FINAL':featuredState==='live'?(hasLiveGames?'● LIVE':'IN PROGRESS'):nextKick?<>KICKOFF <LocalTime value={nextKick.kickoff}/></>:'SCHEDULED'}</i>
          </div>
          {[['home',home,result?.home,homeProjection,homeLeft],['away',away,result?.away,awayProjection,awayLeft]].map(([side,team,score,projection,left])=>{
            const ahead=result?.leaderId&&result.leaderId===team?.id
            const behind=result?.leaderId&&result.leaderId!==team?.id
            return <div className={styles.scoreSide} data-side={side} data-ahead={ahead?'true':undefined} data-behind={behind?'true':undefined} key={side}>
              <span className={styles.scoreTeam}><TeamMark size={28} team={team}/><b>{team?.name}</b></span>
              <strong className={styles.scoreNumber}>{featuredState==='scheduled'?projection.toFixed(1):Number(score).toFixed(featuredState==='final'?2:1)}</strong>
              <small className={styles.scoreMeta}>{featuredState==='scheduled'?'projected':featuredState==='final'?(ahead?'WINNER':result?.tie?'TIE':'')||`proj ${projection.toFixed(1)}`:`proj ${projection.toFixed(1)}`}</small>
            </div>
          })}
          <div className={styles.scoreVerdict}>
            {featuredState==='scheduled'
              ? <><em>{Math.abs(homeProjection-awayProjection).toFixed(1)}</em><span>projected margin</span></>
              : result?.tie
              ? <><em>TIED</em><span>{result.home.toFixed(1)} apiece</span></>
              : <><em>{result.margin.toFixed(featuredState==='final'?2:1)}</em><span>{(result.leaderId===home?.id?home:away)?.name} {featuredState==='final'?'wins by':'leads by'}</span></>}
          </div>
        </section>
        {/* The bar and the drama under it are ONE object with the scoreboard
            now (2026-09-20, Donovan: "the matcup page is hella wack
            viusally"). Seven separately-bordered panels stacked down a phone
            read as a list of boxes with no hero; the share of the score and
            what is left to come belong to the score, not to a panel of their
            own. Rule #30: stronger hierarchy, fewer boxes. */}
        <section className={styles.marginBar} data-live={featuredState==='live'&&hasLiveGames?'true':undefined}>
          <div className={styles.marginTrack}><i style={{ width: `${homeShare}%` }}/><b style={{ left: `${homeShare}%` }}/></div>
          <div className={styles.marginLegend}>
            <span>{home?.name}</span>
            <em>{featuredState==='scheduled' ? 'share of projected points' : 'share of points scored'}</em>
            <span>{away?.name}</span>
          </div>
          {dramaLive && <div className={styles.dramaRow}>
            {[[homeDrama,homeLeft,'home'],[awayDrama,awayLeft,'away']].map(([drama,left,side])=>(
              <div className={styles.dramaSide} data-side={side} key={side}>
                <b>{drama.onTable.toFixed(1)}</b>
                <small>proj · {left} yet to play</small>
                {drama.playing.length
                  ? <i className={styles.dramaLive}>● {drama.playing[0].name} {drama.playing[0].points.toFixed(1)}{drama.playing.length>1?` +${drama.playing.length-1}`:''}</i>
                  : drama.best
                  ? <i>Top: {drama.best.name} {drama.best.points.toFixed(1)}</i>
                  : <i>Nobody has scored yet</i>}
              </div>
            ))}
          </div>}
        </section>
        </div>
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
        
        {/* ── THE RECEIPTS (2026-09-20) ───────────────────────────────────
            Donovan: "recipts for sure and drama." A head-to-head with no
            memory gives nobody anything to say. Records, streaks, form and
            the season series between these two -- every figure a sum of
            games this league has already finished (lib/fantasy/receipts.js).
            Nothing here is projected, and in Week 1 it says so instead of
            printing an 0-0 that reads like a result. */}
        <section className={styles.receipts}>
          <div className={styles.boardHead}>
            <div><p className={styles.panelLabel}>THE RECEIPTS</p><h2>{series?.games.length?`They have met ${series.games.length===1?'once':`${series.games.length} times`}`:'What they have actually done'}</h2></div>
            <span>{finals.length} finished</span>
          </div>
          {hasReceipts ? <>
            <div className={styles.receiptCols}>
              {[[home,homeRecord,homeStreak,homeForm,series?.aWins,'home'],[away,awayRecord,awayStreak,awayForm,series?.bWins,'away']].map(([team,record,streak,form,headToHead,side])=>(
                <div className={styles.receiptCol} data-side={side} key={side}>
                  <span className={styles.receiptTeam}><TeamMark size={22} team={team}/><b>{team?.name}</b></span>
                  <strong>{record.label}</strong>
                  <div className={styles.formStrip}>
                    {form.length
                      ? [...form].reverse().map((game)=><u data-out={game.outcome} key={game.week} title={`Week ${game.week} · ${game.pf.toFixed(1)}-${game.pa.toFixed(1)} vs ${teamName(game.opponentId)}`}>{game.outcome}</u>)
                      : <em>no games yet</em>}
                  </div>
                  <dl className={styles.receiptStats}>
                    <div><dt>AVG</dt><dd>{record.average===null?'—':record.average.toFixed(1)}</dd></div>
                    <div><dt>HIGH</dt><dd>{record.best?record.best.pf.toFixed(1):'—'}</dd></div>
                    <div><dt>STREAK</dt><dd>{streak?streak.label:'—'}</dd></div>
                    {Boolean(series?.games.length)&&<div><dt>H2H</dt><dd>{headToHead}</dd></div>}
                  </dl>
                </div>
              ))}
            </div>
            <div className={styles.receiptNotes}>
              <p>{series?.last
                ? <><b>LAST MEETING</b> Week {series.last.week} — {series.last.winnerId?`${teamName(series.last.winnerId)} by ${series.last.margin.toFixed(1)}`:'a tie'}, {series.last.aScore.toFixed(1)}–{series.last.bScore.toFixed(1)}.</>
                : <><b>FIRST MEETING</b> These two have not finished a game against each other this season.</>}</p>
              {[[home,homeLast],[away,awayLast]].map(([team,last])=>last?<p key={team?.id}>
                <b>{last.outcome==='W'?'LAST OUT':last.outcome==='L'?'COMING OFF':'LAST OUT'}</b> {team?.name} {last.outcome==='W'?'beat':last.outcome==='L'?'lost to':'tied'} {teamName(last.opponentId)} {last.pf.toFixed(1)}–{last.pa.toFixed(1)} in Week {last.week}.
              </p>:null)}
            </div>
          </> : <p className={styles.emptyRoom}>No week has finished yet, so there is nothing to hold over anybody. Records, streaks and the season series appear here once Week {week} is in the books.</p>}
        </section>
        <div className={styles.matchupGrid}><Lineup title={home?.name} rows={scoredHomeLineup} scoring={league.scoring} byeTeams={byeTeams} schedule={schedule} sheet={sheetData} project={projectPoints}/><Lineup title={away?.name} rows={scoredAwayLineup} scoring={league.scoring} byeTeams={byeTeams} schedule={schedule} sheet={sheetData} project={projectPoints}/></div>
        
        <section className={styles.weekGames}><div className={styles.boardHead}><div><p className={styles.panelLabel}>AROUND THE LEAGUE</p><h2>Week {week}</h2></div><span>{matchups.length} games</span></div>{matchups.map((game)=><div className={styles.weekGame} key={game.id}><b style={{display:'flex',alignItems:'center',gap:7,minWidth:0}}><TeamMark size={20} team={teams.find((team)=>team.id===game.home_team_id)}/><Link className={styles.teamLink} href={`/fantasy/league/${leagueId}/team/${game.home_team_id}`} style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{teams.find((team)=>team.id===game.home_team_id)?.name}</Link></b><Link href={`/fantasy/league/${leagueId}/matchup?week=${week}&matchup=${game.id}`} className={`${styles.gameCell}${featured?.id===game.id?` ${styles.gameCellActive}`:''}`}>{stateOf(game)==='scheduled'?(()=>{const o=oddsFor(game);return o?<><i className={styles.gameLine}>{o.pickEm?'PK':`${(o.spread>0?teams.find((t)=>t.id===game.home_team_id):teams.find((t)=>t.id===game.away_team_id))?.name} ${-Math.abs(o.spread)}`}</i><em className={styles.gameTotal}>O/U {o.total}</em></>:'vs'})():(()=>{const r=matchupResult(game,stateOf(game));return <><i className={styles.gameScore} data-win={r.leaderId===game.home_team_id?'true':undefined}>{r.home.toFixed(1)}</i><em className={styles.gameTotal}>{stateOf(game)==='final'?'FINAL':'LIVE'}</em><i className={styles.gameScore} data-win={r.leaderId===game.away_team_id?'true':undefined}>{r.away.toFixed(1)}</i></>})()}</Link><b style={{display:'flex',alignItems:'center',gap:7,minWidth:0,justifyContent:'flex-end'}}><Link className={styles.teamLink} href={`/fantasy/league/${leagueId}/team/${game.away_team_id}`} style={{overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{teams.find((team)=>team.id===game.away_team_id)?.name}</Link><TeamMark size={20} team={teams.find((team)=>team.id===game.away_team_id)}/></b></div>)}{Boolean(idleTeams.length)&&<p className={styles.emptyRoom}>Idle this week: {idleTeams.map((team)=>team.name).join(', ')}</p>}</section>
      </>}
    </div>
  </main>
}

// A row is scoring for real once its game has kicked off. An empty stat line
// in a live or final game is a real 0.0, not "pending" -- see pointsForRow.
const rowIsActive = (row) => Boolean(row?.weekStats?.status && row.weekStats.status !== 'scheduled')

function Lineup({ title, rows, scoring, byeTeams, schedule, sheet, project }) {
  return <section className={styles.matchupLineup}><div className={styles.boardHead}><div><p className={styles.panelLabel}>STARTING LINEUP</p><h2>{title}</h2></div><span>{rows.length} set</span></div>{rows.map((row)=>{const active=rowIsActive(row);const bye=isOnBye(row.player,byeTeams);const points=fantasyPointsFromStats(row.weekStats?.stats||{},scoring);return <div className={styles.matchupPlayer} key={row.id}><span>{row.slot}</span><div className={styles.playerIdentity}><PlayerFace player={row.player} size={30}/><PlayerSheetButton sheet={sheet?.[row.player?.id]} className={styles.playerTap}><span><b>{row.player?.name}<InjuryTag status={row.player?.injury_status}/></b><PlayerMeta player={row.player} game={schedule?.get(String(row.player?.team||'').toUpperCase())} bye={bye}/></span></PlayerSheetButton></div><span className={styles.playerState} data-state={bye?'bye':active?row.weekStats.status:'projected'}>{bye?'BYE':active?String(row.weekStats.status).toUpperCase():'PROJ'}</span><strong className={active&&!bye?styles.livePlayerScore:''}>{bye?'0.0':(active?points:project(row.player)).toFixed(1)}</strong></div>})}{!rows.length&&<p className={styles.emptyRoom}>No starters have been set for this week.</p>}</section>
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
