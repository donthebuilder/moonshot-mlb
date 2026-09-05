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

  const { data: { user } } = await supabase.auth.getUser()

  // THE GATE (2026-09-05). Donovan: "the whole site needs to be behind a sign
  // up if it already isn't — no just free link and look around." Until today
  // this file refreshed a session and never denied a request. Now the boards
  // and the leagues need an account; what stays open is exactly what brings
  // people to the door:
  //
  //   /            the front door — it IS the sign-up form
  //   /called      the public record every X post links to (the funnel)
  //   /login etc.  the auth pages themselves
  //   /api/*       cron routes carry their own bearer check, card images are
  //                what X embeds, and the dash routes already answer a
  //                signed-out request with an empty bag
  //
  // A signed-out hit on a gated page goes to /login carrying where it was
  // going, so signing in lands them there. The fragment (`#sport=mlb&tab=…`)
  // survives the redirect in every browser; it is not part of `next`.
  if (!user && isGated(request.nextUrl.pathname)) {
    const url = request.nextUrl.clone()
    const next = `${request.nextUrl.pathname}${request.nextUrl.search}`
    url.pathname = '/login'
    url.search = `?next=${encodeURIComponent(next)}`
    return NextResponse.redirect(url)
  }
  return response
}

const GATED = [/^\/app(\/|$)/, /^\/fantasy(\/|$)/, /^\/account(\/|$)/]
const isGated = (pathname) => GATED.some((re) => re.test(pathname))

// THE MATCHER IS THE WHOLE NETWORK NOW (2026-08-28).
//
// It was scoped to Franchise because Franchise was the only thing with an
// account. The account is network-wide as of this change — the DASH front door
// signs you in, and MOONSHOT and TUDDY save your watchlist and picks to it
// (lib/dash/sync.js) — so the session cookie has to be refreshed on the pages
// that read it, not just on /fantasy.
//
// THE GATE LIVES HERE TOO, as of 2026-09-05 — see isGated above. The earlier
// rule ("MOONSHOT and TUDDY stay fully readable signed out, forever") was
// reversed by Donovan that night: an account buys entry to the boards and the
// leagues now. /api/dash/:path* still answers a signed-out request with an
// empty bag and a 200 — the gate is on pages, not on data routes.
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
    // The auth pages themselves (2026-08-29): /account reads the session and
    // was never in the matcher; /login redirects the signed-in away; and
    // /reset-password only renders its form when the recovery session the
    // email link created is actually readable.
    '/account',
    '/login',
    '/forgot-password',
    '/reset-password',
  ],
}
