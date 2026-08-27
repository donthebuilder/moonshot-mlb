import {
  createLeague,
  joinLeague,
  signIn,
  signOut,
  signUp,
} from './actions'
import Link from 'next/link'
import styles from './fantasy.module.css'

import { hasSupabaseConfig } from '../../lib/supabase/config'
import { createSupabaseServerClient } from '../../lib/supabase/server'

const scoringLabel = {
  ppr: 'PPR',
  half_ppr: 'Half-PPR',
  standard: 'Standard',
}

function Notice({ error, message }) {
  if (!error && !message) return null
  return <p className={error ? styles.error : styles.message}>{error || message}</p>
}

function AuthScreen({ error, message }) {
  return (
    <main className={styles.authPage}>
      <section className={styles.hero}>
        <p className={styles.eyebrow}>DASH NETWORK</p>
        <h1>FRANCHISE</h1>
        <p>Build a team. Run the room. Own the season.</p>
      </section>
      <Notice error={error} message={message} />
      <section className={styles.authGrid}>
        <form action={signIn} className={styles.card}>
          <p className={styles.kicker}>WELCOME BACK</p>
          <h2>Sign in</h2>
          <p className={styles.muted}>Already made your Franchise account? Enter the same email and password here.</p>
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          <button type="submit">Enter Franchise</button>
        </form>
        <form action={signUp} className={styles.card}>
          <p className={styles.kicker}>ROOKIE SEASON</p>
          <h2>Create account</h2>
          <p className={styles.muted}>Only use this once. Returning owners should use Sign in.</p>
          <label>Your name<input name="displayName" autoComplete="name" maxLength="40" required /></label>
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" minLength="8" autoComplete="new-password" required /></label>
          <button type="submit">Start your Franchise</button>
        </form>
      </section>
    </main>
  )
}

