// ⚙ YOUR ACCOUNT.
//
// 2026-08-28, Donovan: "we need user setting like name changing and things
// like that."
//
// Until the account went network-wide there was nothing to settle: the only
// thing an account did was hold a Franchise league, and the name came from
// the sign-up form and stayed there forever. Now it greets you on the front
// door, owns your watchlist and your picks, and decides which alerts reach
// your phone — so it needs a place where you can see what it knows and change
// it.
//
// FOUR THINGS, and nothing else on purpose:
//   · your name        — the one thing people actually ask to change
//   · your email       — with the confirmation caveat stated, not buried
//   · your password
//   · what is saved to it, in plain words, with the way out
//
// NOT HERE: alert settings. Those live on the front door beside the thing
// they alert about (`/#alerts`), which is where a person is when they think
// "not this one". Two settings pages that each hold half the settings is
// worse than one that admits where the other half is, so this links there.

import Link from 'next/link'

import SubmitButton from '../../components/fantasy/SubmitButton'
import DeviceData from '../../components/DeviceData'
import { hasSupabaseConfig } from '../../lib/supabase/config'
import { createSupabaseServerClient } from '../../lib/supabase/server'
import { signOutEverywhere, updateDisplayName, updateEmail, updatePassword } from './actions'
import { dashSignOut } from '../(front)/actions'
import styles from '../(front)/dash.module.css'

export const metadata = { title: 'Your account · DASH Network' }
export const dynamic = 'force-dynamic'

export default async function AccountPage({ searchParams }) {
  const params = (await searchParams) || {}

  if (!hasSupabaseConfig()) {
    return (
      <main className={styles.page}>
        <Bar />
        <section className={styles.auth}>
          <p className={styles.muted}>Accounts aren&apos;t configured on this deploy.</p>
        </section>
      </main>
    )
  }

  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className={styles.page}>
        <Bar />
        <section className={styles.auth}>
          <div className={styles.authIntro}>
            <p className={styles.kicker}>YOUR ACCOUNT</p>
            <h2>Sign in to see it.</h2>
            <span>Nothing on MOONSHOT or TUDDY needs an account — this page is only for the one you have.</span>
          </div>
          <p className={styles.muted}><Link href="/#sign-in">Sign in on the front door →</Link></p>
        </section>
      </main>
    )
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('display_name, created_at')
    .eq('id', user.id)
    .maybeSingle()

  const displayName = profile?.display_name || user.user_metadata?.display_name || ''
  const since = profile?.created_at || user.created_at

  return (
    <main className={styles.page} id="top">
      <Bar />

      {(params.error || params.message) && (
        <p className={params.error ? styles.error : styles.message}>{params.error || params.message}</p>
      )}

      <section className={styles.hero}>
        <p className={styles.eyebrow}><span>●</span> YOUR ACCOUNT</p>
        <h1>{displayName || 'Your account'}</h1>
        <p className={styles.heroCopy}>
          {user.email}
          {since ? ` · with DASH since ${new Date(since).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}` : ''}
        </p>
      </section>

      <section className={styles.authGrid}>
        <form action={updateDisplayName} className={styles.card}>
          <p className={styles.kicker}>YOUR NAME</p>
          <h3>What people see</h3>
          <p className={styles.muted}>Used to greet you here and to name you in every Franchise league you are in.</p>
          <label>Display name<input name="displayName" defaultValue={displayName} maxLength="40" autoComplete="name" required /></label>
          <SubmitButton pendingLabel="Saving…">Save name</SubmitButton>
        </form>

        <form action={updateEmail} className={styles.card}>
          <p className={styles.kicker}>YOUR EMAIL</p>
          <h3>Where we reach you</h3>
          <p className={styles.muted}>
            Changing this sends a confirmation link to the new address. Your old email keeps
            working until you click it.
          </p>
          <label>Email<input name="email" type="email" defaultValue={user.email || ''} autoComplete="email" required /></label>
          <SubmitButton pendingLabel="Sending…">Change email</SubmitButton>
        </form>

        <form action={updatePassword} className={styles.card}>
          <p className={styles.kicker}>YOUR PASSWORD</p>
          <h3>Change it</h3>
          <p className={styles.muted}>At least eight characters. You stay signed in here.</p>
          <label>New password<input name="password" type="password" minLength="8" autoComplete="new-password" required /></label>
          <label>Again<input name="confirm" type="password" minLength="8" autoComplete="new-password" required /></label>
          <SubmitButton pendingLabel="Changing…">Change password</SubmitButton>
        </form>
      </section>

      <section className={styles.alertsSection}>
        <p className={styles.kicker}>WHAT THIS ACCOUNT HOLDS</p>
        <h2>Everything you save, and nothing you don&apos;t.</h2>
        <p className={styles.muted}>
          Your watchlist, who you follow, your picks on both sports, your watchlist record and your
          alert choices. That is the whole list — it is what makes them turn up on your phone as
          well as here. Which alerts you get is set{' '}
          <Link href="/#alerts">on the front door</Link>, next to the things they are about.
        </p>
        <DeviceData styles={styles} />
      </section>

      <section className={styles.alertsSection}>
        <p className={styles.kicker}>SIGNING OUT</p>
        <h2>This device, or all of them.</h2>
        <p className={styles.muted}>
          Signing out here leaves everything on your account and simply stops this browser reading
          it. Signing out <em>everywhere</em> also kicks out every other phone and laptop — the one
          to use if you think somebody else has your password.
        </p>
        <div className={styles.signOutRow}>
          <form action={dashSignOut}>
            <input type="hidden" name="next" value="/" />
            <SubmitButton pendingLabel="Signing out…">Sign out</SubmitButton>
          </form>
          <form action={signOutEverywhere}>
            <SubmitButton className={styles.danger} pendingLabel="Signing out everywhere…">Sign out everywhere</SubmitButton>
          </form>
        </div>
      </section>

      <footer className={styles.foot}>
        <span>DASH NETWORK</span>
        <Link href="/">Front door</Link>
        <Link href="/app#sport=mlb&tab=home">MOONSHOT · MLB</Link>
        <Link href="/app#sport=nfl&tab=home">TUDDY · NFL</Link>
        <Link href="/fantasy">FRANCHISE · FANTASY</Link>
      </footer>
    </main>
  )
}

function Bar() {
  return (
    <header className={styles.bar}>
      <Link className={styles.brand} href="/">
        <img src="/icon-192.png" alt="" width="34" height="34" />
        <div><small>DASH</small><strong>NETWORK</strong></div>
      </Link>
      <nav className={styles.barNav}>
        <Link href="/">Front door</Link>
        <Link href="/#alerts">Alerts</Link>
      </nav>
    </header>
  )
}
