// 2026-09-13: retired. This was a temporary diagnostic that found the NFL
// live pipeline's two-host bug (site.api.espn.com 403s from Vercel; use
// site.web.api.espn.com) and the 'use client' box-score failure. Kept as a
// 410 rather than deleted because this mount refuses git rm (unlink denied);
// safe to delete the file from a real terminal.
export const dynamic = 'force-dynamic'
export async function GET() {
  return Response.json({ gone: 'probe retired 2026-09-13' }, { status: 410 })
}
