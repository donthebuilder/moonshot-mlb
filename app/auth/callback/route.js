import { NextResponse } from 'next/server'

import { createSupabaseServerClient } from '../../../lib/supabase/server'

export async function GET(request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') || '/fantasy'
  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/fantasy'
  const supabase = await createSupabaseServerClient()

  if (code && supabase) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) return NextResponse.redirect(new URL(safeNext, url.origin))
  }

  return NextResponse.redirect(
    new URL('/fantasy?error=Could%20not%20confirm%20that%20account', url.origin)
  )
}
