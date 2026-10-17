// 🏠 THE FRONT DOOR.
//
// 2026-08-28, Donovan: "we dont have a front door." Rebuilt top to bottom 2026-10-17 ("the front page needs to be audited and built cohesively"): the plain
// link https://dashnetwork.vercel.app/ has to hold everything someone needs, in the order they need it:
//
//   1. header      the mark, Sign in, ONE "Start free" button
//   2. hero        one line and the one primary button, "Sign up free"
//   3. free picks  tonight's called players, a MOONSHOT table per sport (4 rows each, the rest counted for members; gated on the server)
//   4. the record  how the bot is doing, from the one locked record
//   5. the offer   Founding members, the one paid button (a member sees a line and a link to the app)
//   6. sign up     the free form, open
//   7. the boards  one row of links into the app, the free Discord, the footer
//
// WHAT IT IS NOT: a gate. Nothing here is required to use the site; MOONSHOT, TUDDY and LAMP stay open to anyone, signed in or not.
//
// NOTHING ON THIS PAGE MAY NAME A CALLED PLAYER BEYOND WHAT lib/members/access.js previewOf ALLOWS. The product cards that used to sit here (TUDDY's Six,
// LAMP's #1 per game, MOONSHOT's top calls) printed unlimited CALLED names in the page for everyone, which defeated the server-side gate; they are gone
// and the app has them. The pulse still carries those lists server-side; only counts and the record are read from it here.
//
// IT IS `/` AS OF 2026-08-28. The board moved to /app. Every link ever posted in the old shape (`/#sport=nfl&tab=home`) still opens the board on the right
// tab: components/LegacyHashRedirect.js reads the fragment in the browser (the only place a fragment exists) and forwards it.
//
// LIVE NUMBERS OR NO NUMBERS. Every figure on this page comes from the same published payloads the boards read. Where a payload is missing (preseason, a
// bot that hasn't run yet) its block renders without the figure rather than with a placeholder.

import Link from 'next/link'
import { Suspense } from 'react'

import AlertsPanel from '../../components/AlertsPanel'
import DashAuthCard from '../../components/DashAuthCard'
import LegacyHashRedirect from '../../components/LegacyHashRedirect'
import OpenOnHash from '../../components/OpenOnHash'
import SubmitButton from '../../components/SubmitButton'
import QuickPicksLoader from '../../components/home/QuickPicksLoader'
import RecordBlocks from '../../components/home/RecordBlocks'
import { getNetworkPulse, liveProduct } from '../../lib/dash/pulse'
import { appHref, BRAND, SPORT_KEYS } from '../../lib/routes'
import { C, NUM_FONT } from '../../lib/theme'
import { SPORT_ACCENT } from '../../lib/sportAccent'
import { nextLine } from '../../lib/mlbNext'
import { recordBlocks } from '../../lib/dash/recordBlocks'
import { readCalibrationAny } from '../../lib/calibration/readAny'
import { marketLadderFrom } from '../../lib/record/ladder'
import { hasSupabaseConfig } from '../../lib/supabase/config'
import { createSupabaseServerClient } from '../../lib/supabase/server'
import { DISCORD_URL, MEMBERS_PRICE, MEMBERS_TRIAL, membersUrl } from '../../lib/members'
import { isMember } from '../../lib/members/access'
import { dashSignOut } from './actions'
import styles from './dash.module.css'
import './scroll-anchor.css' // css-loader pure-selector fix, 2026-09-06

export const metadata = {
  alternates: { canonical: '/' },
  title: 'DASH Network — one network, four ways to play',
  description: 'MOONSHOT (MLB), TUDDY (NFL), LAMP (NHL) and FRANCHISE (fantasy football). Every call graded in public.',
}

// The session makes this dynamic anyway; the payload fetches inside
// getNetworkPulse carry their own revalidate.
export const dynamic = 'force-dynamic'

