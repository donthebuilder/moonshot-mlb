'use client'

// One auth card with a Create/Sign-in toggle — replaces the front door's two
// stacked full-size forms (2026-08-29 review: "one card with a toggle halves
// the wall of inputs"; Donovan: yes). The old anchors keep working: the
// section that hosts this card still carries id="sign-in", an inner target
// carries id="create-account", and the hash picks the tab — a bookmark or
// nav link to either lands on the right form, and switching later via the
// nav (hashchange) flips the tab without a scroll jump.

import Link from 'next/link'
import { useEffect, useState } from 'react'

import PasswordInput from './PasswordInput'
import SubmitButton from './fantasy/SubmitButton'
import { dashSignIn, dashSignUp } from '../app/(front)/actions'
import styles from '../app/(front)/dash.module.css'

export default function DashAuthCard({ next = '/' }) {
  const [mode, setMode] = useState('create')

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

  const create = mode === 'create'
  return (
    <div className={styles.card} style={{ maxWidth: 460 }}>
      <span id="create-account" />
      <div className={styles.authTabs} role="tablist" aria-label="Create an account or sign in">
        <button aria-selected={create} className={create ? styles.authTabActive : ''} onClick={() => setMode('create')} role="tab" type="button">New here · free</button>
        <button aria-selected={!create} className={!create ? styles.authTabActive : ''} onClick={() => setMode('signin')} role="tab" type="button">Welcome back</button>
      </div>
      {create ? (
        <form action={dashSignUp} key="create">
          <h3>Create an account</h3>
          <input type="hidden" name="next" value={next} />
          <label>Your name<input name="displayName" autoComplete="name" maxLength="40" required /></label>
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<PasswordInput autoComplete="new-password" minLength={8} /></label>
          <SubmitButton pendingLabel="Creating your account…">Create account <span>→</span></SubmitButton>
          <small>No card, no payment screen.</small>
        </form>
      ) : (
        <form action={dashSignIn} key="signin">
          <h3>Sign in</h3>
          <input type="hidden" name="next" value={next} />
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<PasswordInput autoComplete="current-password" /></label>
          <SubmitButton pendingLabel="Signing in…">Sign in <span>→</span></SubmitButton>
          <small>Already have a Franchise login? That&apos;s this one.</small>
          <small><Link href="/forgot-password">Forgot your password?</Link></small>
        </form>
      )}
    </div>
  )
}
