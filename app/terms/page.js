// /terms (2026-09-30, BATCH-MEMBERS M2). The network's terms in plain words,
// Donovan's own statement -- not legal advice. Static, indexable, linked
// from the footers of /start, /called and /login.
//
// The words are BATCH-MEMBERS-PLAN.md's TERMS DRAFT, verbatim (Donovan
// approved them 2026-10-01). The contact address is the one he gave.
import AuthPageHeader from '../../components/AuthPageHeader'
import styles from '../(front)/dash.module.css'
import { contactEmail } from '../../lib/siteContact'

export const metadata = {
  title: 'Terms · DASH Network',
  description: 'DASH Network shows sports data and a model’s reads. Information, not advice. 21+.',
}

export default function TermsPage() {
  // Donovan, 2026-10-01: donto123@gmail.com until there is a DASH address.
  // NEXT_PUBLIC_CONTACT_EMAIL overrides it without a code change.
  const contact = contactEmail()
  return (
    <main className={styles.page}>
      <AuthPageHeader />
      <section style={{ maxWidth: 620, margin: '0 auto', padding: '28px 16px 48px', lineHeight: 1.6, fontSize: 15 }}>
        <h1 style={{ margin: '0 0 14px', fontSize: 26, lineHeight: 1.2 }}>Terms</h1>
        <p>DASH Network shows sports data and a model&apos;s reads. It is information, not advice; nothing here is a guarantee of any result.</p>
        <p>You must be 21 or older where sports betting is legal, and responsible for your own decisions and the laws where you live.</p>
        <p id="disclaimer">DASH Network is stats and analysis for entertainment: measured data, graded in public. It is <b>not financial, betting, or investment advice</b>, and nothing here is a recommendation to wager. If you bet, that&apos;s your decision and your responsibility. Play responsibly.</p>
        <p>Membership is month to month; cancel any time in Whop; no refunds for a month already started.</p>
        <p>Every call is graded in public, hits and misses.</p>
        {contact ? <p>Questions: <a href={`mailto:${contact}`}>{contact}</a></p> : null}
      </section>
    </main>
  )
}
