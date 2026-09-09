import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'

import { createSupabaseServerClient } from '../../../../../../lib/supabase/server'
import PlayerFace from '../../../../../../components/fantasy/PlayerFace'
import PlayerMeta from '../../../../../../components/fantasy/PlayerMeta'
import InjuryTag from '../../../../../../components/fantasy/InjuryTag'
import TeamMark from '../../../../../../components/fantasy/TeamMark'
import { colorForPosition } from '../../../../../../components/fantasy/positionColor'
import { teamScheduleFor } from '../../../../../../lib/fantasy/schedule'
import { byeTeamsFor, isOnBye } from '../../../../../../lib/fantasy/bye'
import { projectedFantasyPoints } from '../../../../../../lib/fantasy/scoring'
import { FANTASY_SEASON, resolveFantasyWeek } from '../../../../../../lib/fantasy/week'
import { loadPlayerCatalog } from '../../../../../../lib/fantasy/playerCatalog'
import LeagueNav from '../../../../../../components/fantasy/LeagueNav'
import NetworkSwitch from '../../../../../../components/NetworkSwitch'
import styles from '../../../../fantasy.module.css'

const SEASON = FANTASY_SEASON
const SLOT_ORDER = ['QB', 'RB', 'RB2', 'WR', 'WR2', 'TE', 'FLEX', 'K', 'DEF']
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF']

