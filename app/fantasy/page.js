import {
  createLeague,
  joinLeague,
  signIn,
  signOut,
  signUp,
} from './actions'
import Link from 'next/link'
import PasswordInput from '../../components/PasswordInput'
import TeamMark from '../../components/fantasy/TeamMark'
import InviteCode from '../../components/fantasy/InviteCode'
import SubmitButton from '../../components/fantasy/SubmitButton'
import styles from './fantasy.module.css'
import NetworkSwitch from '../../components/NetworkSwitch'

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
    <main className={styles.launchApp}>
      {(error || message) && <div className={styles.authBanner}><Notice error={error} message={message} /></div>}
      <header className={styles.launchHeader}>
        {/* Straight to the actual board, not the marketing front door
            (2026-08-29, same fix as app/login/page.js's brand link — a
            person stuck on Franchise's sign-in screen was one click from the
            front door and no closer to MOONSHOT/TUDDY than before). */}
        <Link className={styles.launchBrand} href="/app#sport=mlb&tab=home"><img src="/icon-192.png" alt="" width="39" height="39"/><div><small>DASH NETWORK</small><strong>FRANCHISE</strong></div></Link>
        <nav><a href="#product">See the product</a><a href="#sign-in">Sign in</a><a className={styles.launchNavCta} href="#create-account">Start free</a></nav>
      </header>

      <section className={styles.launchHero}>
        <div className={styles.launchHeroCopy}>
          <p className={styles.launchEyebrow}><span>●</span> FANTASY FOOTBALL, BUILT INTO DASH</p>
          <h1>Run your league.<br/><em>Know your next move.</em></h1>
          <p>Draft with friends, follow every matchup live, work the waiver wire, trade, talk trash, and get a clear recommendation when you&apos;re stuck.</p>
          <div className={styles.launchActions}><a href="#create-account">Create your free league <b>→</b></a><a href="#sign-in">I already have an account</a></div>
          <div className={styles.launchTrust}><span>✓ Free to play</span><span>✓ Invite-only leagues</span><span>✓ No payment screen</span></div>
        </div>
        <div className={styles.launchScoreCard}>
          <div><small>DASH SCORE</small><strong>87</strong><span>A−</span></div>
          <p>YOUR WEEK 2 EDGE</p>
          <h2>Start DeVonta Smith at FLEX.</h2>
          <p>Higher target ceiling in a matchup you&apos;re projected to win by 7.3.</p>
          <div className={styles.launchScoreFooter}><span>WIN CHANCE <b>62%</b></span><span>PROJECTED <b>124.8</b></span></div>
        </div>
      </section>

      <section className={styles.launchProof}>
        <div><strong>LIVE</strong><span>Matchups &amp; NFL game status</span></div>
        <div><strong>24H</strong><span>Rolling-priority waivers</span></div>
        <div><strong>8–14</strong><span>Teams per private league</span></div>
        <div><strong>1</strong><span>Coach for every decision</span></div>
      </section>

      <section className={styles.launchProduct} id="product">
        <div className={styles.launchSectionHead}><p>A LOOK AT THE PRODUCT</p><h2>See your whole season in one place.</h2><span>Matchups, lineups, league movement, and advice—with the clutter stripped out.</span></div>
        <SetupScreen embedded />
      </section>

      <section className={styles.launchReasons}>
        <article><span>01</span><p>GAME DAY</p><h3>Watch the matchup change live.</h3><small>NFL game status, player scores, projections, and every matchup around your league.</small></article>
        <article><span>02</span><p>DASH COACH</p><h3>Get an answer, not another spreadsheet.</h3><small>Beginner-friendly lineup, draft, and waiver recommendations with the reason explained.</small></article>
        <article><span>03</span><p>YOUR PEOPLE</p><h3>A league that feels like your league.</h3><small>Private invite codes, trades, commissioner control, reactions, comments, recaps, and weekly awards.</small></article>
      </section>

      <section className={styles.launchAuth}>
        <div className={styles.launchAuthIntro}>
          <p>READY WHEN YOUR LEAGUE IS</p>
          <h2>Make this season yours.</h2>
          <span>Create the league now or sign back into the front office you already started.</span>
        </div>
        <Notice error={error} message={message} />
        <div className={styles.launchAuthGrid}>
        <form action={signUp} className={styles.launchAuthCard} id="create-account">
          <p className={styles.kicker}>START HERE · FREE</p>
          <h3>Create your account</h3>
          <p>One account lets you own teams in multiple private leagues.</p>
          <label>Your name<input name="displayName" autoComplete="name" maxLength="40" required /></label>
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<PasswordInput autoComplete="new-password" minLength={8} /></label>
          <SubmitButton pendingLabel="Creating your account…">Start my Franchise <span>→</span></SubmitButton>
          <small>No card. No payment. Just your league.</small>
        </form>
        <form action={signIn} className={styles.launchAuthCard} id="sign-in">
          <p className={styles.kicker}>WELCOME BACK</p>
          <h3>Enter your front office</h3>
          <p>Use the email and password you created for Franchise.</p>
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<PasswordInput autoComplete="current-password" /></label>
          <SubmitButton pendingLabel="Signing in…">Sign in <span>→</span></SubmitButton>
          <small><Link href="/forgot-password">Forgot your password?</Link></small>
        </form>
        </div>
      </section>
      <footer className={styles.launchFooter}><span>DASH NETWORK</span><p>MOONSHOT · MLB</p><p>TUDDY · NFL</p><p>FRANCHISE · FANTASY</p></footer>
    </main>
  )
}

