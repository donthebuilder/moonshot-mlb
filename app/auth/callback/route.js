import { NextResponse } from 'next/server'

import { createSupabaseServerClient } from '../../../lib/supabase/server'
import { safeNext as validateNext } from '../../../lib/safeNext'

export async function GET(request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  // SEC-2 (2026-09-24): the inline test here let `/\evil.com` become
  // https://evil.com/ in the redirect below. lib/safeNext.js decides now.
  const safeNext = validateNext(url.searchParams.get('next'), '/fantasy')
  const supabase = await createSupabaseServerClient()

  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(safeNext, url.origin))
  }

  return NextResponse.redirect(
    new URL('/fantasy?error=Could%20not%20confirm%20that%20account', url.origin)
  )
}
