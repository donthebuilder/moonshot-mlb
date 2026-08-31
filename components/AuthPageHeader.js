// The header every standalone auth page wears — /login, /forgot-password,
// /reset-password.
//
// ── 2026-08-31 ──────────────────────────────────────────────────────────────
// Donovan, on a 45+ user: "it was hard for them to find a home button on the
// sign up." The front door's version of that is fixed in the same pass (the
// bar is sticky now, and its mark is a link). These three pages had the OTHER
// half of the problem, which is subtler and worth naming:
//
//   · Each carried a lone brand mark and nothing else. One link, no label on
//     it, no indication it was a link at all — and on a page whose entire job
//     is to be a dead end you get out of, one unlabelled link is thin.
//   · The three did not agree on where home IS. /login's mark went to /app
//     (deliberately — see its own note), /forgot-password and /reset-password
//     went to /. Same logo, same corner, two destinations.
//
// Both destinations are legitimate, and that is the actual answer: they are
// different places and both are worth offering. The mark goes to the network
// front door, because that is what a logo means everywhere else on the web and
// what pass 19 made it mean inside MOONSHOT and TUDDY. The board gets its own
// labelled link beside it, because somebody who has just failed to sign in
// mostly wants to read the site, and "you can use this without an account" is
// only true if it is reachable.

import Link from 'next/link'

import styles from '../app/(front)/dash.module.css'

export default function AuthPageHeader({ styles: s = styles }) {
  return (
    <header className={s.bar}>
      <Link className={s.brand} href="/" aria-label="DASH Network home">
        <img src="/icon-192.png" alt="" width="34" height="34" />
        <div><small>DASH</small><strong>NETWORK</strong></div>
      </Link>
      <nav className={s.barNav}>
        {/* 2026-08-31: the mark was the only way home and carried no word.
            A labelled one sits beside the board link, so the two exits from
            this page look like exits. Plain, because .barNav a already
            styles it and .barNavSection is the only thing a phone hides. */}
        <Link href="/" aria-label="DASH Network home">⌂ Home</Link>
        <Link className={s.barCta} href="/app#sport=mlb&tab=home">Open the board</Link>
      </nav>
    </header>
  )
}
