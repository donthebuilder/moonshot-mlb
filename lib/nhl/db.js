// Supabase for LAMP's record — server only (service role), never imported
// by a client component. Same three secrets the other crons accept
// (CRON_SECRET is what Vercel sends; CALLEDIT_SECRET is the manual-fire key).
import { createClient } from '@supabase/supabase-js'
import { timingSafeEqual } from 'node:crypto'

export function cronAuthorized(request) {
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (!supplied) return false
  return [process.env.CRON_SECRET, process.env.FRANCHISE_CRON_SECRET, process.env.CALLEDIT_SECRET].filter(Boolean).some((expected) => {
    const a = Buffer.from(supplied); const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  })
}

export function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}
