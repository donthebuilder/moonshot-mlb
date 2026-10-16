// GET /api/nfl/results-digest?season=2026&mode=week&week=6 -- what TUDDY's Home needs from the graded weekly files, and no more.
//
// Home printed its RECORD tile and The Six's per-market record from `totals` alone, but read every graded week's whole file
// (nfl_results_<season>_wNN.json, ~75 KB each) from the browser, plus four preseason probes that 404 on a cold visit
// (lib/nfl/resultsArchive.js: a browser that has never stored a miss asks p01..p04 again). The files are read here instead,
// once for every visitor, and only { [weekKey]: { totals } } goes out. A week counts when it has at least one graded pick
// (the archive's own hasGrade rule), so the digest and the archive agree on which weeks exist.
//
// resultsArchive.js is a 'use client' module, so its file naming and hasGrade rule are repeated here, not imported
// (lib/stories/nfl.js does the same); lib/nfl/resultsDigest.js holds the one copy the digest's tests and the hook share.
import { NFL_DATA_BASE } from '../../../../lib/nfl/dataSource'
import { digestKeys, digestUrl, digestOf } from '../../../../lib/nfl/resultsDigest'

export const dynamic = 'force-dynamic'   // the answer depends on the query; the file reads below and the response are cached

export async function GET(request) {
  const q = new URL(request.url).searchParams
  const season = Number(q.get('season'))
  const mode = q.get('mode') === 'preseason' ? 'preseason' : 'week'
  const week = Number(q.get('week')) || 0
  if (!Number.isInteger(season) || season < 2020 || season > 2100) return Response.json({ error: 'season' }, { status: 400 })
  const got = await Promise.all(digestKeys(season, mode, week).map(async (k) => {
    try {
      const r = await fetch(digestUrl(NFL_DATA_BASE, season, k), { next: { revalidate: 300 } })
      if (r.status === 404) return [k, null, false]   // a week that was never graded
      if (!r.ok) return [k, null, true]
      return [k, digestOf(await r.json()), false]
    } catch { return [k, null, true] }
  }))
  const failed = got.some(([, , bad]) => bad)
  const weeks = Object.fromEntries(got.filter(([, j]) => j).map(([k, j]) => [k, j]))
  // a read that failed is not "no such week": do not let the CDN keep a partial answer
  return Response.json({ season, weeks, partial: failed }, { headers: { 'Cache-Control': failed ? 'no-store' : 'public, s-maxage=300, stale-while-revalidate=600' } })
}
