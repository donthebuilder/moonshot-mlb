// sitemap.xml (2026-09-24 audit, SEO-3). Only real, public, non-duplicate
// URLs. The board is one document however many hashes point into it, so it
// is listed once. /called and /start carry a sport in the query string and
// are genuinely different pages per sport -- three each since LAMP (/called
// carries LAMP's graded nights since Batch 2, 2026-09-26).
const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL || 'https://dashnetwork.vercel.app'

export default function sitemap() {
  const now = new Date()
  const url = (p) => `${SITE_URL}${p}`
  return [
    { url: url('/'), lastModified: now, changeFrequency: 'daily', priority: 1 },
    { url: url('/app'), lastModified: now, changeFrequency: 'hourly', priority: 0.9 },
    { url: url('/start'), lastModified: now, changeFrequency: 'daily', priority: 0.8 },
    { url: url('/start?sport=nfl'), lastModified: now, changeFrequency: 'weekly', priority: 0.7 },
    { url: url('/start?sport=nhl'), lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: url('/called'), lastModified: now, changeFrequency: 'hourly', priority: 0.8 },
    { url: url('/called?sport=nfl'), lastModified: now, changeFrequency: 'daily', priority: 0.7 },
    { url: url('/called?sport=nhl'), lastModified: now, changeFrequency: 'daily', priority: 0.7 },
  ]
}