// The page's palette is the network's theme (lib/theme C, the sport accents), handed to the stylesheet as variables: no colour is typed in the css this page uses.
const PAGE_VARS = {
  '--bg': C.bg, '--panel': C.bg2, '--surface': C.bg3, '--field': C.bg, '--line': C.border,
  '--ink': C.text, '--dim': C.text2, '--faint': C.text3,
  '--mlb': SPORT_ACCENT.mlb, '--nfl': SPORT_ACCENT.nfl, '--nhl': SPORT_ACCENT.nhl,
  '--err-line': C.red, '--err-ink': C.red, '--msg-line': C.blue, '--msg-ink': C.blue, '--bad': C.red,
  '--num': NUM_FONT,
}

async function account() {
  if (!hasSupabaseConfig()) return { configured: false, user: null }
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { configured: false, user: null }
  const { data: { user } } = await supabase.auth.getUser()
  return { configured: true, user: user || null }
}

export default async function DashHome({ searchParams }) {
  const params = (await searchParams) || {}
  // Set by dashSignUp on a successful sign-up that produced a session.
  const welcomeName = typeof params.welcome === 'string' && params.welcome ? params.welcome.slice(0, 40) : ''
  const [pulse, me] = await Promise.all([getNetworkPulse(), account()])
  const { mlb, nfl, nhl, record } = pulse
  const member = await isMember(me.user)
  const displayName = me.user?.user_metadata?.display_name || me.user?.email?.split('@')[0] || null
  // The board that's on today (lib/dash/pulse liveProduct): where a signed-in visitor's one button goes.
  const live = liveProduct(pulse)
  // A day with no MLB games: the slate on hand is an earlier day's, and the next game day is later (lib/mlbNext.js).
  const mlbOff = Boolean(mlb?.date && mlb?.today && mlb.date < mlb.today && nextLine(mlb?.next, mlb.today))
  // Football's picks are shown only while the week still has a game to play (one under way counts for 4 hours).
  const nflLive = (nfl?.kickoffs || []).map((k) => Date.parse(k)).some((t) => Number.isFinite(t) && t > Date.now() - 4 * 3600e3)
  // THE RECORD, one block per sport. TUDDY's rows are the calibration reader's market ladder (shares the /called cache entry); a failed read is just no block.
  const nflCal = await readCalibrationAny('nfl', pulse.nights?.nfl || null).catch(() => null)
  const blocks = recordBlocks({ record, nflLadder: marketLadderFrom(nflCal, { sport: 'nfl' }), nflRecord: pulse.nflRecord, nhlLadder: pulse.nhlLadder, nhlRecord: pulse.nhlRecord })

  return (
    <main className={styles.page} id="top" style={PAGE_VARS}>
      {/* Old /#sport=…&tab=… links land here now. This sends them on to the board with the hash intact (a fragment is only ever readable in the browser). */}
      {/* BEFORE ANYTHING LOADS (2026-10-04 perf audit): an old /#sport=… link used to download the whole front door, hydrate, and only then
          location.replace() to /app. This runs as the HTML is parsed; LegacyHashRedirect still covers a same-page hashchange. Only a hash
          carrying sport or tab is a board link. */}
      <script dangerouslySetInnerHTML={{ __html: "(function(){try{var r=location.hash.slice(1);if(!r)return;var p=new URLSearchParams(r);if(p.get('sport')||p.get('tab'))location.replace('/app#'+r)}catch(e){}})()" }} />
      <LegacyHashRedirect />

      {/* 1. HEADER. A link, not a div: #top rather than "/" so it does not reload the page you are on. ONE button for a stranger: Start free
          (it was labelled "Sign in" once and a first-time visitor never found sign-up; 2026-08-31). Signed in: Account and Sign out. */}
      <header className={styles.bar}>
        <a className={styles.brand} href="#top" aria-label="Back to the top of DASH Network">
          <img src="/icon-192.png" alt="" width="34" height="34" />
          <div><small>DASH</small><strong>NETWORK</strong></div>
        </a>
        <nav className={styles.barNav}>
          {me.user
            ? <><Link href="/account">Account</Link><form action={dashSignOut}><input type="hidden" name="next" value="/" /><SubmitButton className={styles.ghost} pendingLabel="Signing out…">Sign out</SubmitButton></form></>
            : <>
              <a href="#sign-in">Sign in</a>
              <a className={styles.barCta} href="#create-account">Start free</a>
            </>}
        </nav>
      </header>

      {(params.error || params.message) && (
        <p className={params.error ? styles.error : styles.message}>{params.error || params.message}</p>
      )}

      {/* 2. HERO. One line, one button. The glossary that sat here is this line now: a call is locked before the game, graded in public after. */}
      <section className={`${styles.hero} ${styles.heroTight}`}>
        <h1>{displayName ? <>Welcome back, {displayName}.</> : <>Every call, <em>graded in public.</em></>}</h1>
        <p className={styles.heroCopy}>Baseball, football and hockey picks, locked before the game and graded in public after.</p>
        <div className={styles.heroActions}>
          {me.user
            ? <Link className={styles.cta} href={appHref(live)}>Open tonight&apos;s board <b>→</b></Link>
            : <a className={styles.cta} href="#create-account">Sign up free <b>→</b></a>}
        </div>
      </section>

      {/* 3. THE FREE TASTE. Fetched after the page starts to render; the gate is applied on the server inside (components/home/QuickPicks.js). */}
      <Suspense fallback={null}>
        <QuickPicksLoader styles={styles} mlbDate={mlb?.date || null} mlbOff={mlbOff} nflLive={nflLive} nhlDate={nhl?.date || null} member={member} />
      </Suspense>

      {/* 4. HOW THE BOT IS DOING. One block per sport, the same shape (components/home/RecordBlocks.js, rows from lib/dash/recordBlocks.js): MOONSHOT's rows are the
          ONE locked record (lib/record/lockedRecord.js via lib/dash/pulse.js recordFrom: only calls whose board row was stamped before first pitch), TUDDY's the
          calibration reader's market ladder, LAMP's the status ladder. The label rules stay: every rate names its bar and carries its n and 95% range, MOONSHOT's
          and TUDDY's rows are never ranked against each other, and each block's fold says what is counted and what is set aside. */}
      {blocks.length ? (
        <section className={styles.record} id="record" aria-label="How the bot is doing">
          <div className={styles.slateHead}>
            <p className={styles.kicker}>THE RECORD</p>
            <h2>How the bot is doing.</h2>
          </div>
          <p className={styles.recordLine}>Every call, graded in public. Locked before the game starts.{record?.callsLine ? ` MOONSHOT: ${record.callsLine}.` : ''}</p>
          <RecordBlocks blocks={blocks} />
          <Link className={styles.moreLink} href="/called">Every call, night by night, in the Ledger →</Link>
        </section>
      ) : null}

      {/* 5. THE OFFER. The one paid button on the page. The site stays free; members pay for delivery (lib/members.js). A member sees a line and a way
          into the app instead; a signed-out visitor who already pays has a way to sign in. */}
      <section className={styles.offer} id="offer" aria-label="Founding members">
        {member ? (
          <>
            <p className={styles.kicker}>FOUNDING MEMBER</p>
            <h2>You&apos;re a member.</h2>
            <p className={styles.muted}>Every called player is delivered at lock. Each list above shows up to 8; all of them are in the app.</p>
            <div className={styles.offerActions}><Link className={styles.cta} href={appHref(live)}>Open the app <b>→</b></Link></div>
          </>
        ) : (
          <>
            <p className={styles.kicker}>FOUNDING MEMBERS</p>
            <h2>{MEMBERS_PRICE}.</h2>
            <p className={styles.muted}>{MEMBERS_TRIAL[0].toUpperCase() + MEMBERS_TRIAL.slice(1)}. Delivered to a private Discord: every game&apos;s write-up, plus the board at lock and its grade. Everything on the site stays free.</p>
            <div className={styles.offerActions}><a className={styles.cta} href={membersUrl()}>Join Founding members <b>→</b></a></div>
            {me.user ? null : <p className={styles.already}>Already a member? <a href="#sign-in">Sign in</a></p>}
          </>
        )}
      </section>

      {/* 6. FREE SIGN-UP, OPEN. #sign-in is this section and #create-account the anchor inside the card (login, the header and the actions' redirects
          still land on them). WHAT NOW (2026-08-31, "didn't know what to do after signing up"): the welcome panel names three destinations. */}
      <section className={styles.auth} id="sign-in">
        {welcomeName ? (
          <div className={styles.welcome}>
            <p className={styles.kicker}>YOU&apos;RE IN</p>
            <h2>Welcome, {welcomeName}.</h2>
            <p>
              That&apos;s the whole sign-up — nothing else is needed. Your watchlist, who you
              follow and your picks now save to this account and turn up on any device you sign
              in on. Here is where most people go first.
            </p>
            <div className={styles.welcomeSteps}>
              <Link href={appHref('mlb')}>Open MOONSHOT<span>MOONSHOT&apos;s read on tonight&apos;s baseball, graded by morning.</span></Link>
              <Link href="/app#sport=mlb&tab=bot">Star a few hitters<span>The ☆ on any player saves him to your watchlist — that is the thing an account is for.</span></Link>
              <Link href="/account">Turn on alerts<span>Get told when one of your names goes deep, on this device or off it.</span></Link>
            </div>
          </div>
        ) : null}
        {me.user ? (
          <div className={styles.signedIn}>
            <p className={styles.kicker}>YOUR ACCOUNT</p>
            <h2>{displayName}, your lists follow you.</h2>
            <p className={styles.muted}>
              Watchlist, Following, and My Picks on MOONSHOT, TUDDY and LAMP save to this account and turn up on
              any device you sign in on. Sign out and they stay on this browser only.
            </p>
            <div className={styles.signOutRow}>
              <Link className={styles.barCta} href="/account">Account settings →</Link>
              <form action={dashSignOut}><input type="hidden" name="next" value="/" /><SubmitButton pendingLabel="Signing out…">Sign out</SubmitButton></form>
            </div>
          </div>
        ) : me.configured ? (
          <>
            <div className={styles.authIntro}>
              <p className={styles.kicker}>FREE ACCOUNT</p>
              <h2>Keep your list when you switch devices.</h2>
              <span>
                Free, and it changes nothing about reading the site — MOONSHOT, TUDDY and LAMP are
                open to everyone, signed in or not. What it saves: your watchlist, who you follow, and
                your picks. It is the same login Franchise already uses.
              </span>
            </div>
            <div className={styles.authGrid}>
              {/* notice/defaults come from back() in actions.js: a failed attempt returns here with the name and email already typed, the right tab open,
                  and the reason next to the field rather than at the top of the page. The password is deliberately never carried in a URL. */}
              <DashAuthCard
                next="/"
                notice={params.error || params.message || null}
                noticeType={params.error ? 'error' : 'message'}
                defaultEmail={typeof params.em === 'string' ? params.em : ''}
                defaultName={typeof params.nm === 'string' ? params.nm : ''}
                confirmEmail={typeof params.confirm === 'string' ? params.confirm : ''}
              />
            </div>
          </>
        ) : (
          <p className={styles.muted}>Accounts aren&apos;t configured on this deploy — everything you save stays in this browser.</p>
        )}
      </section>

      {/* 7. THE BOARDS, ONE ROW (the registry's sports, lib/routes.js), then the free Discord. */}
      <nav className={styles.sports} aria-label="The boards">
        {SPORT_KEYS.map((k) => (
          <Link key={k} href={appHref(k)} style={{ '--accent': SPORT_ACCENT[k] }}>
            <strong>{BRAND[k].name}</strong><small>{BRAND[k].league} board</small>
          </Link>
        ))}
      </nav>
      <a className={styles.discord} href={DISCORD_URL} target="_blank" rel="noopener noreferrer">Join the free Discord <b>→</b></a>

      {/* Alerts (the 36 switches) live here and nowhere else: /account, the app's AlertsQuick and old links point at /#alerts. Folded; the footer link and the
          hash open it (OpenOnHash: a browser won't open a <details> just because a link targets it). */}
      <section className={styles.alertsSection}>
        <details className={styles.alertsFold} id="alerts">
          <summary>Alerts &mdash; tell me when my players do something</summary>
          <AlertsPanel styles={styles} />
        </details>
        <OpenOnHash id="alerts" />
      </section>

      <footer className={styles.foot}>
        <span>DASH NETWORK</span>
        <Link href="/called">CALLED IT</Link>
        <Link href="/members">MEMBERS</Link>
        <a href="#alerts">ALERTS</a>
        <Link href="/fantasy">FRANCHISE</Link>
      </footer>
    </main>
  )
}
