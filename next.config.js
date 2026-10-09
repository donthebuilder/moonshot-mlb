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
  distDir: process.env.NEXT_DIST_DIR || '.next',
  env: { NEXT_PUBLIC_BUCKETS_PUBLIC: process.env.BUCKETS_PUBLIC || '' },
  // THE NHL'S PICTURES, SAME ORIGIN (fix15, 2026-10-08): the downloadable LAMP cards draw each skater's mug and each
  // club's mark on a canvas. assets.nhle.com sends no CORS header, so the browser refuses it for a canvas that
  // has to export a PNG. Only the two folders the cards read are passed through; nothing else on that host is.
  async rewrites() {
    return [
      { source: '/cdn/nhle/mugs/:path*', destination: 'https://assets.nhle.com/mugs/:path*' },
      { source: '/cdn/nhle/logos/:path*', destination: 'https://assets.nhle.com/logos/:path*' },
    ]
  },
}

module.exports = nextConfig
