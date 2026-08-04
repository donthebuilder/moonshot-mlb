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
const nextConfig = {
  reactStrictMode: true,
}

module.exports = nextConfig
