// /members (2026-10-04, Donovan: "/members page on the site … make it more
// like a digital product"). What's free, what founding members get, how to
// join. It promises only what ships today: the members board and grade that
// lib/dash/membersPost.js posts to the private #members channel (MLB top
// MLB_MEMBERS_N, NFL top NFL_MEMBERS_N, at lock, graded after). Checkout and
// the Discord role are Whop's; the site only links to it (lib/members.js).
import AuthPageHeader from '../../components/AuthPageHeader'
import styles from '../(front)/dash.module.css'
import { membersUrl } from '../../lib/members'
import { MLB_MEMBERS_N, NFL_MEMBERS_N } from '../../lib/dash/membersPost'
import { contactEmail } from '../../lib/siteContact'

export const metadata = {
  title: 'Founding members · DASH Network',
  description: 'Everything on DASH is free. Founding members get the full board before lock in a private Discord, graded after.',
}

const h2 = { margin: '0 0 8px', fontSize: 17, lineHeight: 1.3 }
const ul = { margin: '6px 0 0', paddingLeft: 20 }

export default function MembersPage() {
  const join = membersUrl()
  const contact = contactEmail()
  return (
    <main className={styles.page}>
      <AuthPageHeader />
      <section style={{ maxWidth: 640, margin: '0 auto', padding: '28px 16px 48px', lineHeight: 1.6, fontSize: 15 }}>
        <h1 style={{ margin: '0 0 6px', fontSize: 26, lineHeight: 1.2 }}>Founding members</h1>
        <p style={{ margin: '0 0 18px', opacity: 0.8 }}>$5 a month, first 25 members. Cancel any time.</p>

        <div className={styles.card} style={{ margin: '0 0 14px' }}>
          <h2 style={h2}>Free, for everyone</h2>
          <ul style={ul}>
            <li>The whole site: every board, every player, every page.</li>
            <li>The top five on tonight&apos;s board, posted before first pitch.</li>
            <li>Alerts on your phone for the players you follow.</li>
            <li>Every call graded in public, hits and misses.</li>
          </ul>
        </div>

        <div className={styles.card} style={{ margin: '0 0 14px' }}>
          <h2 style={h2}>Founding members</h2>
          <ul style={ul}>
            <li>The full board at lock, in a private Discord channel: MOONSHOT&apos;s top {MLB_MEMBERS_N} before first pitch, TUDDY&apos;s top {NFL_MEMBERS_N} before kickoff.</li>
            <li>That board graded after the games, in the same channel.</li>
          </ul>
        </div>

        <div className={styles.card} style={{ margin: '0 0 14px' }}>
          <h2 style={h2}>How to join</h2>
          <ol style={ul}>
            <li>Join on Whop. Checkout is Whop&apos;s; DASH never sees your card.</li>
            <li>Connect your Discord in Whop; it adds you to the #members channel.</li>
            <li>Cancel any time in Whop. No refunds for a month already started.</li>
          </ol>
          {join ? (
            <div className={styles.heroActions} style={{ marginTop: 14 }}>
              {/* the front door's own primary button (dash.module.css .heroActions a:first-child) */}
              <a href={join}>Join on Whop <b>→</b></a>
            </div>
          ) : <p style={{ margin: '14px 0 0', opacity: 0.8 }}>Membership opens soon.</p>}
        </div>

        <p style={{ fontSize: 13, opacity: 0.75 }}>
          Information, not advice. 21+ where sports betting is legal. <a href="/terms">Terms</a>
          {contact ? <> · Questions: <a href={`mailto:${contact}`}>{contact}</a></> : null}
        </p>
      </section>
    </main>
  )
}
