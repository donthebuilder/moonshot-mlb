// /reset-password — where the emailed recovery link lands. By the time a
// person is here, /auth/callback has already exchanged the link's code for a
// real session, so "signed in" is the expected state and the form only has to
// set the new password. Arriving here signed OUT means the link was opened
// cold (expired, or typed by hand) — say so plainly and point at the request
// form instead of rendering a form that can only fail.

import Link from 'next/link'

import PasswordInput from '../../components/PasswordInput'
import SubmitButton from '../../components/fantasy/SubmitButton'
import { hasSupabaseConfig } from '../../lib/supabase/config'
import { createSupabaseServerClient } from '../../lib/supabase/server'
import { dashResetPassword } from '../(front)/actions'
import styles from '../(front)/dash.module.css'

export const metadata = { title: 'Set a new password · DASH Network' }
export const dynamic = 'force-dynamic'

export default async function ResetPasswordPage({ searchParams }) {
  const params = (await searchParams) || {}

  let user = null
  if (hasSupabaseConfig()) {
    const supabase = await createSupabaseServerClient()
    user = (await supabase.auth.getUser()).data.user
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
        {!hasSupabaseConfig() ? (
          <p className={styles.muted}>Accounts aren&apos;t configured on this deploy.</p>
        ) : user ? (
          <form action={dashResetPassword} className={styles.card}>
            <p className={styles.kicker}>ALMOST DONE</p>
            <h3>Set a new password</h3>
            <label>New password<PasswordInput autoComplete="new-password" minLength={8} /></label>
            <label>Type it again<PasswordInput name="confirm" autoComplete="new-password" minLength={8} /></label>
            <SubmitButton pendingLabel="Saving…">Save new password <span>→</span></SubmitButton>
            <small>At least 8 characters. You stay signed in on this device once it saves.</small>
          </form>
        ) : (
          <div className={styles.card}>
            <p className={styles.kicker}>LINK NOT ACTIVE</p>
            <h3>Open the link from your email</h3>
            <p className={styles.muted}>
              This page only works right after following a reset link, and this visit didn&apos;t
              arrive through one — the link may have expired.
            </p>
            <small><Link href="/forgot-password" style={{ color: 'inherit' }}>Request a new reset link →</Link></small>
          </div>
        )}
      </section>
    </main>
  )
}
