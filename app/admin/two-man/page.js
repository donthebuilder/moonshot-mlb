// /admin/two-man: DONOVAN'S TWO-MAN (2026-10-10). The form where he enters his two players and a one-to-three line note BEFORE the lock.
//
// ACCESS: the same gate as /admin (signed in AND a CONFIRMED email that is in ADMIN_EMAILS: lib/admin.js isAdminUser); anyone else gets a 404, not
// "forbidden". The 404 says why in the SERVER LOG only (adminDenyReason: signed-out / allow-list-env-missing / email-not-listed / email-unconfirmed).
// ALWAYS OPEN (2026-10-12): the form takes an entry at any time. /api/admin/two-man stores it as the verified entry when it is on time (before the lock
// and before any leg's game starts; the database trigger 202610101000_card_calls.sql holds that), and as LATE otherwise (lane 'donovan_late',
// 202610121100_card_calls_late.sql): never in the record, never posted, never public. After the lock an on-time entry is free to display, with his note,
// as "Donovan's Two-Man", in its own record (never mixed into the bot's).
import { notFound } from 'next/navigation'
import { hasSupabaseConfig } from '../../../lib/supabase/config'
import { createSupabaseServerClient } from '../../../lib/supabase/server'
import { isAdminUser, adminDenyReason } from '../../../lib/admin'
import start from '../../start/start.module.css'
import TwoManForm from '../../../components/admin/TwoManForm'

export const dynamic = 'force-dynamic'
export async function generateMetadata() {
  const robots = { index: false, follow: false }
  try {
    if (!hasSupabaseConfig()) return { title: 'Not found · DASH Network', robots }
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    return { title: user && isAdminUser(user) ? 'Two-Man · admin · DASH Network' : 'Not found · DASH Network', robots }
  } catch { return { title: 'Not found · DASH Network', robots } }
}

export default async function TwoManAdminPage() {
  if (!hasSupabaseConfig()) notFound()
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminUser(user)) { console.warn(`[admin/two-man] 404: ${adminDenyReason(user)}`); notFound() }
  return (
    <main className={start.page}>
      <header className={start.bar}>
        <a className={start.brand} href="/admin" aria-label="Back to admin">
          <img src="/icon-192.png" alt="" width="30" height="30" />
          <div><small>DASH NETWORK</small><strong>DONOVAN&apos;S TWO-MAN</strong></div>
        </a>
      </header>
      <section style={{ padding: '18px 0 40px', maxWidth: 640 }}>
        <TwoManForm />
      </section>
    </main>
  )
}
