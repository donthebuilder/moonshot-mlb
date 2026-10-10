// /admin/two-man: DONOVAN'S TWO-MAN (2026-10-10). The form where he enters his two players and a one-to-three line note BEFORE the lock.
//
// ACCESS: the same gate as /admin (signed in AND the account's email in ADMIN_EMAILS); anyone else gets a 404, not "forbidden".
// The entry is saved by /api/admin/two-man, which refuses once any game has started or the lock has passed; the database trigger
// (supabase/migrations/202610101000_card_calls.sql) refuses it too. After the lock his Two-Man is free to display, with his note, as
// "Donovan's Two-Man", in its own record (never mixed into the bot's).
import { notFound } from 'next/navigation'
import { hasSupabaseConfig } from '../../../lib/supabase/config'
import { createSupabaseServerClient } from '../../../lib/supabase/server'
import { isAdminEmail } from '../../../lib/admin'
import start from '../../start/start.module.css'
import TwoManForm from '../../../components/admin/TwoManForm'

export const dynamic = 'force-dynamic'
export async function generateMetadata() {
  const robots = { index: false, follow: false }
  try {
    if (!hasSupabaseConfig()) return { title: 'Not found · DASH Network', robots }
    const supabase = await createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    return { title: user && isAdminEmail(user.email) ? 'Two-Man · admin · DASH Network' : 'Not found · DASH Network', robots }
  } catch { return { title: 'Not found · DASH Network', robots } }
}

export default async function TwoManAdminPage() {
  if (!hasSupabaseConfig()) notFound()
  const supabase = await createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user || !isAdminEmail(user.email)) notFound()
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
