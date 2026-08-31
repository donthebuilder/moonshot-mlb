// 🏠 THE FRONT DOOR.
//
// 2026-08-28, Donovan: "we dont have a front door." He's right, and the
// floating switcher wasn't one: a button in a corner that already assumes
// you know what MOONSHOT is. (That switcher is gone entirely as of
// 2026-08-29 — its three destinations live in the bottom bar's More sheet
// now, via components/NetworkSwitch.js. This page is unchanged by that; it
// was never where the switcher belonged.)
//
// This page answers three questions in the order a person actually asks them:
//
//   1. WHAT IS THIS — one line, three products, no scrolling required.
//   2. WHAT'S ON RIGHT NOW — tonight's baseball, this week's football, and
//      your leagues, with real numbers off the live payloads (lib/dash/pulse).
//   3. WHERE DO I GO — a jump-in link on every card, and the account block
//      that makes what you save follow you.
//
// WHAT IT IS NOT: a gate. Nothing here is required to use the site — MOONSHOT
// and TUDDY stay open to anyone, signed in or not.
//
// IT IS `/` AS OF 2026-08-28. The board moved to /app. Every link ever posted
// in the old shape (`/#sport=nfl&tab=home`) still opens the board on the right
// tab: components/LegacyHashRedirect.js reads the fragment in the browser —
// the only place a fragment exists — and forwards it. Reverting is two moves
// and a deleted component; nothing about the board itself changed.
//
// LIVE NUMBERS OR NO NUMBERS. Every figure on this page comes from the same
// published payloads the boards read. Where a payload is missing — preseason,
// a bot that hasn't run yet — the card renders without the figure rather than
// with a placeholder. A front door that invents a number to look alive is
// worse than one that admits it's early.

import Link from 'next/link'

import AlertsPanel from '../../components/AlertsPanel'
import DashAuthCard from '../../components/DashAuthCard'
import LegacyHashRedirect from '../../components/LegacyHashRedirect'
import SubmitButton from '../../components/fantasy/SubmitButton'
import { getNetworkPulse } from '../../lib/dash/pulse'
import { hasSupabaseConfig } from '../../lib/supabase/config'
import { createSupabaseServerClient } from '../../lib/supabase/server'
import { dashSignOut } from './actions'
import styles from './dash.module.css'

export const metadata = {
  title: 'DASH Network — one network, three ways to play',
  description: 'MOONSHOT (MLB), TUDDY (NFL) and FRANCHISE (fantasy football). Every call graded in public.',
}

// The session makes this dynamic anyway; the payload fetches inside
// getNetworkPulse carry their own revalidate.
export const dynamic = 'force-dynamic'

const pct = (value) => (Number.isFinite(value) ? `${Math.round(value)}%` : null)

function timeUntil(iso) {
  if (!iso) return null
  const ms = new Date(iso).getTime() - Date.now()
  if (!Number.isFinite(ms)) return null
  // A kickoff already in the past means the card is showing a finished or
  // in-progress slate; the label ("Preseason · Aug 21") says more than "under
  // way" would, so fall through to it rather than printing a countdown of a
  // game that has already happened.
  if (ms <= 0) return null
  const hours = Math.round(ms / 3600000)
  if (hours < 48) return `in ${hours}h`
  return `in ${Math.round(hours / 24)}d`
}

async function account() {
  if (!hasSupabaseConfig()) return { configured: false, user: null, leagues: [], teams: [] }
  const supabase = await createSupabaseServerClient()
  if (!supabase) return { configured: false, user: null, leagues: [], teams: [] }

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { configured: true, user: null, leagues: [], teams: [] }

  const { data: memberships } = await supabase
    .from('fantasy_league_memberships')
    .select('league_id, role')
    .eq('user_id', user.id)

  const ids = (memberships || []).map((row) => row.league_id)
  if (!ids.length) return { configured: true, user, leagues: [], teams: [] }

  const [{ data: leagues }, { data: teams }] = await Promise.all([
    supabase.from('fantasy_leagues').select('id,name,status,team_count').in('id', ids).order('created_at'),
    supabase.from('fantasy_teams').select('id,league_id,owner_id,name').in('league_id', ids),
  ])

  return { configured: true, user, leagues: leagues || [], teams: teams || [] }
}

