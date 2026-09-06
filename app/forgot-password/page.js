// /forgot-password — request a reset link. The other half is /reset-password,
// where the emailed link lands (via /auth/callback) with a real session.

import Link from 'next/link'

import AuthPageHeader from '../../components/AuthPageHeader'
import SubmitButton from '../../components/fantasy/SubmitButton'
import { hasSupabaseConfig } from '../../lib/supabase/config'
import { dashForgotPassword } from '../(front)/actions'
import styles from '../(front)/dash.module.css'
import '../(front)/scroll-anchor.css' // css-loader pure-selector fix, 2026-09-06

export const metadata = { title: 'Reset your password · DASH Network' }
export const dynamic = 'force-dynamic'

export default async function ForgotPasswordPage({ searchParams }) {
  const params = (await searchParams) || {}
  return (
    <main className={styles.page}>
      <AuthPageHeader />

      <section className={styles.auth} style={{ maxWidth: 460, margin: '0 auto', paddingTop: 34 }}>
        {(params.error || params.message) && (
          <p className={params.error ? styles.error : styles.message}>{params.error || params.message}</p>
        )}
        {hasSupabaseConfig() ? (
          <form action={dashForgotPassword} className={styles.card}>
            <p className={styles.kicker}>PASSWORD RESET</p>
            <h3>Forgot your password?</h3>
            <label>Email<input name="email" type="email" autoComplete="email" required /></label>
            <SubmitButton pendingLabel="Sending…">Email me a reset link <span>→</span></SubmitButton>
            <small>The link signs you in and asks for a new password. Nothing changes until you set one.</small>
            <small><Link href="/login" style={{ color: 'inherit' }}>← Back to sign in</Link></small>
          </form>
        ) : (
          <p className={styles.muted}>Accounts aren&apos;t configured on this deploy.</p>
        )}
      </section>
    </main>
  )
}
