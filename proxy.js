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

  // THE GATE, PARTIALLY REVERSED (2026-09-06). It went up 2026-09-05 on
  // Donovan's own call ("the whole site needs to be behind a sign up... no
  // just free link and look around"), then came back down for /app after
  // hearing the other side of it: a brand-new site asking for an email
  // before anyone has seen what's on it costs more visitors than the account
  // is worth. The account did not go away — it is what saves your
  // watchlist, your picks, and turns on alerts (lib/dash/sync.js) — it just
  // stopped being the price of admission to look. Header.js and
  // NflHeader.js each carry a Sign-up pill now so the offer is visible
  // without being a wall.
  //
  // /fantasy stays gated: FRANCHISE is not content to browse, it is a real
  // roster tied to a real account — there is nothing to see there without
  // one. /account obviously stays gated too.
  //
  //   /            the front door — it IS the sign-up form
  //   /app         MOONSHOT + TUDDY — open again, see above
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

const GATED = [/^\/fantasy(\/|$)/, /^\/account(\/|$)/]
const isGated = (pathname) => GATED.some((re) => re.test(pathname))

// THE MATCHER IS THE WHOLE NETWORK NOW (2026-08-28).
//
// It was scoped to Franchise because Franchise was the only thing with an
// account. The account is network-wide as of this change — the DASH front door
// signs you in, and MOONSHOT and TUDDY save your watchlist and picks to it
// (lib/dash/sync.js) — so the session cookie has to be refreshed on the pages
// that read it, not just on /fantasy.
//
// THE GATE LIVES HERE TOO, for /fantasy and /account only — see isGated
// above. It briefly covered /app as well (2026-09-05 to 2026-09-06): MOONSHOT
// and TUDDY are back to "fully readable signed out," which is what the
// original rule said before that one-day detour. /api/dash/:path* still
// answers a signed-out request with an empty bag and a 200 either way — the
// gate was always on pages, not on data routes.
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
