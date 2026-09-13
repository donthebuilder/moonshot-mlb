// 2026-09-13 DIAGNOSTIC — which ESPN hosts can Vercel actually reach?
// site.api.espn.com answers 403 from Vercel's egress (confirmed live, with a
// browser UA). This tries the alternates in one call so the fix lands in one
// push. Auth-gated like the tick; delete once liveSlate.js has its answer.
import { timingSafeEqual } from 'node:crypto'
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
const URLS = [
  'https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
  'https://site.web.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard',
  'https://site.web.api.espn.com/apis/v2/scoreboard/header?sport=football&league=nfl',
  'https://cdn.espn.com/core/nfl/scoreboard?xhr=1&limit=50',
  'https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events?limit=50',
  'https://www.espn.com/nfl/scoreboard',
  'https://static.www.nfl.com/liveupdate/scores/scores.json',
]
const HEADER_SETS = {
  bare: {},
  browser: { 'User-Agent': UA, 'Accept': 'application/json, text/plain, */*', 'Accept-Language': 'en-US,en;q=0.9', 'Referer': 'https://www.espn.com/', 'Origin': 'https://www.espn.com' },
}
function authorized(request) {
  const supplied = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') || ''
  if (!supplied) return false
  return [process.env.CRON_SECRET, process.env.FRANCHISE_CRON_SECRET, process.env.CALLEDIT_SECRET].filter(Boolean).some((e) => {
    const a = Buffer.from(e), b = Buffer.from(supplied); return a.length === b.length && timingSafeEqual(a, b)
  })
}
export async function GET(request) {
  if (!authorized(request)) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const out = []
  for (const url of URLS) for (const [hs, headers] of Object.entries(HEADER_SETS)) {
    const t = Date.now()
    try {
      const res = await fetch(url, { cache: 'no-store', headers, signal: AbortSignal.timeout(8000) })
      const body = await res.text()
      out.push({ url, hs, status: res.status, ms: Date.now() - t, bytes: body.length, head: body.slice(0, 80).replace(/\s+/g, ' ') })
    } catch (err) { out.push({ url, hs, error: String(err?.message || err), ms: Date.now() - t }) }
  }
  return Response.json({ region: process.env.VERCEL_REGION || null, out })
}
