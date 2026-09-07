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
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || '.next',
}

module.exports = nextConfig
