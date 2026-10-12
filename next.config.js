/** @type {import('next').NextConfig} */
// Every live payload is fetched at runtime from the Streamlit repo's `data`
// branch (see lib/dataSource.js).
//
// ONE EXCEPTION, and it's deliberate: public/pick_matrix.json. The data branch
// keeps only the most recent graded days -- nine at last check -- and nine days
// is far too thin to say anything about an individual player's record in a
// single pick category. That file is a snapshot of the full 39-day, 3,973-pick
// local archive, shipped with the app so the Track record table has a real
// sample to work from. It is static and dated in its own header; regenerating
// it is a bot-side job. See BOT-DATA-REQUESTS.md.
// ── WHY distDir IS AN ENV VAR (2026-09-07) ────────────────────────────────
// This repo lives on /Volumes/DONX, and a sandboxed session can write there
// but not unlink — so `next build` dies on "EPERM: operation not permitted,
// unlink .next/BUILD_ID" before it compiles a line, and the build can only
// ever be run by hand in Terminal. Reading the dist directory from the
// environment lets a session that cannot delete build into a fresh directory
// instead (NEXT_DIST_DIR=.next-check npx next build) and verify its own work.
// Unset — which is every normal run, including SHIP.sh and Vercel — this is
// exactly the default it always was.
// BUCKETS' ONE SWITCH (2026-10-03). BUCKETS_PUBLIC=on opens the data routes at
// runtime (lib/nba/gate.js) AND, copied here into the build, takes BUCKETS off
// the hidden list in lib/routes.js on the client and the server alike -- so
// setting the one variable and redeploying opens everything together.
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  env: { NEXT_PUBLIC_BUCKETS_PUBLIC: process.env.BUCKETS_PUBLIC || '' },
  // THE NHL'S PICTURES, SAME ORIGIN (fix15, 2026-10-08): the downloadable LAMP cards draw each skater's mug and each
  // club's mark on a canvas. assets.nhle.com sends no CORS header, so the browser refuses it for a canvas that
  // has to export a PNG. Only the two folders the cards read are passed through; nothing else on that host is.
  // RESPONSE HEADERS (F-07, security wave 2). Nothing on the site is framed by another origin or uses the
  // camera, microphone or location. The CSP is REPORT-ONLY: it blocks nothing, the browser only logs what
  // it would have blocked (DevTools console / a report endpoint later). Enforce it only after a clean trial.
  // Derived from the code, not guessed, then checked in a real browser (the first trial caught the bot's
  // data branch, raw.githubusercontent.com, which every board fetches client-side): the browser fetches MLB stats (statsapi.mlb.com), ESPN (site.web.api),
  // NHL (api-web / api.nhle.com) from client components; images come from ESPN's CDN, mlbstatic and nhle
  // (the NHL ones mostly through the /cdn/nhle rewrite below); Vercel Analytics loads from the site itself
  // in production (/_vercel/insights). 'unsafe-inline' stays for scripts and styles because Next's own
  // bootstrap, the front door's hash script and styled-jsx are inline and there is no per-request nonce.
  // No 'unsafe-eval': production Next does not need it (dev does, and dev is not what this serves).
  async headers() {
    const csp = [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com https://vercel.live",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https://a.espncdn.com https://img.mlbstatic.com https://midfield.mlbstatic.com https://assets.nhle.com https://statsapi.mlb.com",
      "font-src 'self' data:",
      "connect-src 'self' https://raw.githubusercontent.com https://statsapi.mlb.com https://site.web.api.espn.com https://site.api.espn.com https://api-web.nhle.com https://api.nhle.com https://vitals.vercel-insights.com https://vercel.live",
      "worker-src 'self' blob:",
      "manifest-src 'self'",
      "media-src 'self' data: blob:",
      "frame-src https://vercel.live",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'self'",
    ].join('; ')
    // user-specific API answers: never stored by a shared cache (audit L3). Set here so every return path of
    // the route is covered, errors included.
    const noStore = [{ key: 'Cache-Control', value: 'private, no-store' }]
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Content-Security-Policy-Report-Only', value: csp },
        ],
      },
      { source: '/api/dash/state', headers: noStore },
      { source: '/api/dash/push/:path*', headers: noStore },
      { source: '/api/admin/:path*', headers: noStore },
    ]
  },
  async rewrites() {
    return [
      { source: '/cdn/nhle/mugs/:path*', destination: 'https://assets.nhle.com/mugs/:path*' },
      { source: '/cdn/nhle/logos/:path*', destination: 'https://assets.nhle.com/logos/:path*' },
    ]
  },
}

module.exports = nextConfig
