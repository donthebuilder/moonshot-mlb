'use client'

// One auth card with a Create/Sign-in toggle — replaces the front door's two
// stacked full-size forms (2026-08-29 review: "one card with a toggle halves
// the wall of inputs"; Donovan: yes). The old anchors keep working: the
// section that hosts this card still carries id="sign-in", an inner target
// carries id="create-account", and the hash picks the tab — a bookmark or
// nav link to either lands on the right form, and switching later via the
// nav (hashchange) flips the tab without a scroll jump.
//
// ── REBUILT FOR SOMEBODY WHO HAS NEVER SEEN IT (2026-08-31) ─────────────────
//
// Donovan: "the sign up process is hard on both mobile and desktop please make
// cool easier and more intucate and user freidnly. user was 45+ that had
// problems." Three failures were reported and all three are real:
//
//   COULDN'T FIND IT. The nav's only auth control read "Sign in" — and it
//   pointed at a card whose default tab is Create an account. A first-time
//   visitor reads "Sign in", concludes it is for people who already have
//   accounts, and never clicks. Fixed on the page, not here.
//
//   THE FORM ITSELF. Two things. The rules were secret until you broke them:
//   the 8-character minimum lived in a server error message, so you learned it
//   by failing. And a failure emptied every field and threw you to the top of
//   a long page (see back() in app/(front)/actions.js). Both fixed — the rule
//   is stated under the field before you type, and a bounce now returns your
//   name and email so only the broken field needs touching.
//
//   NO IDEA WHAT HAPPENED NEXT. "Check your email to confirm your account"
//   rendered as one line at the top of the page while this card sat unchanged
//   below, looking like the button had done nothing. Now the card REPLACES
//   itself with the instruction, which is the only thing that happens next.
//
// The notice also renders inside the card, because a message about this form
// belongs next to this form — it was previously only at the top of the page.

import Link from 'next/link'
import { useEffect, useState } from 'react'

import PasswordInput from './PasswordInput'
import SubmitButton from './fantasy/SubmitButton'
import { dashSignIn, dashSignUp } from '../app/(front)/actions'
import styles from '../app/(front)/dash.module.css'

export default function DashAuthCard({
  next = '/',
  notice = null,
  noticeType = 'error',
  defaultEmail = '',
  defaultName = '',
  confirmEmail = '',
}) {
  // Open on whichever form the person was last using. A failed sign-up that
  // reopened as a blank sign-in form was its own small betrayal.
  const [mode, setMode] = useState(noticeType === 'error' && !defaultName && defaultEmail ? 'signin' : 'create')

  useEffect(() => {
    const fromHash = () => {
      const hash = window.location.hash
      if (hash === '#sign-in') setMode('signin')
      if (hash === '#create-account') setMode('create')
    }
    fromHash()
    window.addEventListener('hashchange', fromHash)
    return () => window.removeEventListener('hashchange', fromHash)
  }, [])

  // ── THE CONFIRM STATE ─────────────────────────────────────────────────────
  // The account exists and the only remaining step is in their inbox. Showing
  // the form here would be actively misleading — there is nothing left to fill
  // in — so the card becomes the instruction instead.
  if (confirmEmail) {
    return (
      <div className={styles.card} style={{ maxWidth: 460 }}>
        <span id="create-account" />
        <h3>Check your email</h3>
        <p className={styles.confirmLead}>
          Your account is made. We sent a confirmation link to{' '}
          <b className={styles.confirmMail}>{confirmEmail}</b> — open it and you are in.
        </p>
        <ul className={styles.confirmList}>
          <li>It usually lands within a minute.</li>
          <li>If it is not there, look in <b>spam</b> or <b>promotions</b> — that is where it goes most often.</li>
          <li>The link signs you in on the device you open it on, so open it on this one if you can.</li>
        </ul>
        <p className={styles.confirmLead}>
          Nothing else is needed from you here. You can keep reading the site in the meantime —
          MOONSHOT and TUDDY are open whether you are signed in or not.
        </p>
        <div style={{ marginTop: 14 }}>
          <Link className={styles.barCta} href="/app#sport=mlb&tab=home">Open tonight&apos;s board →</Link>
        </div>
      </div>
    )
  }

  const create = mode === 'create'
  return (
    <div className={styles.card} style={{ maxWidth: 460 }}>
      <span id="create-account" />
      <div className={styles.authTabs} role="tablist" aria-label="Create an account or sign in">
        <button aria-selected={create} className={create ? styles.authTabActive : ''} onClick={() => setMode('create')} role="tab" type="button">New here · free</button>
        <button aria-selected={!create} className={!create ? styles.authTabActive : ''} onClick={() => setMode('signin')} role="tab" type="button">Welcome back</button>
      </div>

      {/* The message about this form, next to this form. It stays at the top
          of the page too, for anyone who lands there — but that copy was the
          ONLY one, roughly 1,500px from the field it was describing. */}
      {notice ? (
        <p className={noticeType === 'error' ? styles.error : styles.message} role="alert" style={{ marginBottom: 14 }}>
          {notice}
        </p>
      ) : null}

      {create ? (
        <form action={dashSignUp} key="create">
          <h3>Create an account</h3>
          <input type="hidden" name="next" value={next} />
          <label>Your name
            <input name="displayName" autoComplete="name" defaultValue={defaultName} maxLength="40" required />
            <small className={styles.hint}>What the site calls you. A first name is plenty.</small>
          </label>
          <label>Email
            <input name="email" type="email" autoComplete="email" defaultValue={defaultEmail} required />
            <small className={styles.hint}>We send one confirmation link here. Nothing else.</small>
          </label>
          <label>Password
            <PasswordInput autoComplete="new-password" minLength={8} />
            {/* Stated BEFORE you type it. This rule used to live in a server
                error message, which meant the only way to learn it was to
                fail and lose the form. */}
            <small className={styles.hint}>At least 8 characters. Tap SHOW to check what you typed.</small>
          </label>
          <SubmitButton pendingLabel="Creating your account…">Create account <span>→</span></SubmitButton>
          <small>Free. No card, no payment screen, and the site stays readable without an account.</small>
        </form>
      ) : (
        <form action={dashSignIn} key="signin">
          <h3>Sign in</h3>
          <input type="hidden" name="next" value={next} />
          <label>Email
            <input name="email" type="email" autoComplete="email" defaultValue={defaultEmail} required />
          </label>
          <label>Password
            <PasswordInput autoComplete="current-password" />
          </label>
          <SubmitButton pendingLabel="Signing in…">Sign in <span>→</span></SubmitButton>
          <small>Already have a Franchise login? That&apos;s this one.</small>
          <small><Link href="/forgot-password">Forgot your password?</Link></small>
        </form>
      )}
    </div>
  )
}