function SetupScreen({ embedded = false }) {
  const lineup = [
    ['QB', 'J. Allen', 'BUF · vs BAL', '24.6'],
    ['RB', 'B. Hall', 'NYJ · vs PIT', '16.8'],
    ['RB', 'J. Gibbs', 'DET · @ GB', '18.2'],
    ['WR', 'A. St. Brown', 'DET · @ GB', '19.4'],
    ['WR', 'G. Wilson', 'NYJ · vs PIT', '17.1'],
    ['TE', 'T. McBride', 'ARI · @ NO', '13.3'],
    ['FLEX', 'D. Smith', 'PHI · vs DAL', '14.7'],
  ]

  const Wrapper = embedded ? 'div' : 'main'
  return (
    <Wrapper className={`${styles.previewApp} ${embedded ? styles.embeddedPreview : ''}`}>
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
        <a className={styles.navActive}>◈ Draft</a><a>▣ Team</a><a>⚔ Matchup</a><a>▤ League</a><a>⌁ The Wire</a><a>⇄ Trades</a><a>◎ Feed</a><a>✦ Coach</a>
      </nav>

      <div className={styles.previewMode}>
        <span>{embedded ? '◉ PRODUCT VIEW' : '◉ PREVIEW MODE'}</span>
        <p>{embedded ? 'A preview of the Franchise team dashboard.' : 'This is the Franchise experience. Connect Supabase when you\'re ready to make accounts and leagues live.'}</p>
        {!embedded && <code>.env.example</code>}
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
      {!embedded && <nav className={styles.mobilePreviewNav}><a className={styles.navActive}>⌂<span>Home</span></a><a>▣<span>Team</span></a><a>⚔<span>Matchup</span></a><a>▤<span>League</span></a><a>✦<span>Coach</span></a></nav>}
    </Wrapper>
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
      <SubmitButton pendingLabel="Creating…">Create league</SubmitButton>
    </form>
  )
}

export default async function FantasyPage({ searchParams }) {
  const params = (await searchParams) || {}
  if (!hasSupabaseConfig()) return <SetupScreen />

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return <AuthScreen error={params.error} message={params.message} />

  const { data: membershipRows, error: membershipError } = await supabase
    .from('fantasy_league_memberships')
    .select('league_id, role')
    .eq('user_id', user.id)

  const memberships = membershipRows || []
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
        {/* This was plain text, not a link -- the one screen in Franchise with
            NO way back to the actual site (Donovan, 2026-08-29 screenshot:
            "i need to be able to get to the home page"). Every other header
            in Franchise (the logged-out launch screen, /login) already goes
            straight to /app; this authenticated "Your franchises" screen was
            the gap. */}
        <Link href="/app#sport=mlb&tab=home" style={{display:'flex',flexDirection:'column',textDecoration:'none',color:'inherit'}}><p>DASH NETWORK</p><strong>FRANCHISE</strong></Link>
        <form action={signOut}><SubmitButton className={styles.ghost} pendingLabel="Signing out…">Sign out</SubmitButton></form>
      </header>
      {/* Donovan, 2026-08-29: "there no nav" -- the brand-link fix above made
          the logo clickable, but this screen still had nothing that read as
          NAVIGATION -- no visible way to see MOONSHOT/TUDDY exist from here at
          all unless you already knew to click the logo. NetworkSwitch is the
          same three-tile MOONSHOT/TUDDY/FRANCHISE switcher the mobile dock
          shows (components/NetworkSwitch.js) -- that one is CSS-hidden on
          desktop because league ROOM pages have their own "← FRANCHISE" +
          room nav there. This top-level Franchise page has neither, on any
          screen size, so it gets the switch inline instead of relying on a
          dock that doesn't show here. */}
      <div style={{maxWidth:420,margin:'14px auto 0'}}><NetworkSwitch/></div>
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
                  <p className={styles.teamName} style={{display:'flex',alignItems:'center',gap:8}}>{myTeam&&<TeamMark size={20} team={myTeam}/>}{myTeam?.name}</p>
                  <div className={styles.chips}><span>{scoringLabel[league.scoring]}</span><span>{league.draft_timer_seconds}s draft</span><span>{league.draft_order_method} order</span></div>
                  <InviteCode className={styles.invite} code={league.invite_code} />
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
          <SubmitButton pendingLabel="Joining…">Join league</SubmitButton>
        </form>
      </section>
      {leagues[0] && <nav aria-label="Quick links" className={styles.mobileNav}><a className={styles.active} href="#top">Home</a><Link href={`/fantasy/league/${leagues[0].id}/team`}>Team</Link><Link href={`/fantasy/league/${leagues[0].id}/league`}>League</Link><Link href={`/fantasy/league/${leagues[0].id}/coach`}>DASH Coach</Link></nav>}
    </main>
  )
}
