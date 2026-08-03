/** @type {import('next').NextConfig} */
// moonshot-mlb ships no data of its own -- every payload is fetched at runtime
// from the Streamlit repo's `data` branch (see lib/dataSource.js). The old
// /data/* cache-control rule is gone with it; there is nothing local to serve.
const nextConfig = {
  reactStrictMode: true,
}

module.exports = nextConfig