export default async function DashHome({ searchParams }) {
  const params = (await searchParams) || {}
  // Set by dashSignUp on a successful sign-up that produced a session.
  const welcomeName = typeof params.welcome === 'string' && params.welcome ? params.welcome.slice(0, 40) : ''
  const [pulse, me] = await Promise.all([getNetworkPulse(), account()])
  const { mlb, nfl } = pulse
  const displayName = me.user?.user_metadata?.display_name || me.user?.email?.split('@')[0] || null

  return (
    <main className={styles.page} id="top">
      {/* Old /#sport=…&tab=… links land here now. This sends them on to the
          board with the hash intact — see the component for why it cannot be
          done on the server. */}
      <LegacyHashRedirect />
      <header className={styles.bar}>
        <div className={styles.brand}>
          <img src="/icon-192.png" alt="" width="34" height="34" />
          <div><small>DASH</small><strong>NETWORK</strong></div>
        </div>
        <nav className={styles.barNav}>
          <a href="#tonight">Tonight</a>
          <a href="#products">Products</a>
          <a href="#alerts">Alerts</a>
          {me.user
            ? <><Link href="/account">Account</Link><form action={dashSignOut}><input type="hidden" name="next" value="/" /><SubmitButton className={styles.ghost} pendingLabel="Signing out…">Sign out</SubmitButton></form></>
            : <>
              {/* ── THE LABEL WAS THE BUG (2026-08-31) ────────────────────
                  Donovan, on a 45+ user: "couldn't find sign-up at all."
                  He was right, and it was not buried — it was MISLABELLED.
                  The only auth control on this page read "Sign in", and it
                  pointed at a card whose DEFAULT TAB is Create an account.
                  A first-time visitor reads "Sign in", concludes it is for
                  people who already have accounts, and never clicks the one
                  thing that would have signed them up.
                  Two controls now, and the one a stranger needs is the one
                  wearing the button. */}
              <a href="#sign-in">Sign in</a>
              <a className={styles.barCta} href="#create-account">Create account</a>
            </>}
        </nav>
      </header>

      {/* Still here for anyone who lands at the top — but this used to be the
          ONLY place a sign-up error appeared, roughly 1,500px above the form
          it was describing. The card carries its own copy now. */}
      {(params.error || params.message) && (
        <p className={params.error ? styles.error : styles.message}>{params.error || params.message}</p>
      )}

      <section className={styles.hero}>
        <p className={styles.eyebrow}><span>●</span> ONE NETWORK. THREE WAYS TO PLAY.</p>
        <h1>{displayName ? <>Welcome back, {displayName}.</> : <>Every call, <em>graded in public.</em></>}</h1>
        <p className={styles.heroCopy}>
          MOONSHOT reads tonight&apos;s baseball. TUDDY reads the football week. FRANCHISE runs
          your league. Same scoring language, same receipts, one account.
        </p>
        <div className={styles.heroActions}>
          <Link href="/app#sport=mlb&tab=home">Open tonight&apos;s board <b>→</b></Link>
          {/* The hero is what a first-timer actually reads; the auth section is
              at the bottom of a long page. This said "Sign in to save your
              list" — again addressed to somebody who already has an account. */}
          {!me.user && me.configured ? <a href="#create-account">Create a free account</a> : null}
        </div>
      </section>

      <section className={styles.slate} id="tonight">
        <div className={styles.slateHead}><p className={styles.kicker}>ON RIGHT NOW</p><h2>The whole network, one glance.</h2></div>
        <div className={styles.tiles}>
          <Tile label="MLB GAMES" value={mlb?.games} sub={mlb?.live ? `${mlb.live} live` : mlb?.final ? `${mlb.final} final` : 'pre-game'} accent="mlb" />
          <Tile label="CALLED SLOTS" value={mlb?.calls} sub="HR · HIT · HRR · CONTACT" accent="mlb" />
          <Tile label="CLEARED SO FAR" value={mlb?.cleared} sub={mlb?.started ? `of ${mlb.started} that batted` : 'nobody has batted yet'} accent="mlb" />
          <Tile label="HRs ON THE SLATE" value={mlb?.homers} sub={pct(mlb?.capturePct) ? `${pct(mlb.capturePct)} covered by the full sheet` : null} accent="mlb" />
          <Tile label="NFL GAMES" value={nfl?.games} sub={timeUntil(nfl?.kickoff) || nfl?.label} accent="nfl" />
          <Tile label="PLAYERS SCORED" value={nfl?.players} sub={nfl?.label} accent="nfl" />
        </div>
        <p className={styles.stamp}>
          Live from the published payloads, cached two minutes.{mlb?.label ? ` MLB: ${mlb.label}.` : ''}
          {nfl?.label ? ` NFL: ${nfl.label}.` : ''}
        </p>
      </section>

      <section className={styles.products} id="products">
        <article className={`${styles.product} ${styles.mlb}`}>
          <header><i>M</i><div><strong>MOONSHOT</strong><small>MLB</small></div></header>
          <h3>Tonight&apos;s board, graded by morning.</h3>
          <p>Four call categories — HR, HIT, HRR, CONTACT — plus the full ranked board, the pairs, and every receipt the next morning.</p>
          <dl>
            <div><dt>Games</dt><dd>{mlb?.games ?? '—'}</dd></div>
            <div><dt>Cleared / started</dt><dd>{mlb?.cleared ?? '—'} / {mlb?.started ?? '—'}</dd></div>
            <div><dt>HR capture</dt><dd>{pct(mlb?.capturePct) ?? '—'}</dd></div>
          </dl>
          <footer>
            <Link href="/app#sport=mlb&tab=home">Open MOONSHOT →</Link>
            <Link href="/app#sport=mlb&tab=results">Results</Link>
            <Link href="/app#sport=mlb&tab=watch">Your watchlist</Link>
          </footer>
        </article>

        <article className={`${styles.product} ${styles.nfl}`}>
          <header><i>T</i><div><strong>TUDDY</strong><small>NFL</small></div></header>
          <h3>The Six, one call per market.</h3>
          <p>{nfl?.label ? `${nfl.label} — ` : ''}anytime TD, receiving yards, rushing yards, receptions, passing yards and kicker points.</p>
          {nfl?.six?.length ? (
            <ul className={styles.six}>
              {nfl.six.map((call) => (
                <li key={call.key}><small>{call.label}</small><b>{call.name}</b><span>{call.team} · {Math.round(call.score)}</span></li>
              ))}
            </ul>
          ) : (
            <dl><div><dt>Games</dt><dd>{nfl?.games ?? '—'}</dd></div><div><dt>Players scored</dt><dd>{nfl?.players ?? '—'}</dd></div></dl>
          )}
          <footer>
            <Link href="/app#sport=nfl&tab=home">Open TUDDY →</Link>
            <Link href="/app#sport=nfl&tab=boards">Boards</Link>
            <Link href="/app#sport=nfl&tab=watchlist">Your watchlist</Link>
          </footer>
        </article>

        <article className={`${styles.product} ${styles.fantasy}`}>
          <header><i>F</i><div><strong>FRANCHISE</strong><small>FANTASY</small></div></header>
          <h3>Your league, with DASH reading it.</h3>
          {me.user && me.leagues.length ? (
            <ul className={styles.leagues}>
              {me.leagues.map((league) => {
                const mine = me.teams.find((team) => team.league_id === league.id && team.owner_id === me.user.id)
                return (
                  <li key={league.id}>
                    <Link href={`/fantasy/league/${league.id}`}>
                      <b>{league.name}</b>
                      <span>{mine?.name || 'your team'} · {league.status}</span>
                    </Link>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className={styles.muted}>
              {me.user ? 'No leagues yet — create one or enter an invite code.' : 'Draft with friends, run waivers and trades, and get a straight answer when you are stuck.'}
            </p>
          )}
          <footer>
            <Link href="/fantasy">Open FRANCHISE →</Link>
          </footer>
        </article>
      </section>

      <section className={styles.auth} id="sign-in">
        {/* ── WHAT NOW (2026-08-31) ────────────────────────────────────────
            Donovan's third sign-up report: "didn't know what to do after
            signing up." The old flow redirected to `/` — the very page they
            were already on — with no acknowledgement that anything had
            happened. An account was created and the site said nothing.
            Three destinations, because three is a choice and eight is a
            menu, and each one names what it is FOR rather than where it
            goes. */}
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
              <Link href="/app#sport=mlb&tab=home">Open tonight&apos;s board<span>MOONSHOT&apos;s read on tonight&apos;s baseball, graded by morning.</span></Link>
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
              Watchlist, Following, and My Picks on both sports save to this account and turn up on
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
              <p className={styles.kicker}>ONE ACCOUNT, WHOLE NETWORK</p>
              <h2>Keep your list when you switch devices.</h2>
              <span>
                Free, and it changes nothing about reading the site — MOONSHOT and TUDDY are open
                to everyone, signed in or not. What it saves: your watchlist, who you follow, and
                your picks. It is the same login Franchise already uses.
              </span>
            </div>
            <div className={styles.authGrid}>
              {/* notice/defaults come from back() in actions.js: a failed
                  attempt returns here with the name and email already typed,
                  the right tab open, and the reason next to the field rather
                  than at the top of the page. The password is deliberately
                  never carried in a URL. */}
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

      <section className={styles.alertsSection} id="alerts">
        <AlertsPanel styles={styles} />
      </section>

      <footer className={styles.foot}>
        <span>DASH NETWORK</span>
        <Link href="/app#sport=mlb&tab=home">MOONSHOT · MLB</Link>
        <Link href="/app#sport=nfl&tab=home">TUDDY · NFL</Link>
        <Link href="/fantasy">FRANCHISE · FANTASY</Link>
      </footer>
    </main>
  )
}

function Tile({ label, value, sub, accent }) {
  return (
    <div className={`${styles.tile} ${styles[accent] || ''}`}>
      <small>{label}</small>
      <strong>{value ?? '—'}</strong>
      <span>{sub || ''}</span>
    </div>
  )
}
