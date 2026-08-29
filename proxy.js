import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'

export async function proxy(request) {
  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  ) {
    return NextResponse.next()
  }

  let response = NextResponse.next({ request })
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  await supabase.auth.getUser()
  return response
}

// THE MATCHER IS THE WHOLE NETWORK NOW (2026-08-28).
//
// It was scoped to Franchise because Franchise was the only thing with an
// account. The account is network-wide as of this change — the DASH front door
// signs you in, and MOONSHOT and TUDDY save your watchlist and picks to it
// (lib/dash/sync.js) — so the session cookie has to be refreshed on the pages
// that read it, not just on /fantasy.
//
// WHAT IS DELIBERATELY NOT HERE: any gate. This refreshes a session; it has
// never denied a request and must not start. MOONSHOT and TUDDY stay fully
// readable signed out, forever — the account adds saving, it does not buy
// entry. /api/dash/:path* answers signed-out requests with an empty bag and a
// 200 for exactly the same reason.
//
// Listed path by path rather than as a catch-all with exclusions: every entry
// here is a page or route that actually reads the session, and a matcher that
// ran on images and build output would buy nothing but latency.
export const config = {
  matcher: [
    '/',
    '/app',
    '/dash/:path*',
    '/fantasy/:path*',
    '/auth/:path*',
    '/api/dash/:path*',
  ],
}