function SetupScreen() {
  const lineup = [
    ['QB', 'J. Allen', 'BUF · vs BAL', '24.6'],
    ['RB', 'B. Hall', 'NYJ · vs PIT', '16.8'],
    ['RB', 'J. Gibbs', 'DET · @ GB', '18.2'],
    ['WR', 'A. St. Brown', 'DET · @ GB', '19.4'],
    ['WR', 'G. Wilson', 'NYJ · vs PIT', '17.1'],
    ['TE', 'T. McBride', 'ARI · @ NO', '13.3'],
    ['FLEX', 'D. Smith', 'PHI · vs DAL', '14.7'],
  ]

  return (
    <main className={styles.previewApp}>
      <header className={styles.previewHeader}>
        <div className={styles.brandRow}>
          <span className={styles.logoMark}>FX</span>
          <strong>DASH NETWORK</strong>
          <span className={styles.sportPill}>MOONSHOT · MLB</span>
          <span className={styles.sportPill}>TUDDY · NFL</span>
          <span className={`${styles.sportPill} ${styles.selectedPill}`}>FRANCHISE</span>
        </div>
        <div className={styles.scoreRail}>
          <div><small>RECORD</small><b>1–0</b></div>
          <div><small>PROJECTED</small><b>124.8</b></div>
          <div><small>LEAGUE RANK</small><b>#2</b></div>
          <div><small>WAIVER</small><b>#4</b></div>
        </div>
      </header>

      <div className={styles.leagueBar}>
        <span><b>SUNDAY SYNDICATE</b> · WEEK 2</span>
        <span className={styles.liveDot}>● LINEUPS OPEN</span>
      </div>

      <nav className={styles.desktopNav}>
        <a className={styles.navActive}>⌂ Home</a><a>▣ Team</a><a>⚔ Matchup</a><a>▤ League</a><a>♟ Players</a><a>⌁ The Wire</a><a>⇄ Trades</a><a>◈ Draft</a><a>✦ Coach</a>
      </nav>

      <div className={styles.previewMode}>
        <span>◉ PREVIEW MODE</span>
        <p>This is the Franchise experience. Connect Supabase when you&apos;re ready to make accounts and leagues live.</p>
        <code>.env.example</code>
      </div>

      <section className={styles.previewContent}>
        <div className={styles.weekTicker}><span>🏈 WEEK 2</span><b>TNF starts in 1d 04h</b><span>1 lineup decision</span></div>

        <section className={styles.previewHero}>
          <div>
            <p className={styles.panelLabel}>YOUR FRONT OFFICE · TUESDAY</p>
            <h1>Good morning.<br/><em>Your team is favored.</em></h1>
            <p>You&apos;re projected to win by 7.3. One FLEX decision is worth a second look before Thursday.</p>
          </div>
          <div className={styles.heroScores}>
            <div><small>DASH SCORE</small><strong>87</strong><span>▲ 4 this week</span></div>
            <div><small>WIN CHANCE</small><strong>62%</strong><span>favored</span></div>
          </div>
        </section>

        <div className={styles.dashboardGrid}>
          <section className={`${styles.previewPanel} ${styles.matchupPanel}`}>
            <div className={styles.panelHead}><div><p className={styles.panelLabel}>WEEK 2 MATCHUP</p><h2>Sunday Night Lights</h2></div><span>Sun 10:00 AM</span></div>
            <div className={styles.matchupTeams}>
              <div><span className={styles.avatar}>SN</span><b>Sunday Night Lights</b><small>YOU · 1–0</small><strong>124.8</strong></div>
              <div className={styles.versus}><span>62%</span><small>WIN</small><i>VS</i></div>
              <div><span className={`${styles.avatar} ${styles.rivalAvatar}`}>FL</span><b>Fourth &amp; Long</b><small>MARCUS · 1–0</small><strong>117.5</strong></div>
            </div>
            <div className={styles.projectionBar}><i style={{width:'62%'}}></i></div>
            <div className={styles.panelFoot}><span>Projected margin <b>+7.3</b></span><button>View matchup →</button></div>
          </section>

          <section className={`${styles.previewPanel} ${styles.coachPanel}`}>
            <div className={styles.panelHead}><div><p className={styles.panelLabel}>✦ DASH COACH</p><h2>One move to consider</h2></div><span className={styles.scoreChip}>+2.6</span></div>
            <p>DeVonta Smith has the stronger target outlook, but James Cook owns the safer touchdown role. Your matchup is close enough to favor the ceiling.</p>
            <div className={styles.coachMove}><span>START</span><b>DeVonta Smith</b><small>over James Cook at FLEX</small></div>
            <button className={styles.orangeButton}>Explain this recommendation</button>
          </section>

          <section className={`${styles.previewPanel} ${styles.lineupPanel}`}>
            <div className={styles.panelHead}><div><p className={styles.panelLabel}>STARTING LINEUP</p><h2>Projected 124.8</h2></div><button>Edit lineup</button></div>
            <div className={styles.lineupHeader}><span>SLOT / PLAYER</span><span>OPPONENT</span><span>PROJ</span></div>
            {lineup.map(([slot,name,opp,proj]) => <div className={styles.playerRow} key={`${slot}-${name}`}><span className={styles.slot}>{slot}</span><b>{name}</b><small>{opp}</small><strong>{proj}</strong></div>)}
            <div className={styles.lineupTotal}><span>7 starters shown · 2 remaining</span><b>Lineup strength <em>A−</em></b></div>
          </section>

          <section className={`${styles.previewPanel} ${styles.pulsePanel}`}>
            <div className={styles.panelHead}><div><p className={styles.panelLabel}>LEAGUE PULSE</p><h2>Sunday Syndicate</h2></div><span>10 teams</span></div>
            <div className={styles.feedItem}><span>⇄</span><p><b>Trade accepted</b><br/>Goal Line Stand gets CeeDee Lamb</p><small>8m</small></div>
            <div className={styles.feedItem}><span>⚡</span><p><b>Waiver claim</b><br/>Fourth &amp; Long adds Jaylen Warren</p><small>2h</small></div>
            <div className={styles.feedItem}><span>🏆</span><p><b>Week 1 award</b><br/>Sunday Night Lights wins High Score</p><small>1d</small></div>
            <div className={styles.standingsMini}><p><span>1</span><b>Goal Line Stand</b><em>1–0</em></p><p className={styles.myStanding}><span>2</span><b>Sunday Night Lights</b><em>1–0</em></p><p><span>3</span><b>Fourth &amp; Long</b><em>1–0</em></p></div>
          </section>
        </div>
      </section>
      <nav className={styles.mobilePreviewNav}><a className={styles.navActive}>⌂<span>Home</span></a><a>▣<span>Team</span></a><a>⚔<span>Matchup</span></a><a>▤<span>League</span></a><a>✦<span>Coach</span></a></nav>
    </main>
  )
}

