// /login — the network's one canonical sign-in URL.
//
// Until 2026-08-29 there was no login route at all: sign-in lived only as a
// form stranded eight screens down the front door and again on /fantasy, and
// /fantasy/login (the URL people guess, and type, and bookmark) was a bare
// Next 404. This page is what those guesses now find. It reuses the front
// door's own auth actions and stylesheet so it is the same account and the
// same look, just addressable.
//
// ?next=/where/you/were is honored the same way the front door's forms honor
// it (dashSignIn already validates it against open redirects server-side).

import Link from 'next/link'
import { redirect } from 'next/navigation'

import PasswordInput from '../../components/PasswordInput'
import SubmitButton from '../../components/fantasy/SubmitButton'
import { hasSupabaseConfig } from '../../lib/supabase/config'
import { createSupabaseServerClient } from '../../lib/supabase/server'
import { dashSignIn } from '../(front)/actions'
import styles from '../(front)/dash.module.css'

export const metadata = { title: 'Sign in · DASH Network' }
export const dynamic = 'force-dynamic'

function safeNext(value) {
  const next = String(value || '/')
  return next.startsWith('/') && !next.startsWith('//') ? next : '/'
}

export default async function LoginPage({ searchParams }) {
  const params = (await searchParams) || {}
  const next = safeNext(params.next)

  if (hasSupabaseConfig()) {
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (user) redirect(next)
  }

  return (
    <main className={styles.page}>
      <div className={styles.bar}>
        <Link className={styles.brand} href="/">
          <img src="/icon-192.png" alt="" width="34" height="34" />
          <div><small>DASH</small><strong>NETWORK</strong></div>
        </Link>
      </div>

      <section className={styles.auth} style={{ maxWidth: 460, margin: '0 auto', paddingTop: 34 }}>
        {(params.error || params.message) && (
          <p className={params.error ? styles.error : styles.message}>{params.error || params.message}</p>
        )}
        {hasSupabaseConfig() ? (
          <form action={dashSignIn} className={styles.card}>
            <p className={styles.kicker}>ONE ACCOUNT, WHOLE NETWORK</p>
            <h3>Sign in</h3>
            <input type="hidden" name="next" value={next} />
            <label>Email<input name="email" type="email" autoComplete="email" required /></label>
            <label>Password<PasswordInput autoComplete="current-password" /></label>
            <SubmitButton pendingLabel="Signing in…">Sign in <span>→</span></SubmitButton>
            <small>
              <Link href="/forgot-password" style={{ color: 'inherit' }}>Forgot your password?</Link>
              {' · '}
              <Link href="/#create-account" style={{ color: 'inherit' }}>New here? Create a free account</Link>
            </small>
            <small>Same login across MOONSHOT, TUDDY, and FRANCHISE.</small>
          </form>
        ) : (
          <p className={styles.muted}>Accounts aren&apos;t configured on this deploy.</p>
        )}
      </section>
    </main>
  )
}
