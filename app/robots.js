// robots.txt (2026-09-24 audit, SEO-3). The public product is the front door,
// the board, /start and the /called record. Everything else is an account,
// an API, or an internal tool.
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://dashnetwork.vercel.app'

export default function robots() {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/app', '/start', '/called'],
        disallow: ['/api/', '/account', '/fantasy', '/login', '/forgot-password', '/reset-password', '/auth/', '/ask', '/dash'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  }
}