function CreateLeagueForm() {
  return (
    <form action={createLeague} className={styles.card}>
      <p className={styles.kicker}>COMMISSIONER MODE</p>
      <h2>Create a league</h2>
      <div className={styles.twoCol}>
        <label>League name<input name="leagueName" maxLength="60" required /></label>
        <label>Your team<input name="teamName" maxLength="40" required /></label>
        <label>Teams<select name="teamCount" defaultValue="10"><option>8</option><option>10</option><option>12</option><option>14</option></select></label>
        <label>Scoring<select name="scoring" defaultValue="ppr"><option value="ppr">PPR</option><option value="half_ppr">Half-PPR</option><option value="standard">Standard</option></select></label>
        <label>Draft timer<select name="draftTimer" defaultValue="60"><option value="30">30 seconds</option><option value="60">60 seconds</option><option value="90">90 seconds</option><option value="120">120 seconds</option></select></label>
        <label>Draft order<select name="draftOrder" defaultValue="random"><option value="random">Random</option><option value="manual">Manual</option></select></label>
        <label>IR slots<select name="irSlots" defaultValue="1"><option value="0">None</option><option value="1">1</option><option value="2">2</option><option value="3">3</option></select></label>
        <div className={styles.checks}><label><input name="hasKicker" type="checkbox" defaultChecked /> Kicker</label><label><input name="hasDefense" type="checkbox" defaultChecked /> Defense</label></div>
      </div>
      <button type="submit">Create league</button>
    </form>
  )
}

export default async function FantasyPage({ searchParams }) {
  const params = searchParams || {}
  if (!hasSupabaseConfig()) return <SetupScreen />

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return <AuthScreen error={params.error} message={params.message} />

  const { data: memberships = [], error: membershipError } = await supabase
    .from('fantasy_league_memberships')
    .select('league_id, role')
    .eq('user_id', user.id)

  const leagueIds = memberships.map((row) => row.league_id)
  let leagues = []
  let teams = []
  if (leagueIds.length) {
    const [leagueResult, teamResult] = await Promise.all([
      supabase.from('fantasy_leagues').select('*').in('id', leagueIds).order('created_at'),
      supabase.from('fantasy_teams').select('*').in('league_id', leagueIds).order('created_at'),
    ])
    leagues = leagueResult.data || []
    teams = teamResult.data || []
  }

  return (
    <main className={styles.app}>
      <header className={styles.topbar}>
        <div><p>DASH NETWORK</p><strong>FRANCHISE</strong></div>
        <form action={signOut}><button className={styles.ghost}>Sign out</button></form>
      </header>
      <section className={styles.welcome}>
        <p className={styles.eyebrow}>YOUR FRONT OFFICE</p>
        <h1>Make every move count.</h1>
        <p>Create a private league or enter the code your commissioner sent.</p>
      </section>
      <Notice error={params.error || membershipError?.message} message={params.message} />

      {leagues.length > 0 && (
        <section className={styles.section}>
          <div className={styles.sectionTitle}><p className={styles.kicker}>MY LEAGUES</p><h2>Your franchises</h2></div>
          <div className={styles.leagueGrid}>
            {leagues.map((league) => {
              const memberTeams = teams.filter((team) => team.league_id === league.id)
              const myTeam = memberTeams.find((team) => team.owner_id === user.id)
              const membership = memberships.find((row) => row.league_id === league.id)
              return (
                <article className={styles.leagueCard} key={league.id}>
                  <div className={styles.leagueHead}><span>{membership?.role === 'commissioner' ? 'COMMISSIONER' : 'MEMBER'}</span><b>{memberTeams.length}/{league.team_count} teams</b></div>
                  <h3>{league.name}</h3>
                  <p className={styles.teamName}>{myTeam?.name}</p>
                  <div className={styles.chips}><span>{scoringLabel[league.scoring]}</span><span>{league.draft_timer_seconds}s draft</span><span>{league.draft_order_method} order</span></div>
                  <div className={styles.invite}><small>INVITE CODE</small><strong>{league.invite_code}</strong></div>
                  <Link className={styles.enterLeague} href={`/fantasy/league/${league.id}`}>Enter league room →</Link>
                </article>
              )
            })}
          </div>
        </section>
      )}

      <section className={styles.forms}>
        <CreateLeagueForm />
        <form action={joinLeague} className={styles.card}>
          <p className={styles.kicker}>JOIN THE ROOM</p>
          <h2>Enter a league</h2>
          <p className={styles.muted}>Invite-only by design. Ask your commissioner for the code.</p>
          <label>Invite code<input name="inviteCode" maxLength="20" autoCapitalize="characters" placeholder="A1B2C3D4" required /></label>
          <label>Your team name<input name="teamName" maxLength="40" required /></label>
          <button type="submit">Join league</button>
        </form>
      </section>
      <nav className={styles.mobileNav}><a className={styles.active}>Home</a><a>Team</a><a>League</a><a>DASH Coach</a></nav>
    </main>
  )
}
