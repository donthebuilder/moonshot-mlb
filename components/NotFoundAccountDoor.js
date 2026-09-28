'use client'
import Link from 'next/link'
import { useDashAccount } from '../lib/dash/sync'

// The 404's account door, decided in the browser (2026-09-27, audit 00A
// fix 4). It used to be decided on the server -- cookies() + auth.getUser()
// inside app/not-found.js -- and Next renders the root not-found into EVERY
// route, so that one check made every page private/no-store and waited on
// Supabase Auth each visit (TTFB 3.5-18 s on /app). DashSync (root layout)
// already learns who is signed in from /api/dash/state; this reads that.
// Until it knows, the door says SIGN IN -- the #86 behaviour for everyone
// signed out, and one render later the right door for everyone signed in.
export default function NotFoundAccountDoor({ style }) {
  const account = useDashAccount()
  return account.signedIn
    ? <Link href="/dash" style={style}>YOUR DASHBOARD</Link>
    : <Link href="/login" style={style}>SIGN IN</Link>
}
