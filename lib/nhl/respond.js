// The one response shape for every app/api/lamp route. Server-only helpers.
//
// ERRORS ARE VISIBLE AND USEFUL (project rule 25): the browser gets a short,
// honest reason it can print — LIVE DATA DELAYED — and the server log gets
// the real one. A failed upstream call is a 502 with no-store, never a
// cached error and never a fake payload. A bad parameter is a 400.
import { lastNhlError } from './api'

export function ok(body, sMaxAge) {
  return Response.json(body, {
    headers: {
      // The CDN answers the browser's poll for sMaxAge seconds without
      // running this function; after that it serves the stale copy while it
      // refreshes once in the background. See lib/nhl/api.js for the layers.
      'Cache-Control': `public, s-maxage=${sMaxAge}, stale-while-revalidate=${sMaxAge * 2}`,
    },
  })
}

export function bad(reason) {
  return Response.json({ error: 'BAD REQUEST', detail: reason }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
}

export function delayed(where, err) {
  console.error(`[lamp] ${where}: ${err?.message || err}`, lastNhlError() || '')
  // The league answering 404 is an answer: there is no such game / day.
  // Calling that "delayed" would send someone back to wait for a thing
  // that does not exist.
  if (err?.status === 404) {
    return Response.json(
      { error: 'NOT FOUND', detail: 'The league has nothing under that id.', where },
      { status: 404, headers: { 'Cache-Control': 'no-store' } },
    )
  }
  return Response.json(
    { error: 'LIVE DATA DELAYED', detail: 'Waiting on the league feed.', where },
    { status: 502, headers: { 'Cache-Control': 'no-store' } },
  )
}