// ── ANY TEAM'S ROSTER, READ ONLY (2026-09-07) ───────────────────────────────
//
// Donovan: "we should be able to see everyone['s] team like who they have on
// the roster... all coaches should be able to see other teams' roster."
//
// Franchise had exactly one team page and it was yours. Every other manager in
// the league was a name in a table: you could not see who had your handcuff,
// who was starting a player on bye, or why a trade offer looked the way it
// did. That is most of what a league talks about all week.
//
// A SEPARATE ROUTE, NOT A MODE ON THE EXISTING PAGE. /team is a lineup editor
// -- move buttons, slot forms, the identity picker, a server action behind
// each one. Threading "but not if it isn't yours" through all of it, at the
// end of draft night, is how a Move button ends up firing on someone else's
// roster. This page has no forms at all, so it cannot.
//
// Your own team redirects to /team, which is the page with the controls. There
// is no reason to show a manager a read-only copy of a roster he can edit.
export default async function TeamRoster({ params, searchParams }) {
  const [{ leagueId, teamId }, query] = await Promise.all([params, searchParams])
  const supabase = await createSupabaseServerClient()
  if (!supabase) redirect('/fantasy')
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/fantasy')

  const { data: league } = await supabase.from('fantasy_leagues').select('*').eq('id', leagueId).single()
  if (!league) notFound()
  const [{ data: membership }, { data: teams }] = await Promise.all([
    supabase.from('fantasy_league_memberships').select('role').eq('league_id', leagueId).eq('user_id', user.id).maybeSingle(),
    supabase.from('fantasy_teams').select('*').eq('league_id', leagueId).order('created_at'),
  ])
  // A league's rosters are for its members. Not a secret worth much, but this
  // is the same gate every other room page uses and it should not be the one
  // page that quietly opens up.
  if (!membership) notFound()

  const team = (teams || []).find((row) => row.id === teamId)
  if (!team) notFound()
  if (team.owner_id === user.id) redirect(`/fantasy/league/${leagueId}/team`)

  const week = await resolveFantasyWeek(supabase, query?.week)
  const [{ data: rosterRows }, { data: lineupRows }, { data: nflGameRows }, { data: seasonGames }, catalog] = await Promise.all([
    supabase.from('fantasy_roster_entries')
      .select('player_id,acquired_via,acquired_at,player:nfl_players(id,name,position,team,injury_status,source_payload,source_player_id)')
      .eq('team_id', teamId).is('released_at', null),
    supabase.from('fantasy_lineup_slots').select('slot,slot_index,player_id')
      .eq('team_id', teamId).eq('season', SEASON).eq('week', week),
    supabase.from('nfl_week_games').select('*').eq('season', SEASON).eq('week', week).order('kickoff'),
    // fantasy_teams carries no W-L: a record is a fact about played games, so
    // it is counted from them rather than stored and kept in sync.
    supabase.from('fantasy_matchups').select('home_team_id,away_team_id,home_score,away_score,status')
      .eq('league_id', leagueId).eq('season', SEASON).eq('status', 'final'),
    loadPlayerCatalog(supabase),
  ])

  const roster = (rosterRows || []).filter((row) => row.player)
  const nflGames = nflGameRows || []
  const byeTeams = byeTeamsFor(nflGames)
  const schedule = teamScheduleFor(nflGames)
  const playerById = new Map(roster.map((row) => [row.player_id, row.player]))
  const starters = (lineupRows || [])
    .filter((row) => !['BENCH', 'IR'].includes(row.slot))
    .sort((a, b) => SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || a.slot_index - b.slot_index)

  const project = (player) => (isOnBye(player, byeTeams) ? 0 : projectedFantasyPoints(player, league.scoring))
  const weekProjection = starters.reduce((sum, row) => sum + project(playerById.get(row.player_id)), 0)
  const startingIds = new Set(starters.map((row) => row.player_id))
  const bench = roster.filter((row) => !startingIds.has(row.player_id))

  const catalogCount = Array.isArray(catalog) ? catalog.length : 0
  let wins = 0, losses = 0, ties = 0
  for (const game of seasonGames || []) {
    const isHome = game.home_team_id === teamId
    if (!isHome && game.away_team_id !== teamId) continue
    const mine = Number(isHome ? game.home_score : game.away_score) || 0
    const theirs = Number(isHome ? game.away_score : game.home_score) || 0
    if (mine > theirs) wins += 1
    else if (mine < theirs) losses += 1
    else ties += 1
  }

  return <main className={styles.roomApp}>
    <header className={styles.roomHeader}>
      <NetworkSwitch variant="inline" />
      <div><small>WEEK {week} · ANOTHER TEAM</small><strong>{league.name}</strong></div>
      <span>{roster.length}/15</span>
    </header>
    <LeagueNav leagueId={leagueId} active="league" role={membership?.role} className={styles.roomNav} activeClassName={styles.roomActive} />
    <div className={styles.roomBody}>
      <section className={styles.teamHero}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
          <TeamMark size={40} team={team} />
          <div style={{ minWidth: 0 }}>
            <p className={styles.panelLabel}>SCOUTING REPORT</p>
            <h1 style={{ margin: 0, overflow: 'hidden', textOverflow: 'ellipsis' }}>{team.name}</h1>
          </div>
        </div>
        {/* <span> children, not <div> — .roomStats is styled on the span in
            every other room (Wire, Team, League HQ) and a div child gets none
            of it. */}
        <div className={styles.roomStats}>
          <span><small>RECORD</small><b>{wins}-{losses}{ties ? `-${ties}` : ''}</b></span>
          <span><small>WEEK {week} PROJ</small><b>{weekProjection.toFixed(1)}</b></span>
          <span><small>STARTERS</small><b>{starters.length}/9</b></span>
        </div>
      </section>

      {/* A manager who has not set a lineup is the single most useful thing on
          this page in a given week, so it is stated rather than left to be
          inferred from a short list. */}
      {starters.length < 9 && <p className={styles.message}>
        {starters.length === 0
          ? `${team.name} has not set a Week ${week} lineup yet.`
          : `${team.name} has ${9 - starters.length} starting slot${9 - starters.length === 1 ? '' : 's'} still empty for Week ${week}.`}
      </p>}

      <section className={styles.matchupLineup}>
        <div className={styles.boardHead}><div><p className={styles.panelLabel}>WEEK {week} STARTERS</p><h2>On the field</h2></div><span>{weekProjection.toFixed(1)} proj</span></div>
        {starters.map((row) => {
          const player = playerById.get(row.player_id)
          const bye = isOnBye(player, byeTeams)
          return <div className={styles.matchupPlayer} key={`${row.slot}-${row.slot_index}`}>
            <span>{row.slot}{row.slot_index > 1 ? row.slot_index : ''}</span>
            <div className={styles.playerIdentity}>
              <PlayerFace player={player} size={30} />
              <span><b>{player?.name || '—'}<InjuryTag status={player?.injury_status} /></b>
                <PlayerMeta player={player} game={schedule?.get(String(player?.team || '').toUpperCase())} bye={bye} /></span>
            </div>
            <span className={styles.playerState} data-state={bye ? 'bye' : 'projected'}>{bye ? 'BYE' : 'PROJ'}</span>
            <strong>{project(player).toFixed(1)}</strong>
          </div>
        })}
        {!starters.length && <p className={styles.emptyRoom}>No starters set for Week {week}.</p>}
      </section>

      <section className={styles.matchupLineup} style={{ marginTop: 12 }}>
        <div className={styles.boardHead}><div><p className={styles.panelLabel}>THE REST OF THE ROSTER</p><h2>Bench and reserves</h2></div><span>{bench.length}</span></div>
        {bench
          .slice()
          .sort((a, b) => POSITIONS.indexOf(a.player.position) - POSITIONS.indexOf(b.player.position) || project(b.player) - project(a.player))
          .map((row) => {
            const bye = isOnBye(row.player, byeTeams)
            return <div className={styles.matchupPlayer} key={row.player_id}>
              <span style={{ color: colorForPosition(row.player.position) }}>{row.player.position}</span>
              <div className={styles.playerIdentity}>
                <PlayerFace player={row.player} size={30} />
                <span><b>{row.player.name}<InjuryTag status={row.player.injury_status} /></b>
                  <PlayerMeta player={row.player} game={schedule?.get(String(row.player.team || '').toUpperCase())} bye={bye} /></span>
              </div>
              <span className={styles.playerState} data-state={bye ? 'bye' : 'projected'}>{bye ? 'BYE' : 'PROJ'}</span>
              <strong>{project(row.player).toFixed(1)}</strong>
            </div>
          })}
        {!bench.length && <p className={styles.emptyRoom}>Every rostered player is starting this week.</p>}
      </section>

      <section className={styles.matchupLineup} style={{ marginTop: 12 }}>
        <div className={styles.boardHead}><div><p className={styles.panelLabel}>ROSTER BUILD</p><h2>Position count</h2></div><span>{roster.length} players</span></div>
        {POSITIONS.map((position) => {
          const count = roster.filter((row) => row.player.position === position).length
          return <div className={styles.positionCount} key={position}>
            <span style={{ color: colorForPosition(position) }}>{position}</span>
            <b>{count}</b>
          </div>
        })}
      </section>

      <p className={styles.boardNote} style={{ marginTop: 12 }}>
        Read only — you are looking at another manager's team. To offer a deal,
        go to <Link href={`/fantasy/league/${leagueId}/trades`}>Trades</Link>.
        {catalogCount ? '' : ' Projections are unavailable right now.'}
      </p>
    </div>
  </main>
}
