// /early/<code>: AN EARLY-ACCESS INVITE LINK (2026-10-12). A neutral page: before sign-in it says only that you have been invited, never which feature.
//   signed out -> /login?next=/early/<code>  (the login page validates `next` with lib/safeNext.js, then brings you straight back here)
//   signed in  -> redeem (atomic, idempotent) and redirect to the feature (lib/features.js landing, e.g. /app#sport=nba)
//   anything else (unknown, expired, used up, revoked, rate-limited, not set up yet, error) -> ONE generic message, the same words for every reason.
// Never indexed, never cached, no Referer sent (the code is in the address). The code is never logged. lib/earlyAccess/redeemFlow.js holds the decision.
import { redirect } from 'next/navigation'
import { headers } from 'next/headers'
import { hasSupabaseConfig } from '../../../lib/supabase/config'
import { createSupabaseServerClient } from '../../../lib/supabase/server'
import { adminClient } from '../../../lib/supabase/admin'
import { early } from '../../../lib/earlyAccess/redeemFlow'
import start from '../../start/start.module.css'

export const dynamic = 'force-dynamic'
export const metadata = {
  title: 'Early access · DASH Network',
  robots: { index: false, follow: false, nocache: true },
  referrer: 'no-referrer',
}

export default async function EarlyPage({ params }) {
  const { code } = await params
  const h = await headers()
  const ip = String(h.get('x-forwarded-for') || h.get('x-real-ip') || 'unknown').split(',')[0].trim()
  let user = null
  try {
    if (hasSupabaseConfig()) {
      const supabase = await createSupabaseServerClient()
      const r = await supabase.auth.getUser()
      user = r?.data?.user || null
    }
  } catch { user = null }
  let result = { failed: true }
  try {
    result = await early({ code, user, db: user ? adminClient() : null, ip, log: (why) => console.warn(`[early] not redeemed: ${why}`) })
  } catch { result = { failed: true } }
  if (result.to) redirect(result.to)

  return (
    <main className={start.page}>
      <header className={start.bar}>
        <a className={start.brand} href="/" aria-label="DASH Network home" style={{ minHeight: 44 }}>
          <img src="/icon-192.png" alt="" width="30" height="30" />
          <div><small>DASH NETWORK</small><strong>EARLY ACCESS</strong></div>
        </a>
      </header>
      <section style={{ padding: '28px 0 40px', maxWidth: 460, margin: '0 auto' }}>
        <div className={start.panel}>
          <h1 style={{ margin: '0 0 10px', fontSize: 20, lineHeight: 1.25 }}>This invite link is not working</h1>
          <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: 'var(--dim)' }}>
            It may have expired, been used already or been turned off. Ask the person who sent it for a new one.
          </p>
          <a href="/" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 48, marginTop: 18, border: '1px solid var(--line)', borderRadius: 12, color: 'inherit', textDecoration: 'none', fontWeight: 800, fontSize: 15 }}>Go to DASH Network</a>
        </div>
      </section>
    </main>
  )
}
