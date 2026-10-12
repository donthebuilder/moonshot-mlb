// THE PUBLISHED SUBSET (2026-10-12, accuracy loop). Reads lib/learn/published.json, which
// `node scripts/learn-report.mjs <sport> --publish` writes (the lib/nfl/angleBacktest.json pattern: a script
// writes a small file, a person commits it; no cron, no polling, nothing stored in the database).
// The file holds counts, rates with n and 95% ranges, and at most three description lines per market, each only
// when the feature cleared every test in lib/learn/separators.js. The private report stays in .claude-notes/learn/.
import published from './published.json'

/** One sport's published entry, or null (no file for it yet, or a hidden sport). */
export function learnFor(sport) {
  const e = published?.sports?.[String(sport)]
  return e && Array.isArray(e.markets) && e.markets.length ? e : null
}
