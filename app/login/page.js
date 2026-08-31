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

import AuthPageHeader from '../../components/AuthPageHeader'
import DashAuthCard from '../../components/DashAuthCard'
import { hasSupabaseConfig } from '../../lib/supabase/config'
import { createSupabaseServerClient } from '../../lib/supabase/server'
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
      <AuthPageHeader />

      <section className={styles.auth} style={{ maxWidth: 460, margin: '0 auto', paddingTop: 28 }}>
        {/* ── ONE CARD, NOT A SECOND COPY OF IT (2026-08-31) ─────────────
            This page carried its own hand-written sign-in form: its own
            labels, its own inputs, its own microcopy. That is how two forms
            for the same account drift, and it had already happened — the
            front door's card grew tabs, field hints, a 16px input size and
            error handling that returns what you typed, and none of it
            reached here, because none of it was the same code.

            It also meant /login could ONLY sign you in. Somebody who lands
            on the network's canonical sign-in URL without an account — from
            a bookmark, a guess, or a link someone sent them — got a form
            they cannot use and a 10px link at the bottom pointing back to
            the front door. Now the create tab is right there.

            `next` still flows through, so signing in from here still returns
            you where you were. */}
        <DashAuthCard
          next={next}
          notice={params.error || params.message || null}
          noticeType={params.error ? 'error' : 'message'}
          defaultEmail={typeof params.em === 'string' ? params.em : ''}
          defaultName={typeof params.nm === 'string' ? params.nm : ''}
          confirmEmail={typeof params.confirm === 'string' ? params.confirm : ''}
        />
        {!hasSupabaseConfig() ? (
          <p className={styles.muted}>Accounts aren&apos;t configured on this deploy.</p>
        ) : null}
        <p className={styles.authEscape}>
          Forgot your password? <Link href="/forgot-password">Send yourself a reset link →</Link>
        </p>
      </section>
    </main>
  )
}
